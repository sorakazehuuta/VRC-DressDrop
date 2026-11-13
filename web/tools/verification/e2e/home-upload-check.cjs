// トップページの「画像を1枚アップして3Dプレビューを試す」。画像を選ぶと、その画像を貼ったアクリルスタンドのエディタが開く（ログイン不要）。
// 対応していない形式はトップページでエラーにする。日英の両方で確かめ、PC とスマホ幅で撮る
const { chromium } = require("playwright");
const path = require("path");
const B = process.env.BASE_URL || "http://localhost:3002";
const DIR = process.env.SHOTS_DIR || path.join(__dirname, "shots");
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK " : "NG "} ${label}${extra ? " — " + extra : ""}`);

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const errors = [];
  try {
    for (const [locale, prefix, uploadLabel, imageName] of [
      ["ja", "", "アップロード", "絵"],
      ["en", "/en", "Upload", "Artwork"],
    ]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      await ctx.addCookies([{ name: "lang", value: locale, url: B }]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${B}${prefix}/`, { waitUntil: "networkidle" });
      ok(`${locale}: 見出しと試す欄`, (await page.locator("h1").isVisible()) && (await page.getByRole("button", { name: uploadLabel, exact: true }).isVisible()));
      ok(`${locale}: グッズの写真`, await page.locator('img[src="/home/goods.webp"]').evaluate((img) => img.complete && img.naturalWidth > 0));
      await page.screenshot({ path: path.join(DIR, `home-hero-${locale}-pc.png`) });

      // 対応していない形式
      await page.locator('input[type="file"]').setInputFiles({ name: "x.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
      ok(`${locale}: 対応していない形式はエラー`, await page.locator("main [role=alert]").isVisible(), await page.locator("main [role=alert]").innerText());

      // 背景が透明な画像を選ぶと、アクリルスタンドのエディタに貼られて開く
      const png = await page.evaluate(async () => {
        const c = document.createElement("canvas");
        c.width = 300;
        c.height = 450;
        const g = c.getContext("2d");
        g.fillStyle = "#e11d48";
        g.beginPath();
        g.arc(150, 160, 120, 0, Math.PI * 2);
        g.fill();
        g.fillRect(90, 260, 120, 170);
        const blob = await new Promise((r) => c.toBlob(r, "image/png"));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      });
      await page.locator('input[type="file"]').setInputFiles({ name: "try.png", mimeType: "image/png", buffer: Buffer.from(png) });
      await page.waitForURL(new RegExp(`${prefix}/editor/acrylic-stand`), { timeout: 30000 });
      await page.waitForSelector("canvas");
      await page.getByText("try.png").waitFor({ timeout: 20000 });
      ok(`${locale}: エディタが開き、画像が貼られている`, await page.getByRole("heading", { name: imageName }).isVisible());
      ok(`${locale}: URL から draft=1 が消える`, !page.url().includes("draft="), page.url());
      // 3D のモデルが描かれるまで待つ（背景の 1 色だけでなくなるまで）
      for (let i = 0; i < 30; i++) {
        const shot = await page.locator("canvas").first().screenshot();
        const colors = await page.evaluate(async (b64) => {
          const img = new Image();
          img.src = "data:image/png;base64," + b64;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = 64;
          c.height = 64;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0, 64, 64);
          const d = g.getImageData(0, 0, 64, 64).data;
          return new Set(Array.from({ length: 64 * 64 }, (_, k) => `${d[k * 4] >> 4},${d[k * 4 + 1] >> 4},${d[k * 4 + 2] >> 4}`)).size;
        }, shot.toString("base64"));
        if (colors > 8) break;
        await page.waitForTimeout(1000);
      }
      await page.waitForTimeout(800);
      await page.locator("canvas").first().screenshot({ path: path.join(DIR, `home-hero-${locale}-editor.png`) });
      await ctx.close();
    }

    // スマホ幅で横にはみ出さない
    for (const prefix of ["", "/en"]) {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
      await ctx.addCookies([{ name: "lang", value: prefix ? "en" : "ja", url: B }]);
      const page = await ctx.newPage();
      await page.goto(`${B}${prefix}/`, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(`${prefix || "/"}: スマホ幅で横にはみ出さない`, overflow <= 0, `${overflow}px`);
      await page.screenshot({ path: path.join(DIR, `home-hero-${prefix ? "en" : "ja"}-phone.png`) });
      await ctx.close();
    }
    ok("ブラウザのエラーなし", errors.length === 0, errors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("ERROR", e.message);
  process.exit(1);
});
