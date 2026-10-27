import type { PreviewExtras } from "../../src/lib/templates/view";

// Unity から書き出したメッシュ（VRPrintLabTemplateBaker.cs の bake.json / mesh.bin）を glb にする。
// Unity は左手座標系なので X を反転し、面の向き（頂点の並び）も逆にする。
// UV は Unity が下端 v=0、glTF が上端 v=0 なので上下を反転する。マテリアルのタイリング・オフセットは UV に焼き込む
// （プリント面はサイトが作ったテクスチャ全体を貼るため、タイリングを使わない。購入した unitypackage でも 1 / 0 にする）

export type BakeMaterial = {
  name: string;
  path: string;
  shader: string;
  color: { r: number; g: number; b: number; a: number };
  glossiness: number;
  metallic: number;
  mode: "opaque" | "cutout" | "transparent";
  cutoff: number;
  emission: { r: number; g: number; b: number; a: number };
  textureScale: { x: number; y: number };
  textureOffset: { x: number; y: number };
  texturePath: string;
};

export type BakeOutput = {
  prefab: string;
  floatCount: number;
  meshes: {
    name: string;
    vertexCount: number;
    positionOffset: number;
    normalOffset: number;
    uvOffset: number;
    hasUv: boolean;
    submeshes: { indexOffset: number; indexCount: number; material: string }[];
  }[];
  materials: BakeMaterial[];
  warnings: string[];
};

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function buildGlb(
  bake: BakeOutput,
  bin: Buffer,
  // viewMaterial: 最初の視点を合わせるプリント面のマテリアル（その面の UV の中心の向きを記録する）
  opts: { textures: Map<string, Buffer>; printMaterials: Set<string>; viewMaterial?: string; extras: { vrprintlab: PreviewExtras } },
) {
  const { textures, printMaterials, viewMaterial, extras } = opts;
  let frame: { facing: [number, number, number]; up?: [number, number, number] } | undefined;
  const floats = new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bake.floatCount * 4));
  const ints = new Int32Array(bin.buffer.slice(bin.byteOffset + bake.floatCount * 4, bin.byteOffset + bin.byteLength));

  const chunks: Buffer[] = [];
  let byteLength = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  function addView(data: Buffer, target?: number) {
    const padding = (4 - (byteLength % 4)) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      byteLength += padding;
    }
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length, ...(target ? { target } : {}) });
    chunks.push(data);
    byteLength += data.length;
    return bufferViews.length - 1;
  }
  function addAccessor(array: Float32Array | Uint32Array, type: "VEC3" | "VEC2" | "SCALAR", withBounds = false) {
    const size = type === "VEC3" ? 3 : type === "VEC2" ? 2 : 1;
    const view = addView(Buffer.from(array.buffer, array.byteOffset, array.byteLength), array instanceof Uint32Array ? 34963 : 34962);
    const accessor: Record<string, unknown> = {
      bufferView: view,
      componentType: array instanceof Uint32Array ? 5125 : 5126,
      count: array.length / size,
      type,
    };
    if (withBounds) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < array.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], array[i + k]);
          max[k] = Math.max(max[k], array[i + k]);
        }
      }
      accessor.min = min;
      accessor.max = max;
    }
    accessors.push(accessor);
    return accessors.length - 1;
  }

  // マテリアル（同じ名前は1つにまとめる。エディタはマテリアル名で色・プリントを差し替える）
  const images: Record<string, unknown>[] = [];
  const textureDefs: Record<string, unknown>[] = [];
  const materialIndex = new Map<string, number>();
  const materials: Record<string, unknown>[] = [];
  for (const m of bake.materials) {
    if (materialIndex.has(m.name)) continue;
    const pbr: Record<string, unknown> = {
      baseColorFactor: [toLinear(m.color.r), toLinear(m.color.g), toLinear(m.color.b), clamp01(m.color.a)],
      metallicFactor: clamp01(m.metallic),
      roughnessFactor: clamp01(1 - m.glossiness),
    };
    const image = m.texturePath ? textures.get(m.texturePath) : undefined;
    if (image) {
      const mimeType = m.texturePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      images.push({ bufferView: addView(image), mimeType });
      textureDefs.push({ source: images.length - 1 });
      pbr.baseColorTexture = { index: textureDefs.length - 1 };
    }
    const material: Record<string, unknown> = { name: m.name, pbrMetallicRoughness: pbr };
    if (m.mode === "cutout") {
      material.alphaMode = "MASK";
      material.alphaCutoff = m.cutoff;
    } else if (m.mode === "transparent") {
      material.alphaMode = "BLEND";
    }
    const emissive = [m.emission.r, m.emission.g, m.emission.b].map((c) => clamp01(toLinear(c)));
    if (emissive.some((c) => c > 0)) material.emissiveFactor = emissive;
    materials.push(material);
    materialIndex.set(m.name, materials.length - 1);
  }
  const materialByName = new Map(bake.materials.map((m) => [m.name, m]));

  // エディタのカメラは原点を少し上から見る位置にあるため、モデル全体の中心を原点に合わせる
  // （床に置く形で作られたモデルを、そのままだと下から見上げることになる）
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of bake.meshes) {
    for (const sub of mesh.submeshes) {
      for (let i = 0; i < sub.indexCount; i++) {
        const p = mesh.positionOffset + ints[sub.indexOffset + i] * 3;
        const v = [-floats[p], floats[p + 1], floats[p + 2]];
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], v[k]);
          max[k] = Math.max(max[k], v[k]);
        }
      }
    }
  }
  const center = min.map((m, k) => (Number.isFinite(m) ? (m + max[k]) / 2 : 0));

  const meshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  let triangles = 0;
  const aspects = new Map<string, { u: number; v: number }>();
  for (const mesh of bake.meshes) {
    const primitives: Record<string, unknown>[] = [];
    for (const sub of mesh.submeshes) {
      const mat = materialByName.get(sub.material);
      const tiled = mat && !printMaterials.has(mat.name);
      const scale = tiled ? mat.textureScale : { x: 1, y: 1 };
      const offset = tiled ? mat.textureOffset : { x: 0, y: 0 };
      // 面ごとにマテリアルのタイリングが違うことがあるため、使う頂点だけを取り出して primitive ごとに持つ
      const remap = new Map<number, number>();
      const indices = new Uint32Array(sub.indexCount);
      for (let i = 0; i < sub.indexCount; i += 3) {
        // 鏡像にしたので、面の表裏が変わらないよう頂点の順番を入れ替える
        const tri = [ints[sub.indexOffset + i], ints[sub.indexOffset + i + 2], ints[sub.indexOffset + i + 1]];
        for (let k = 0; k < 3; k++) {
          let n = remap.get(tri[k]);
          if (n === undefined) {
            n = remap.size;
            remap.set(tri[k], n);
          }
          indices[i + k] = n;
        }
      }
      const count = remap.size;
      const position = new Float32Array(count * 3);
      const normal = new Float32Array(count * 3);
      const uv = new Float32Array(count * 2);
      for (const [source, n] of remap) {
        const p = mesh.positionOffset + source * 3;
        const q = mesh.normalOffset + source * 3;
        const t = mesh.uvOffset + source * 2;
        position.set([-floats[p] - center[0], floats[p + 1] - center[1], floats[p + 2] - center[2]], n * 3);
        normal.set([-floats[q], floats[q + 1], floats[q + 2]], n * 3);
        uv.set([floats[t] * scale.x + offset.x, 1 - (floats[t + 1] * scale.y + offset.y)], n * 2);
      }
      triangles += sub.indexCount / 3;
      if (printMaterials.has(sub.material)) measureAspect(aspects, sub.material, position, uv, indices);
      if (!frame && sub.material === viewMaterial) frame = printCenterFrame(position, normal, uv, indices);
      primitives.push({
        attributes: {
          POSITION: addAccessor(position, "VEC3", true),
          NORMAL: addAccessor(normal, "VEC3"),
          ...(mesh.hasUv ? { TEXCOORD_0: addAccessor(uv, "VEC2") } : {}),
        },
        indices: addAccessor(indices, "SCALAR"),
        material: materialIndex.get(sub.material),
      });
    }
    meshes.push({ name: mesh.name, primitives });
    nodes.push({ name: mesh.name, mesh: meshes.length - 1 });
  }

  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "VRPrintLab templates:prepare", extras: { ...extras, vrprintlab: { ...extras.vrprintlab, ...frame } } },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: 0 }],
  };
  if (images.length) {
    json.images = images;
    json.textures = textureDefs;
  }
  const binChunk = Buffer.concat([...chunks, Buffer.alloc((4 - (byteLength % 4)) % 4)]);
  (json.buffers as { byteLength: number }[])[0].byteLength = binChunk.length;
  let jsonChunk = Buffer.from(JSON.stringify(json), "utf8");
  jsonChunk = Buffer.concat([jsonChunk, Buffer.alloc((4 - (jsonChunk.length % 4)) % 4, 0x20)]);

  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHeader = (length: number, type: string) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(length, 0);
    h.write(type, 4, "ascii");
    return h;
  };
  return {
    glb: Buffer.concat([header, chunkHeader(jsonChunk.length, "JSON"), jsonChunk, chunkHeader(binChunk.length, "BIN\0"), binChunk]),
    triangles,
    // プリント面の実寸の 幅÷高さ（テクスチャ全体を貼ったときに画像が伸びない aspect の値）
    facing: frame?.facing,
    printAspects: new Map([...aspects].filter(([, a]) => a.v > 0).map(([name, a]) => [name, a.u / a.v])),
  };
}

