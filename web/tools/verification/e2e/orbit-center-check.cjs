// エディタの回転の中心の確認: モデルを読み込んだ直後に操作しても、モデルの中心を軸に回る（画面の中央から動かない）。
// 形が回転対称のテンプレートで確かめる。ログインは不要
const { chromium } = require("playwright");
const sharp = require("sharp");
const BASE = "http://localhost:3002";
const SLUGS = ["shaker", "can"];
const TOLERANCE = 0.02; // 画面の幅に対する割合
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);

// 背景と違う色の範囲から、モデルの中心（画面の中央を 0 とする割合）を求める
async function modelBox(png) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const inset = 16;
  const o = (inset * info.width + inset) * 3;
  const bg = [data[o], data[o + 1], data[o + 2]];
  let x0 = Infinity;
  let x1 = -1;
  for (let y = inset; y < info.height - inset; y++) {
    for (let x = inset; x < info.width - inset; x++) {
      const i = (y * info.width + x) * 3;
      if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 24) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
    }
  }
  return x1 < 0 ? null : { cx: (x0 + x1) / 2 / info.width - 0.5, w: (x1 - x0) / info.width };
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    for (const slug of SLUGS) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`${BASE}/editor/${slug}`, { waitUntil: "domcontentloaded" });
      const canvas = page.locator("canvas").first();
      await canvas.waitFor();
      let first = null;
      for (let i = 0; i < 400 && !first; i++) first = await modelBox(await canvas.screenshot());
      const box = await canvas.boundingBox();
      const drag = async (dx) => {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 4 });
        await page.mouse.up();
      };
      await drag(40); // 表示された直後に操作する
      await page.waitForTimeout(2500);
      const centers = [];
      for (let i = 0; i < 8; i++) {
        const b = await modelBox(await canvas.screenshot());
        centers.push(b ? b.cx : Infinity);
        await drag(80);
        await page.waitForTimeout(800);
      }
      const worst = Math.max(...centers.map(Math.abs));
      ok(`${slug}: 読み込み直後に操作しても中央で回る`, worst <= TOLERANCE, `ずれの最大 ${(worst * 100).toFixed(1)}%`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
