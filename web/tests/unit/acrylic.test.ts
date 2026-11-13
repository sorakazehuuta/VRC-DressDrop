import { describe, expect, it, vi } from "vitest";
import { ACRYLIC_LIMITS, normalizeAcrylic, parseAcrylic, type PrintOutline } from "@/lib/templates/acrylic";
import { buildEdgeMesh, printFaces, type FaceMap } from "@/lib/templates/acrylic-edge";
import { applyOutline } from "@/lib/templates/outline";
import { parseEditorParams, type PrintParams } from "@/lib/templates/params";
import { slotsSchema } from "@/lib/templates/schema";
import { versionHash } from "@/lib/works/versions";

vi.mock("server-only", () => ({}));
const { readUnityMesh, writeUnityMesh, prefabObjectMeshGuid } = await import("@/lib/package/unity-mesh");

const OUTLINE: PrintOutline = { width: 0.04, color: "#ffffff", opacity: 0.3, edgeOpacity: 0.7, tab: 0.3, rectBottom: 0.05, cornerRadius: 0.06 };

const slots = slotsSchema.parse([
  { key: "print", type: "print", label: "絵", labelEn: "Artwork", material: "Mat_Print", aspect: 0.6875, textureSize: 512, outline: OUTLINE },
  { key: "base", type: "color", label: "台座", labelEn: "Base", material: "Mat_Base" },
]);
const printParams = (extra: Partial<PrintParams> = {}) => ({
  kind: "print",
  imageId: null,
  scaleX: 1,
  scaleY: 1,
  keepAspect: true,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  brightness: 100,
  saturation: 100,
  ...extra,
});

describe("アクリルの形（params の acrylic）", () => {
  it("項目のない以前の作品は、同じ JSON（同じ版のハッシュ）のまま", () => {
    const before = { version: 1, slots: { print: printParams(), base: { kind: "color", color: "#ffffff" } } };
    const parsed = parseEditorParams(before, slots);
    expect("acrylic" in parsed.slots.print).toBe(false);
    expect(versionHash("t", parsed)).toBe(versionHash("t", parseEditorParams(JSON.parse(JSON.stringify(before)), slots)));
  });

  it("テンプレートの既定（絵の形・既定の幅）なら項目を持たない", () => {
    const raw = { version: 1, slots: { print: printParams({ acrylic: { shape: "cutout", border: 0.04 } }) } };
    expect("acrylic" in parseEditorParams(raw, slots).slots.print).toBe(false);
    expect(normalizeAcrylic({ shape: "cutout", border: 0.0400000001 }, OUTLINE)).toBeUndefined();
  });

  it("既定と違う形は残し、範囲を丸める", () => {
    expect(parseAcrylic({ shape: "cutout", border: 0.5 }, OUTLINE)).toEqual({ shape: "cutout", border: ACRYLIC_LIMITS.border.max });
    expect(parseAcrylic({ shape: "rect", width: 0.1, height: 2, rounded: false }, OUTLINE)).toEqual({ shape: "rect", width: 0.3, height: 1, rounded: false });
    const a = parseEditorParams({ version: 1, slots: { print: printParams({ acrylic: { shape: "rect", width: 0.8, height: 0.6, rounded: true } }) } }, slots);
    expect((a.slots.print as PrintParams).acrylic).toEqual({ shape: "rect", width: 0.8, height: 0.6, rounded: true });
  });

  it("縁取りのない印刷面・不正な値では項目を持たない", () => {
    expect(parseAcrylic({ shape: "rect", width: 1, height: 1, rounded: true }, undefined)).toBeUndefined();
    expect(parseAcrylic({ shape: "star" }, OUTLINE)).toBeUndefined();
  });
});

// 透明な面に、不透明な四角（絵）を置く
function canvas(w: number, h: number, art: { x0: number; y0: number; x1: number; y1: number }) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = art.y0; y < art.y1; y++)
    for (let x = art.x0; x < art.x1; x++) {
      const i = (y * w + x) * 4;
      data[i] = 255;
      data[i + 3] = 255;
    }
  return data;
}
const alphaAt = (data: Uint8ClampedArray, w: number, x: number, y: number) => data[(y * w + x) * 4 + 3];

function bounds(loops: [number, number][][]) {
  const pts = loops.flat();
  return {
    minU: Math.min(...pts.map((p) => p[0])),
    maxU: Math.max(...pts.map((p) => p[0])),
    minT: Math.min(...pts.map((p) => p[1])),
    maxT: Math.max(...pts.map((p) => p[1])),
  };
}

