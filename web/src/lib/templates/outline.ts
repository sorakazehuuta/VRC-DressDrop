// アクリルの縁取り。プリント面の絵（不透明な部分）の周りを一定の幅だけ広げ、半透明の色（アクリル板）で塗る。
// 利用者が「四角のまま」を選んだときは、四角（角丸）と差し込む帯の形の板にして、はみ出した絵を切り落とす。
// アクリルスタンドのように、板が絵の形に切られたグッズに使う（template.json の印刷面の outline）。
// 板の外周の線（側面のメッシュを作る元）も返す。
// ブラウザ（canvas の ImageData）とサーバー（sharp の raw）で同じ処理を使うため、Node 専用のモジュールや "@/..." を import しないこと

import { rectGeometry, resolveAcrylic, type AcrylicParams, type PrintOutline } from "./acrylic";

export type { PrintOutline };

// 板の外周の線。点は印刷面の中の位置（u: 左端 0〜右端 1、t: 上端 0〜下端 1）。
// 向きはどの線も同じで、進む向き d に対して cross(d, 内側の点 - 始点) > 0 になる側が板の内側
export type OutlineLoop = [number, number][];

// 距離の計算は、長辺がこの大きさになるまで縮小して行う（スライダーを動かしても重くならないように）
const WORK_SIDE = 512;
const ART_ALPHA = 128;
const INF = 1e20;
// 外周の線を間引くときの許容のずれ（縮小した格子の何マス分か）と、点の数の上限（側面の三角形は点の数の 2 倍）
const SIMPLIFY_TOLERANCE = 0.6;
const MAX_POINTS = 600;

// 1 次元の二乗距離変換（Felzenszwalb & Huttenlocher）
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// mask（1 = 絵）からの距離（画素）
function distanceTransform(mask: Uint8Array, w: number, h: number) {
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = mask[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]);
  }
  return grid;
}

