// アクリルの板の側面（切り口）のメッシュ。板の外周の線（outline.ts の OutlineLoop）に沿って、表と裏のプリントの面の間をつなぐ帯を作る。
// ブラウザ（three.js、glTF の座標）とサーバー（Unity のメッシュ）で同じものを使う。
// どちらの座標でも「cross(b - a, c - a) が外向きを向く」三角形が表になる（Unity は左手系で時計回り、glTF は右手系で反時計回り）。
// Node 専用のモジュールや "@/..." を import しないこと

import type { OutlineLoop } from "./outline";

type Vec3 = [number, number, number];

// 印刷面の中の位置 (u, t)（u: 左 0〜右 1、t: 上 0〜下 1）から 3D の位置への対応（平面）
export type FaceMap = { origin: Vec3; u: Vec3; t: Vec3 };

export type EdgeMesh = { positions: Float32Array; normals: Float32Array; indices: Uint32Array };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossV = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? mul(a, 1 / l) : [0, 0, 0];
};

const at = (m: FaceMap, u: number, t: number): Vec3 => add(add(m.origin, mul(m.u, u)), mul(m.t, t));

// 3 つの頂点とその (u, t) から、面の対応を求める
function faceFromTriangle(p: Vec3[], uv: [number, number][]): FaceMap | null {
  const [du1, dt1] = [uv[1][0] - uv[0][0], uv[1][1] - uv[0][1]];
  const [du2, dt2] = [uv[2][0] - uv[0][0], uv[2][1] - uv[0][1]];
  const det = du1 * dt2 - du2 * dt1;
  if (Math.abs(det) < 1e-12) return null;
  const e1 = sub(p[1], p[0]);
  const e2 = sub(p[2], p[0]);
  const u = mul(sub(mul(e1, dt2), mul(e2, dt1)), 1 / det);
  const t = mul(sub(mul(e2, du1), mul(e1, du2)), 1 / det);
  return { origin: sub(sub(p[0], mul(u, uv[0][0])), mul(t, uv[0][1])), u, t };
}

// プリントの面のメッシュ（表と裏の 2 枚）から、それぞれの面の対応を求める。
// uvT: UV を (u, t) に直したもの（Unity の UV は v が上向きなので t = 1 - v、glTF の UV はそのまま t = v）
export function printFaces(positions: ArrayLike<number>, uvT: ArrayLike<number>, indices: ArrayLike<number>): [FaceMap, FaceMap] | null {
  let first: { normal: Vec3; face: FaceMap } | null = null;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const ids = [indices[i], indices[i + 1], indices[i + 2]];
    const p = ids.map((k): Vec3 => [positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]]);
    const uv = ids.map((k): [number, number] => [uvT[k * 2], uvT[k * 2 + 1]]);
    const face = faceFromTriangle(p, uv);
    if (!face) continue;
    const normal = normalize(crossV(sub(p[1], p[0]), sub(p[2], p[0])));
    if (!first) first = { normal, face };
    else if (dot(normal, first.normal) < 0) return [first.face, face];
  }
  return null;
}

// 隣の面との角度がこれより小さければ、頂点の法線をならして丸みのある側面に見せる
const SMOOTH_COS = Math.cos((50 * Math.PI) / 180);

export function buildEdgeMesh(loops: OutlineLoop[], front: FaceMap, back: FaceMap): EdgeMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (const loop of loops) {
    const n = loop.length;
    if (n < 3) continue;
    // 各辺の外向きの法線
    const segNormals: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const [u0, t0] = loop[i];
      const [u1, t1] = loop[(i + 1) % n];
      const a = at(front, u0, t0);
      const b = at(front, u1, t1);
      const c = at(back, u0, t0);
      // 内側は進む向きの cross > 0 の側なので、外側の向きは (dt, -du)
      const hint = add(mul(front.u, t1 - t0), mul(front.t, -(u1 - u0)));
      let normal = normalize(crossV(sub(b, a), sub(c, a)));
      if (dot(normal, hint) < 0) normal = mul(normal, -1);
      segNormals.push(normal);
    }
    // 頂点 i の、辺 i（始点側）・辺 i-1（終点側）で使う法線
    const vertexNormal = (own: Vec3, other: Vec3) => (dot(own, other) >= SMOOTH_COS ? normalize(add(own, other)) : own);

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ns = segNormals[i];
      const n0 = vertexNormal(ns, segNormals[(i + n - 1) % n]);
      const n1 = vertexNormal(ns, segNormals[j]);
      const af = at(front, loop[i][0], loop[i][1]);
      const bf = at(front, loop[j][0], loop[j][1]);
      const ab = at(back, loop[i][0], loop[i][1]);
      const bb = at(back, loop[j][0], loop[j][1]);
      const base = positions.length / 3;
      positions.push(...af, ...bf, ...bb, ...ab);
      normals.push(...n0, ...n1, ...n1, ...n0);
      for (const tri of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        const p = tri.map((k) => [af, bf, bb, ab][k]);
        const c = crossV(sub(p[1], p[0]), sub(p[2], p[0]));
        if (dot(c, ns) >= 0) indices.push(base + tri[0], base + tri[1], base + tri[2]);
        else indices.push(base + tri[0], base + tri[2], base + tri[1]);
      }
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}
