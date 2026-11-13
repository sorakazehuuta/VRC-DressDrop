// Unity のメッシュのアセット（.asset、テキスト形式の YAML）を読み書きする。
// アクリルの板の側面のメッシュを作品ごとに作り直すために使う（テンプレートの仮のメッシュの中身を差し替える）。
// 対応するのは、頂点のデータが 1 つのストリームで、どの要素も 32bit の浮動小数点数のメッシュ（Unity のスクリプトで作ったもの）。
// templates:check からも使うため、"server-only" や "@/..." を import しないこと

type Channel = { stream: number; offset: number; format: number; dimension: number };

// m_Channels の並び（Unity 2019 以降）: 位置・法線・接線・色・UV0〜7・ボーンの重み・ボーンの番号
const CH_POSITION = 0;
const CH_UV0 = 4;
const CHANNEL_COUNT = 14;

// 「  key:」の行から、次の同じ字下げの項目の手前まで（Unity の YAML はリストの「- 」を親と同じ字下げで書く）
function block(yaml: string, key: string, indent: string) {
  const start = new RegExp(`^${indent}${key}:.*(\\r?\\n|$)`, "m").exec(yaml);
  if (!start) throw new Error(`メッシュに ${key} がありません`);
  const bodyStart = start.index + start[0].length;
  const next = new RegExp(`^(?:${indent}[^ \\-\\r\\n]|[^ \\r\\n])`, "m").exec(yaml.slice(bodyStart));
  const end = next ? bodyStart + next.index : yaml.length;
  return { start: start.index, end, text: yaml.slice(start.index, end) };
}

function readChannels(vertexData: string): Channel[] {
  const channels: Channel[] = [];
  const re = /- stream: (\d+)\s+offset: (\d+)\s+format: (\d+)\s+dimension: (\d+)/g;
  for (let m = re.exec(vertexData); m; m = re.exec(vertexData)) {
    channels.push({ stream: Number(m[1]), offset: Number(m[2]), format: Number(m[3]), dimension: Number(m[4]) & 0xf });
  }
  return channels;
}

// 位置・UV0・三角形（最初のサブメッシュ）を読む
export function readUnityMesh(yaml: string) {
  const vertexBlock = block(yaml, "m_VertexData", "  ").text;
  const count = Number(/m_VertexCount: (\d+)/.exec(vertexBlock)?.[1] ?? NaN);
  const channels = readChannels(vertexBlock);
  const hex = /_typelessdata: ([0-9a-f]*)/.exec(vertexBlock)?.[1] ?? "";
  if (!Number.isFinite(count) || channels.length === 0) throw new Error("メッシュの頂点のデータを読めません");
  const used = channels.filter((c) => c.dimension > 0);
  if (used.some((c) => c.stream !== 0 || c.format !== 0)) throw new Error("このメッシュの頂点の形式には対応していません");
  const stride = Math.max(...used.map((c) => c.offset + c.dimension * 4));
  const data = Buffer.from(hex, "hex");
  if (data.length < stride * count) throw new Error("メッシュの頂点のデータが足りません");
  const pos = channels[CH_POSITION];
  const uv = channels[CH_UV0];
  if (!pos || pos.dimension < 3 || !uv || uv.dimension < 2) throw new Error("メッシュに位置か UV がありません");

  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) positions[i * 3 + k] = data.readFloatLE(i * stride + pos.offset + k * 4);
    for (let k = 0; k < 2; k++) uvs[i * 2 + k] = data.readFloatLE(i * stride + uv.offset + k * 4);
  }

  const wide = /m_IndexFormat: 1/.test(yaml);
  const indexHex = /^ {2}m_IndexBuffer: ([0-9a-f]*)/m.exec(yaml)?.[1] ?? "";
  const indexData = Buffer.from(indexHex, "hex");
  const sub = /m_SubMeshes:\s*\n\s*- serializedVersion: \d+\s*\n\s*firstByte: (\d+)\s*\n\s*indexCount: (\d+)\s*\n\s*topology: (\d+)\s*\n\s*baseVertex: (\d+)/.exec(yaml);
  if (!sub) throw new Error("メッシュにサブメッシュがありません");
  const [firstByte, indexCount, , baseVertex] = sub.slice(1).map(Number);
  const indices = new Uint32Array(indexCount);
  for (let i = 0; i < indexCount; i++) {
    indices[i] = (wide ? indexData.readUInt32LE(firstByte + i * 4) : indexData.readUInt16LE(firstByte + i * 2)) + baseVertex;
  }
  return { positions, uvs, indices };
}