describe("板の外周の線", () => {
  const w = 600;
  const h = 900;

  it("絵の形: 縁取りの幅だけ外に、1 本の輪ができる（差し込む帯で面の下端まで）", () => {
    const data = canvas(w, h, { x0: 200, y0: 200, x1: 400, y1: 500 });
    const loops = applyOutline(data, w, h, OUTLINE, { shape: "cutout", border: 0.05 });
    expect(loops).toHaveLength(1);
    const b = bounds(loops);
    const r = 0.05 * w; // 30px
    expect(b.minU * w).toBeCloseTo(200 - r, -1);
    expect(b.maxU * w).toBeCloseTo(400 + r, -1);
    expect(b.minT * h).toBeCloseTo(200 - r, -1);
    expect(b.maxT).toBe(1);
    // 点は間引かれている
    expect(loops[0].length).toBeLessThan(200);
  });

  it("線の向き: 進む向きの cross > 0 の側が板の内側", () => {
    const data = canvas(w, h, { x0: 200, y0: 200, x1: 400, y1: 500 });
    const [loop] = applyOutline(data, w, h, OUTLINE);
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
      const [x0, y0] = loop[i];
      const [x1, y1] = loop[(i + 1) % loop.length];
      area += x0 * y1 - x1 * y0;
    }
    // 内側が cross > 0 の側の輪は、面積の符号が正
    expect(area).toBeGreaterThan(0);
  });

  it("四角: 大きさのとおりの板になり、外の絵は切り落とす", () => {
    const data = canvas(w, h, { x0: 0, y0: 0, x1: w, y1: h });
    const loops = applyOutline(data, w, h, OUTLINE, { shape: "rect", width: 0.5, height: 0.5, rounded: false });
    expect(loops).toHaveLength(1);
    const b = bounds(loops);
    expect(b.minU).toBeCloseTo(0.25, 3);
    expect(b.maxU).toBeCloseTo(0.75, 3);
    const bottom = h * (1 - OUTLINE.rectBottom);
    expect(b.minT * h).toBeCloseTo(bottom - bottom * 0.5, 1);
    expect(b.maxT).toBe(1); // 差し込む帯
    expect(alphaAt(data, w, 10, 10)).toBe(0); // 四角の外
    expect(alphaAt(data, w, 300, 600)).toBe(255); // 四角の中の絵
    expect(alphaAt(data, w, 300, h - 2)).toBeGreaterThan(0); // 帯
    expect(alphaAt(data, w, 160, h - 2)).toBe(0); // 帯の外
  });

  it("角を丸めると、角の画素は透明になる", () => {
    const data = canvas(w, h, { x0: 0, y0: 0, x1: w, y1: h });
    applyOutline(data, w, h, OUTLINE, { shape: "rect", width: 1, height: 1, rounded: true });
    expect(alphaAt(data, w, 0, 0)).toBe(0);
    expect(alphaAt(data, w, 300, 3)).toBe(255);
  });

  it("絵がなければ線もない", () => {
    expect(applyOutline(new Uint8ClampedArray(100 * 100 * 4), 100, 100, OUTLINE)).toEqual([]);
  });
});

describe("側面のメッシュ", () => {
  // Unity のアクリルスタンドと同じ配置: 表は z=+0.0015、裏は z=-0.0015。画像の左（u=0）が +X、上（t=0）が上
  const front: FaceMap = { origin: [0.055, 0.163, 0.0015], u: [-0.11, 0, 0], t: [0, -0.16, 0] };
  const back: FaceMap = { ...front, origin: [0.055, 0.163, -0.0015] };
  const square: [number, number][] = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.75, 0.75],
    [0.25, 0.75],
  ];

  it("輪の辺ごとに 2 枚の三角形を作り、法線は外を向く", () => {
    const mesh = buildEdgeMesh([square], front, back);
    expect(mesh.indices.length).toBe(4 * 2 * 3);
    // 上の辺（t=0.25）の法線は +Y
    expect(mesh.normals[1]).toBeCloseTo(1, 5);
    // 三角形の表（cross(b-a, c-a)）が法線と同じ向き
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const p = [0, 1, 2].map((k) => Array.from(mesh.positions.slice(mesh.indices[i + k] * 3, mesh.indices[i + k] * 3 + 3)));
      const e1 = p[1].map((v, k) => v - p[0][k]);
      const e2 = p[2].map((v, k) => v - p[0][k]);
      const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const n = Array.from(mesh.normals.slice(mesh.indices[i] * 3, mesh.indices[i] * 3 + 3));
      expect(c[0] * n[0] + c[1] * n[1] + c[2] * n[2]).toBeGreaterThan(0);
    }
  });

  it("プリントの面のメッシュから、表と裏の対応を求められる", () => {
    // 表の 2 枚と裏の 2 枚（アクリルスタンドのテンプレートと同じ並び。UV は t に直したもの）
    const positions = [0.055, 0.003, 0.0015, 0.055, 0.163, 0.0015, -0.055, 0.163, 0.0015, 0.055, 0.003, -0.0015, -0.055, 0.163, -0.0015, 0.055, 0.163, -0.0015];
    const uvT = [0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0];
    const faces = printFaces(positions, uvT, [0, 1, 2, 3, 4, 5]);
    expect(faces).not.toBeNull();
    const [f, b] = faces!;
    expect(f.origin.map((v) => Number(v.toFixed(4)))).toEqual([0.055, 0.163, 0.0015]);
    expect(f.u.map((v) => Number(v.toFixed(4)))).toEqual([-0.11, 0, 0]);
    expect(f.t.map((v) => Number(v.toFixed(4)))).toEqual([0, -0.16, 0]);
    expect(b.origin[2]).toBeCloseTo(-0.0015, 6);
  });
});

