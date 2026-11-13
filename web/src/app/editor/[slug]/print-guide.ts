import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { textureDimensions } from "@/lib/templates/params";
import type { PrintSlot } from "@/lib/templates/schema";

// 印刷面の下絵（PNG）を作る。プレビュー用モデル（glb）の印刷面のマテリアルの UV を、
// テクスチャと同じ大きさのキャンバスに描き、実際にモデルで見える範囲を白で示す。
// glTF の UV は画像の左上が (0, 0)（エディタのテクスチャも flipY = false）なので、そのまま画素の位置になる。
// 文字は入れない（下絵のまま書き出されても、プリントに文字が残らないように）

const HIDDEN = "#d6dde5"; // 見えない範囲（台の灰色より少し濃い）
const HATCH = "#bcc6d1";
const VISIBLE = "#ffffff";
const OUTLINE = "#00a29c"; // ブランドの青緑
const CENTER = "rgba(3, 30, 66, 0.35)"; // ブランドの紺

type Triangle = [THREE.Vector2, THREE.Vector2, THREE.Vector2];

// 印刷面のマテリアルを使う三角形の UV を集める（1 つのメッシュに複数のマテリアルがある場合はグループで分ける）
function collectTriangles(scene: THREE.Object3D, materialName: string): Triangle[] {
  const triangles: Triangle[] = [];
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const uv = mesh.geometry.getAttribute("uv");
    if (!uv) return;
    const index = mesh.geometry.getIndex();
    const vertexCount = index ? index.count : uv.count;
    const at = (i: number) => new THREE.Vector2(uv.getX(index ? index.getX(i) : i), uv.getY(index ? index.getX(i) : i));
    const ranges: { start: number; count: number }[] = [];
    if (Array.isArray(mesh.material)) {
      const materials = mesh.material;
      const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: vertexCount, materialIndex: 0 }];
      for (const g of groups) if (materials[g.materialIndex ?? 0]?.name === materialName) ranges.push({ start: g.start, count: Math.min(g.count, vertexCount - g.start) });
    } else if (mesh.material.name === materialName) {
      ranges.push({ start: 0, count: vertexCount });
    }
    for (const { start, count } of ranges) {
      for (let i = start; i + 2 < start + count; i += 3) triangles.push([at(i), at(i + 1), at(i + 2)]);
    }
  });
  return triangles;
}

// 外周の辺（どの三角形とも共有していない辺）。UV の継ぎ目でも線が出ないよう、座標を丸めて比べる
function boundaryEdges(triangles: Triangle[]) {
  const key = (p: THREE.Vector2) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)}`;
  const edges = new Map<string, { a: THREE.Vector2; b: THREE.Vector2; count: number }>();
  for (const t of triangles) {
    for (const [a, b] of [
      [t[0], t[1]],
      [t[1], t[2]],
      [t[2], t[0]],
    ] as const) {
      const [ka, kb] = [key(a), key(b)];
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const edge = edges.get(k);
      if (edge) edge.count += 1;
      else edges.set(k, { a, b, count: 1 });
    }
  }
  return [...edges.values()].filter((e) => e.count === 1);
}

export async function createPrintGuide(modelUrl: string, slot: PrintSlot): Promise<Blob> {
  const gltf = await new GLTFLoader().loadAsync(modelUrl);
  const { width, height } = textureDimensions(slot);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");

  // 見えない範囲: 灰色に斜線
  ctx.fillStyle = HIDDEN;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = HATCH;
  ctx.lineWidth = Math.max(2, Math.round(Math.max(width, height) / 400));
  const step = Math.max(24, Math.round(Math.max(width, height) / 40));
  ctx.beginPath();
  for (let x = -height; x < width; x += step) {
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
  }
  ctx.stroke();

  // モデルに印刷面のマテリアルが見つからないときは、全面を見える範囲として扱う
  const found = collectTriangles(gltf.scene, slot.material);
  const full: Triangle[] = [
    [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1)],
    [new THREE.Vector2(0, 0), new THREE.Vector2(1, 1), new THREE.Vector2(0, 1)],
  ];
  const triangles = found.length ? found : full;
  const px = (p: THREE.Vector2) => [p.x * width, p.y * height] as const;

  // 見える範囲: 白（隣の三角形との隙間が出ないよう、同じ色の細い線でも塗る）
  ctx.fillStyle = VISIBLE;
  ctx.strokeStyle = VISIBLE;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  for (const t of triangles) {
    ctx.beginPath();
    ctx.moveTo(...px(t[0]));
    ctx.lineTo(...px(t[1]));
    ctx.lineTo(...px(t[2]));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 見える範囲の外周
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(3, Math.round(Math.max(width, height) / 340));
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const { a, b } of boundaryEdges(triangles)) {
    ctx.moveTo(...px(a));
    ctx.lineTo(...px(b));
  }
  ctx.stroke();

  // 中心の十字（位置 0% のときに画像の中心が来る場所）
  ctx.strokeStyle = CENTER;
  ctx.lineWidth = Math.max(1, Math.round(Math.max(width, height) / 1000));
  ctx.setLineDash([step / 2, step / 3]);
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
