// 画像の背景の色を消す（透明にする）。AI は使わず、縁の色と近い色を消す簡単な方式。
// 同人誌の表紙やイラストの書き出し（白や単色の背景）を想定している。写真のような背景は対象外

export type BackgroundOptions = {
  // 消す色の近さ（0〜100）。大きいほど、背景の色と離れた色まで消す
  tolerance: number;
  // true: 縁からつながっている部分だけを消す（絵の中の白は残る）。false: 画像全体で同じ色を消す
  contiguous: boolean;
};

export const DEFAULT_BACKGROUND_OPTIONS: BackgroundOptions = { tolerance: 30, contiguous: true };

// tolerance 100 のときの RGB の距離（最大は約 441）
const MAX_DISTANCE = 140;

export type BackgroundResult = { kind: "done"; blob: Blob; removedRatio: number } | { kind: "already-transparent" } | { kind: "nothing" };

// 縁の画素で最も多い色（16 段階にまとめて数え、その中の平均）。縁の多くがすでに透明なら null
function borderColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  let transparent = 0;
  const visit = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    total++;
    if (data[i + 3] < 128) {
      transparent++;
      return;
    }
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += data[i];
    bucket.g += data[i + 1];
    bucket.b += data[i + 2];
    buckets.set(key, bucket);
  };
  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    visit(0, y);
    visit(width - 1, y);
  }
  if (transparent / total > 0.5) return null;
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
  return best ? [best.r / best.n, best.g / best.n, best.b / best.n] : null;
}

export async function removeBackground(source: ImageBitmap, options: BackgroundOptions, maxBytes: number): Promise<BackgroundResult> {
  const { width, height } = source;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;

  const key = borderColor(data, width, height);
  if (!key) return { kind: "already-transparent" };

  // 背景の色との距離が limit 以下なら消す。soft より近ければ完全に透明、limit までは少しずつ透明にする（境目のギザギザを抑える）
  const limit = Math.max(1, (options.tolerance / 100) * MAX_DISTANCE);
  const soft = limit * 0.6;
  const pixels = width * height;
  const distance = new Float32Array(pixels);
  for (let p = 0; p < pixels; p++) {
    const i = p * 4;
    const dr = data[i] - key[0];
    const dg = data[i + 1] - key[1];
    const db = data[i + 2] - key[2];
    distance[p] = data[i + 3] < 8 ? 0 : Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // 消す画素を決める。縁からつながっている部分だけのときは、縁から幅優先でたどる
  const remove = new Uint8Array(pixels);
  if (options.contiguous) {
    const queue = new Int32Array(pixels);
    let head = 0;
    let tail = 0;
    const push = (p: number) => {
      if (remove[p] || distance[p] > limit) return;
      remove[p] = 1;
      queue[tail++] = p;
    };
    for (let x = 0; x < width; x++) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      push(y * width);
      push(y * width + width - 1);
    }
    while (head < tail) {
      const p = queue[head++];
      const x = p % width;
      if (x > 0) push(p - 1);
      if (x < width - 1) push(p + 1);
      if (p >= width) push(p - width);
      if (p < pixels - width) push(p + width);
    }
  } else {
    for (let p = 0; p < pixels; p++) if (distance[p] <= limit) remove[p] = 1;
  }

  let removed = 0;
  for (let p = 0; p < pixels; p++) {
    if (!remove[p]) continue;
    const i = p * 4;
    const keep = distance[p] <= soft ? 0 : (distance[p] - soft) / (limit - soft);
    const alpha = Math.round(data[i + 3] * keep);
    if (alpha < data[i + 3]) removed++;
    data[i + 3] = alpha;
  }
  if (removed === 0) return { kind: "nothing" };

  ctx.putImageData(image, 0, 0);
  // 写真のように細かい画像は PNG が大きくなるので、アップロードの上限に収まるまで少しずつ縮める
  let blob = await canvas.convertToBlob({ type: "image/png" });
  let current: OffscreenCanvas = canvas;
  while (blob.size > maxBytes && current.width > 256) {
    const next = new OffscreenCanvas(Math.round(current.width * 0.8), Math.round(current.height * 0.8));
    const nctx = next.getContext("2d");
    if (!nctx) break;
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(current, 0, 0, next.width, next.height);
    current = next;
    blob = await current.convertToBlob({ type: "image/png" });
  }
  return { kind: "done", blob, removedRatio: removed / pixels };
}