const round3 = (v: number[]) => v.map((x) => Math.round(x * 1000) / 1000) as [number, number, number];

// UV の中心（画像の中心が貼られる位置）を含む三角形の、法線（facing）と画像の上方向（up）。見つからなければ undefined
function printCenterFrame(
  position: Float32Array,
  normal: Float32Array,
  uv: Float32Array,
  indices: Uint32Array,
): { facing: [number, number, number]; up?: [number, number, number] } | undefined {
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    const [ax, ay, bx, by, cx, cy] = [uv[a * 2], uv[a * 2 + 1], uv[b * 2], uv[b * 2 + 1], uv[c * 2], uv[c * 2 + 1]];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;
    const w1 = ((by - cy) * (0.5 - cx) + (cx - bx) * (0.5 - cy)) / det;
    const w2 = ((cy - ay) * (0.5 - cx) + (ax - cx) * (0.5 - cy)) / det;
    const w3 = 1 - w1 - w2;
    if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
    const n = [0, 1, 2].map((k) => normal[a * 3 + k] * w1 + normal[b * 3 + k] * w2 + normal[c * 3 + k] * w3);
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-6) continue;
    // glTF の UV は v が下向きなので、画像の上方向は「v が減る向き」（-dP/dv）
    const p = (k: number) => [position[k * 3], position[k * 3 + 1], position[k * 3 + 2]];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const e1 = [0, 1, 2].map((k) => pb[k] - pa[k]);
    const e2 = [0, 1, 2].map((k) => pc[k] - pa[k]);
    const [du1, dv1, du2, dv2] = [bx - ax, by - ay, cx - ax, cy - ay];
    const uvDet = du1 * dv2 - du2 * dv1;
    const up = [0, 1, 2].map((k) => -(e2[k] * du1 - e1[k] * du2) / uvDet);
    const upLen = Math.hypot(up[0], up[1], up[2]);
    return {
      facing: round3(n.map((v) => v / len)),
      ...(upLen > 1e-9 ? { up: round3(up.map((v) => v / upLen)) } : {}),
    };
  }
  return undefined;
}

// UV の u・v 方向に 1 進んだときの実際の長さを、三角形の面積で重み付けして足し合わせる
function measureAspect(
  aspects: Map<string, { u: number; v: number }>,
  material: string,
  position: Float32Array,
  uv: Float32Array,
  indices: Uint32Array,
) {
  const sum = aspects.get(material) ?? { u: 0, v: 0 };
  const p = (i: number) => [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]];
  const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    const [p0, p1, p2] = [p(a), p(b), p(c)];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const du1 = uv[b * 2] - uv[a * 2];
    const dv1 = uv[b * 2 + 1] - uv[a * 2 + 1];
    const du2 = uv[c * 2] - uv[a * 2];
    const dv2 = uv[c * 2 + 1] - uv[a * 2 + 1];
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue;
    const dPdu = e1.map((x, k) => (x * dv2 - e2[k] * dv1) / det);
    const dPdv = e2.map((x, k) => (x * du1 - e1[k] * du2) / det);
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const area = len(cross) / 2;
    sum.u += area * len(dPdu);
    sum.v += area * len(dPdv);
  }
  aspects.set(material, sum);
}