const f = (v: number) => {
  // Unity と同じく、整数ならそのまま、そうでなければ必要な桁だけ書く
  const r = Number(Math.fround(v).toPrecision(9));
  return Object.is(r, -0) ? "0" : String(r);
};

// メッシュの中身（頂点・三角形・範囲）を差し替える。ほかの項目（名前・設定）は元のまま
export function writeUnityMesh(yaml: string, mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }) {
  const count = mesh.positions.length / 3;
  const wide = count > 65535;
  const stride = 24;
  const data = Buffer.alloc(count * stride);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      data.writeFloatLE(mesh.positions[i * 3 + k], i * stride + k * 4);
      data.writeFloatLE(mesh.normals[i * 3 + k], i * stride + 12 + k * 4);
    }
  }
  const index = Buffer.alloc(mesh.indices.length * (wide ? 4 : 2));
  mesh.indices.forEach((v, i) => (wide ? index.writeUInt32LE(v, i * 4) : index.writeUInt16LE(v, i * 2)));

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], mesh.positions[i * 3 + k]);
      max[k] = Math.max(max[k], mesh.positions[i * 3 + k]);
    }
  }
  const center = count ? min.map((m, k) => (m + max[k]) / 2) : [0, 0, 0];
  const extent = count ? min.map((m, k) => (max[k] - m) / 2) : [0, 0, 0];
  const aabb = (indent: string) =>
    `${indent}m_Center: {x: ${f(center[0])}, y: ${f(center[1])}, z: ${f(center[2])}}\n${indent}m_Extent: {x: ${f(extent[0])}, y: ${f(extent[1])}, z: ${f(extent[2])}}`;

  const channels = Array.from({ length: CHANNEL_COUNT }, (_, i) => {
    const [offset, dimension] = i === 0 ? [0, 3] : i === 1 ? [12, 3] : [0, 0];
    return `    - stream: 0\n      offset: ${offset}\n      format: 0\n      dimension: ${dimension}`;
  }).join("\n");

  const subMeshes = `  m_SubMeshes:
  - serializedVersion: 2
    firstByte: 0
    indexCount: ${mesh.indices.length}
    topology: 0
    baseVertex: 0
    firstVertex: 0
    vertexCount: ${count}
    localAABB:
${aabb("      ")}
`;
  const vertexData = `  m_VertexData:
    serializedVersion: 3
    m_VertexCount: ${count}
    m_Channels:
${channels}
    m_DataSize: ${data.length}
    _typelessdata: ${data.toString("hex")}
`;

  let out = yaml;
  const replaceBlock = (key: string, text: string) => {
    const b = block(out, key, "  ");
    out = out.slice(0, b.start) + text + out.slice(b.end);
  };
  replaceBlock("m_SubMeshes", subMeshes);
  replaceBlock("m_VertexData", vertexData);
  replaceBlock("m_LocalAABB", `  m_LocalAABB:\n${aabb("    ")}\n`);
  out = out.replace(/^( {2}m_IndexFormat: )\d+/m, `$1${wide ? 1 : 0}`);
  out = out.replace(/^( {2}m_IndexBuffer: )[0-9a-f]*/m, `$1${index.toString("hex")}`);
  return out;
}

// ---- Prefab の中のオブジェクトから、使っているメッシュを探す ----

// Prefab の YAML から、指定した名前の GameObject の MeshFilter が参照するメッシュの GUID を返す
export function prefabObjectMeshGuid(prefabYaml: string, objectName: string) {
  const docs = prefabYaml.split(/^--- /m).slice(1);
  const header = (doc: string) => /^!u!(\d+) &(-?\d+)/.exec(doc);
  const objectIds = docs
    .filter((d) => header(d)?.[1] === "1" && new RegExp(`^\\s*m_Name: ${escapeRegExp(objectName)}\\s*$`, "m").test(d))
    .map((d) => header(d)![2]);
  if (objectIds.length !== 1) throw new Error(`Prefab に「${objectName}」のオブジェクトが ${objectIds.length} 個あります（1 個にしてください）`);
  const filter = docs.find((d) => header(d)?.[1] === "33" && new RegExp(`m_GameObject: \\{fileID: ${objectIds[0]}\\}`).test(d));
  const guid = filter && /m_Mesh: \{fileID: \d+, guid: ([0-9a-f]{32})/.exec(filter)?.[1];
  if (!guid) throw new Error(`「${objectName}」のオブジェクトにメッシュがありません`);
  return guid;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
