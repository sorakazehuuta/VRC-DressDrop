// アクリルの縁取り。プリント面の絵（不透明な部分）の周りを一定の幅だけ広げ、半透明の色（アクリル板）で塗る。
// アクリルスタンドのように、板が絵の形に切られたグッズに使う（template.json の印刷面の outline）。
// ブラウザ（canvas の ImageData）とサーバー（sharp の raw）で同じ処理を使うため、Node 専用のモジュールや "@/..." を import しないこと

export type PrintOutline = {
  width: number; // 縁取りの幅。印刷面の短い辺に対する割合
  color: string; // #rrggbb
  opacity: number; // 板の不透明度（0〜1）
  edgeOpacity: number; // 切り口（外周の細い線）の不透明度
  tab: number; // 台座に差し込む帯の幅（印刷面の幅に対する割合。0 なら付けない）。絵の一番下から面の下端まで、中央に付ける
};

// 距離の計算は、長辺がこの大きさになるまで縮小して行う（スライダーを動かしても重くならないように）
const WORK_SIDE = 512;
const ART_ALPHA = 128;
const INF = 1e20;

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

// data: RGBA（ストレートアルファ）。その場で書き換える
export function applyOutline(data: Uint8ClampedArray | Uint8Array, width: number, height: number, outline: PrintOutline) {
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
  if (bottom < 0) return; // 絵がなければ板も作らない

  // 台座に差し込む帯（絵の一番下から面の下端まで、中央）
  const inTab = (x: number, y: number) => outline.tab > 0 && y >= bottom && Math.abs(x + 0.5 - width / 2) <= (outline.tab * width) / 2;
  if (outline.tab > 0) {
    for (let sy = Math.floor(bottom / scale); sy < sh; sy++) {
      for (let sx = 0; sx < sw; sx++) if (inTab((sx + 0.5) * scale, sy * scale)) mask[sy * sw + sx] = 1;
    }
  }

  const dist = distanceTransform(mask, sw, sh);
  const r = outline.width * Math.min(width, height);
  const edge = Math.max(1.5, r * 0.08);
  const [cr, cg, cb] = hex(outline.color);

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
      // 絵（半透明の部分を含む）をアクリルの上に重ねる
      const outA = artA + acrA * (1 - artA);
      data[i] = Math.round((data[i] * artA + cr * acrA * (1 - artA)) / outA);
      data[i + 1] = Math.round((data[i + 1] * artA + cg * acrA * (1 - artA)) / outA);
      data[i + 2] = Math.round((data[i + 2] * artA + cb * acrA * (1 - artA)) / outA);
      data[i + 3] = Math.round(outA * 255);
    }
  }
}