// テンプレートの仮のメッシュ（Unity が書き出した形）
const MESH_YAML = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!43 &4300000
Mesh:
  m_Name: AcrylicStand_Edge
  serializedVersion: 11
  m_SubMeshes:
  - serializedVersion: 2
    firstByte: 0
    indexCount: 3
    topology: 0
    baseVertex: 0
    firstVertex: 0
    vertexCount: 3
    localAABB:
      m_Center: {x: 0, y: 0, z: 0}
      m_Extent: {x: 1, y: 1, z: 0}
  m_Shapes:
    vertices: []
  m_IndexFormat: 0
  m_IndexBuffer: 000001000200
  m_VertexData:
    serializedVersion: 3
    m_VertexCount: 3
    m_Channels:
${Array.from({ length: 14 }, (_, i) => `    - stream: 0\n      offset: ${i === 0 ? 0 : i === 4 ? 12 : 0}\n      format: 0\n      dimension: ${i === 0 ? 3 : i === 4 ? 2 : 0}`).join("\n")}
    m_DataSize: 60
    _typelessdata: ${Buffer.from(new Float32Array([0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0]).buffer).toString("hex")}
  m_CompressedMesh:
    m_UVInfo: 0
  m_LocalAABB:
    m_Center: {x: 0, y: 0, z: 0}
    m_Extent: {x: 1, y: 1, z: 0}
  m_MeshUsageFlags: 0
`;

describe("Unity のメッシュ（.asset の YAML）", () => {
  it("位置・UV・三角形を読める", () => {
    const m = readUnityMesh(MESH_YAML);
    expect(Array.from(m.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(m.uvs)).toEqual([0, 1, 1, 1, 0, 0]);
    expect(Array.from(m.indices)).toEqual([0, 1, 2]);
  });

  it("側面のメッシュに差し替えても、ほかの項目は残り、読み直すと同じ位置になる", () => {
    const mesh = buildEdgeMesh(
      [
        [
          [0.2, 0.2],
          [0.8, 0.2],
          [0.5, 0.8],
        ],
      ],
      { origin: [0, 0, 0.001], u: [1, 0, 0], t: [0, -1, 0] },
      { origin: [0, 0, -0.001], u: [1, 0, 0], t: [0, -1, 0] },
    );
    const yaml = writeUnityMesh(MESH_YAML, mesh);
    expect(yaml).toContain("m_Name: AcrylicStand_Edge");
    expect(yaml).toContain("m_MeshUsageFlags: 0");
    expect(yaml).toContain("m_Shapes:");
    expect(yaml).toMatch(/m_VertexCount: 12\n/);
    expect(yaml).toMatch(/m_DataSize: 288\n/);
    expect(yaml).toMatch(/indexCount: 18\n/);
    expect(yaml.match(/m_LocalAABB:/g)).toHaveLength(1);
    // 読み直し（UV は持たないので位置だけ。読み取りは UV が必要なので、書き出した頂点のデータを直接見る）
    const hex = /_typelessdata: ([0-9a-f]+)/.exec(yaml)![1];
    const floats = new Float32Array(Uint8Array.from(Buffer.from(hex, "hex")).buffer);
    expect(floats[0]).toBeCloseTo(mesh.positions[0], 6);
    expect(floats[6]).toBeCloseTo(mesh.positions[3], 6);
  });

  it("Prefab から、オブジェクトの名前でメッシュの GUID を探せる", () => {
    const prefab = `%YAML 1.1
--- !u!1 &100
GameObject:
  m_Component:
  - component: {fileID: 101}
  - component: {fileID: 102}
  m_Name: Edge
--- !u!33 &102
MeshFilter:
  m_GameObject: {fileID: 100}
  m_Mesh: {fileID: 4300000, guid: 0123456789abcdef0123456789abcdef, type: 2}
`;
    expect(prefabObjectMeshGuid(prefab, "Edge")).toBe("0123456789abcdef0123456789abcdef");
    expect(() => prefabObjectMeshGuid(prefab, "Print")).toThrow();
  });
});