function hex(color: string) {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

// 絵（半透明の部分を含む）をアクリルの上に重ねる
function blend(data: Uint8ClampedArray | Uint8Array, i: number, artA: number, acrA: number, [cr, cg, cb]: readonly [number, number, number]) {
  const outA = artA + acrA * (1 - artA);
  if (outA <= 0) {
    data[i + 3] = 0;
    return;
  }
  data[i] = Math.round((data[i] * artA + cr * acrA * (1 - artA)) / outA);
  data[i + 1] = Math.round((data[i + 1] * artA + cg * acrA * (1 - artA)) / outA);
  data[i + 2] = Math.round((data[i + 2] * artA + cb * acrA * (1 - artA)) / outA);
  data[i + 3] = Math.round(outA * 255);
}

// data: RGBA（ストレートアルファ）。その場で書き換え、板の外周の線を返す（絵がなければ板も線もない）
export function applyOutline(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  outline: PrintOutline,
  acrylic?: AcrylicParams,
): OutlineLoop[] {
  const shape = resolveAcrylic(outline, acrylic);
  return shape.shape === "rect" ? applyRect(data, width, height, outline, shape) : applyCutout(data, width, height, outline, shape.border);
}

function applyCutout(data: Uint8ClampedArray | Uint8Array, width: number, height: number, outline: PrintOutline, border: number): OutlineLoop[] {
  const scale = Math.max(1, Math.ceil(Math.max(width, height) / WORK_SIDE));
  const sw = Math.ceil(width / scale);
  const sh = Math.ceil(height / scale);

  // 縮小した絵の範囲（ブロックの中に1つでも絵の画素があれば絵）
  const mask = new Uint8Array(sw * sh);
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[(row + x) * 4 + 3] >= ART_ALPHA) {
        mask[Math.floor(y / scale) * sw + Math.floor(x / scale)] = 1;
        bottom = y;
      }
    }
  }
  if (bottom < 0) return []; // 絵がなければ板も作らない

  // 台座に差し込む帯（絵の一番下から面の下端まで、中央）
  const inTab = (x: number, y: number) => outline.tab > 0 && y >= bottom && Math.abs(x + 0.5 - width / 2) <= (outline.tab * width) / 2;
  if (outline.tab > 0) {
    for (let sy = Math.floor(bottom / scale); sy < sh; sy++) {
      for (let sx = 0; sx < sw; sx++) if (inTab((sx + 0.5) * scale, sy * scale)) mask[sy * sw + sx] = 1;
    }
  }

  const dist = distanceTransform(mask, sw, sh);
  const r = border * Math.min(width, height);
  const edge = Math.max(1.5, r * 0.08);
  const color = hex(outline.color);

  for (let y = 0; y < height; y++) {
    // 縮小した距離を双線形に補間して、元の大きさの距離にする
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / scale - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const artA = data[i + 3] / 255;
      if (artA >= 1) continue;
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / scale - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const ds =
        (dist[y0 * sw + x0] * (1 - tx) + dist[y0 * sw + x1] * tx) * (1 - ty) + (dist[y1 * sw + x0] * (1 - tx) + dist[y1 * sw + x1] * tx) * ty;
      const dPx = inTab(x, y) ? 0 : ds * scale;
      if (dPx > r + 1) continue;
      // 板の不透明度。外周の細い線は濃く、いちばん外側の 1px はなめらかに消す
      const base = dPx > r - edge ? outline.edgeOpacity : outline.opacity;
      const acrA = base * Math.min(1, Math.max(0, r - dPx + 0.5));
      if (acrA <= 0) continue;
      blend(data, i, artA, acrA, color);
    }
  }

  // 板の外周（距離がちょうど r の線）。縮小した格子の点 (sx, sy) は、元の画像の ((sx + 0.5) * scale, (sy + 0.5) * scale)
  const field = new Float64Array(sw * sh);
  // ちょうど 0 の値があると線の向きを決められないため、わずかにずらす
  for (let i = 0; i < sw * sh; i++) field[i] = r / scale - dist[i] + 1e-6;
  return traceContours(field, sw, sh).map((loop) =>
    loop.map(([gx, gy]): [number, number] => [clamp01(((gx + 0.5) * scale) / width), clamp01(((gy + 0.5) * scale) / height)]),
  );
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// 角丸の四角の符号付き距離（内側が負）
function roundedRectDistance(x: number, y: number, left: number, top: number, right: number, bottom: number, radius: number) {
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const qx = Math.abs(x - cx) - ((right - left) / 2 - radius);
  const qy = Math.abs(y - cy) - ((bottom - top) / 2 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function applyRect(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  outline: PrintOutline,
  shape: Extract<AcrylicParams, { shape: "rect" }>,
): OutlineLoop[] {
  const g = rectGeometry(outline, shape, width, height);
  const hasTab = g.tabRight > g.tabLeft && g.bottom < height;
  // 帯は四角の中から面の下端の外まで（面の下端には切り口を作らない）
  const tabTop = g.bottom - Math.max(g.radius, 1);
  const edge = Math.max(1.5, 0.0032 * Math.min(width, height));
  const color = hex(outline.color);

  for (let y = 0; y < height; y++) {
    const py = y + 0.5;
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      let sd = roundedRectDistance(px, py, g.left, g.top, g.right, g.bottom, g.radius);
      if (hasTab) sd = Math.min(sd, roundedRectDistance(px, py, g.tabLeft, tabTop, g.tabRight, height + 2, 0));
      const i = (y * width + x) * 4;
      const coverage = Math.min(1, Math.max(0, 0.5 - sd));
      // 四角の外の絵は切り落とす
      const artA = (data[i + 3] / 255) * coverage;
      const acrA = (sd > -edge ? outline.edgeOpacity : outline.opacity) * coverage;
      if (artA >= 1) continue;
      blend(data, i, artA, acrA, color);
    }
  }

  // 外周の線（左上から時計回り。画像の y は下向きなので、この向きで内側が cross > 0 の側になる）
  const pts: [number, number][] = [];
  const arc = (cx: number, cy: number, from: number) => {
    const steps = g.radius > 0 ? 8 : 0;
    for (let s = 0; s <= steps; s++) {
      const a = ((from + (90 * s) / Math.max(steps, 1)) * Math.PI) / 180;
      pts.push([cx + Math.cos(a) * g.radius, cy + Math.sin(a) * g.radius]);
    }
  };
  arc(g.left + g.radius, g.top + g.radius, 180);
  arc(g.right - g.radius, g.top + g.radius, 270);
  arc(g.right - g.radius, g.bottom - g.radius, 0);
  if (hasTab) {
    pts.push([g.tabRight, g.bottom], [g.tabRight, height], [g.tabLeft, height], [g.tabLeft, g.bottom]);
  }
  arc(g.left + g.radius, g.bottom - g.radius, 90);
  const loop = pts
    .filter((p, i) => {
      const q = pts[(i + pts.length - 1) % pts.length];
      return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6;
    })
    .map(([x, y]): [number, number] => [clamp01(x / width), clamp01(y / height)]);
  return [loop];
}

// ---- 外周の線を取り出す（マーチングスクエア）----

// field: 格子の値（正 = 板の内側。ちょうど 0 の値は持たないこと）。格子の外は外側として扱う。返す点は格子の座標
export function traceContours(field: Float64Array, w: number, h: number): OutlineLoop[] {
  const value = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : field[y * w + x]);
  const stride = w + 2;
  // 格子の辺の番号。横の辺 (x, y)-(x+1, y) と、縦の辺 (x, y)-(x, y+1)
  const hKey = (x: number, y: number) => ((y + 1) * stride + (x + 1)) * 2;
  const vKey = (x: number, y: number) => ((y + 1) * stride + (x + 1)) * 2 + 1;
  const points = new Map<number, [number, number]>();
  const next = new Map<number, number>();

  const cross = (key: number, ax: number, ay: number, bx: number, by: number) => {
    let p = points.get(key);
    if (!p) {
      const fa = value(ax, ay);
      const fb = value(bx, by);
      const t = fa / (fa - fb);
      p = [ax + (bx - ax) * t, ay + (by - ay) * t];
      points.set(key, p);
    }
    return p;
  };

  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const tl = value(x, y) > 0;
      const tr = value(x + 1, y) > 0;
      const br = value(x + 1, y + 1) > 0;
      const bl = value(x, y + 1) > 0;
      if (tl === tr && tr === br && br === bl) continue;
      // 辺: 番号・両端・両端の内外
      type Edge = { key: number; a: [number, number]; b: [number, number]; aIn: boolean; bIn: boolean };
      const T: Edge = { key: hKey(x, y), a: [x, y], b: [x + 1, y], aIn: tl, bIn: tr };
      const R: Edge = { key: vKey(x + 1, y), a: [x + 1, y], b: [x + 1, y + 1], aIn: tr, bIn: br };
      const B: Edge = { key: hKey(x, y + 1), a: [x, y + 1], b: [x + 1, y + 1], aIn: bl, bIn: br };
      const L: Edge = { key: vKey(x, y), a: [x, y], b: [x, y + 1], aIn: tl, bIn: bl };
      const crossing = [T, R, B, L].filter((e) => e.aIn !== e.bIn);
      let pairs: [Edge, Edge][];
      if (crossing.length === 2) {
        pairs = [[crossing[0], crossing[1]]];
      } else {
        // 鞍点。中央の値で、内側どうしをつなぐか外側どうしをつなぐかを決める（中央が内側なら外側の角を切り離す）
        const center = (value(x, y) + value(x + 1, y) + value(x + 1, y + 1) + value(x, y + 1)) / 4 > 0;
        const cutOutside = center;
        const cutTlBr = tl !== cutOutside; // 切り離す角が左上と右下か
        pairs = cutTlBr
          ? [
              [L, T],
              [R, B],
            ]
          : [
              [T, R],
              [B, L],
            ];
      }
      for (const [e1, e2] of pairs) {
        const p1 = cross(e1.key, e1.a[0], e1.a[1], e1.b[0], e1.b[1]);
        const p2 = cross(e2.key, e2.a[0], e2.a[1], e2.b[0], e2.b[1]);
        // 内側の角が進む向きの左（cross > 0）に来るよう向きを決める
        const inside = e1.aIn ? e1.a : e1.b;
        const c = (p2[0] - p1[0]) * (inside[1] - p1[1]) - (p2[1] - p1[1]) * (inside[0] - p1[0]);
        if (c > 0) next.set(e1.key, e2.key);
        else next.set(e2.key, e1.key);
      }
    }
  }

  // 線をつないで閉じた輪にする
  const loops: OutlineLoop[] = [];
  const visited = new Set<number>();
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    const loop: OutlineLoop = [];
    let key: number | undefined = start;
    while (key !== undefined && !visited.has(key)) {
      visited.add(key);
      loop.push(points.get(key)!);
      key = next.get(key);
    }
    // 小さすぎる輪（ごみ）は捨てる
    if (loop.length >= 3 && Math.abs(signedArea(loop)) >= 2) loops.push(loop);
  }

  // 点を間引く。多すぎるときは許容のずれを広げてやり直す
  let tolerance = SIMPLIFY_TOLERANCE;
  for (;;) {
    const simplified = loops.map((l) => simplifyLoop(l, tolerance)).filter((l) => l.length >= 3);
    if (simplified.reduce((n, l) => n + l.length, 0) <= MAX_POINTS || tolerance > 16) return simplified;
    tolerance *= 1.5;
  }
}

function signedArea(loop: OutlineLoop) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x0, y0] = loop[i];
    const [x1, y1] = loop[(i + 1) % loop.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

// 閉じた線の Douglas-Peucker。始点から最も遠い点で 2 本に分けて間引く
function simplifyLoop(loop: OutlineLoop, tolerance: number): OutlineLoop {
  let far = 0;
  let farD = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const first = simplifyChain(loop.slice(0, far + 1), tolerance);
  const second = simplifyChain([...loop.slice(far), loop[0]], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function simplifyChain(pts: OutlineLoop, tolerance: number): OutlineLoop {
  if (pts.length <= 2) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay);
  let idx = 0;
  let maxD = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d = len > 0 ? Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len : Math.hypot(px - ax, py - ay);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tolerance) return [pts[0], pts[pts.length - 1]];
  const left = simplifyChain(pts.slice(0, idx + 1), tolerance);
  const right = simplifyChain(pts.slice(idx), tolerance);
  return [...left.slice(0, -1), ...right];
}
