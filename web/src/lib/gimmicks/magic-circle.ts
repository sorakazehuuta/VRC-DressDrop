// 「オーラ・魔法陣」の足元の模様（白一色の SVG）。
// サーバーでは unitypackage のテクスチャに、ブラウザではエディタのプレビューに使う（同じ見た目にするため共通にしている）
export function magicCircleSvg(size: number) {
  // 1024px で描いた座標を size に合わせて縮める
  const k = size / 1024;
  const c = size / 2;
  const n = (v: number) => (v * k).toFixed(1);
  const star = (points: number, r: number, step: number) =>
    Array.from({ length: points }, (_, i) => {
      const a = ((i * step) / points) * Math.PI * 2 - Math.PI / 2;
      return `${(c + Math.cos(a) * r * k).toFixed(1)},${(c + Math.sin(a) * r * k).toFixed(1)}`;
    }).join(" ");
  const ticks = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r1 = 430;
    const r2 = i % 4 === 0 ? 395 : 412;
    return `<line x1="${c + Math.cos(a) * r1 * k}" y1="${c + Math.sin(a) * r1 * k}" x2="${c + Math.cos(a) * r2 * k}" y2="${c + Math.sin(a) * r2 * k}" />`;
  }).join("");
  const dots = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `<circle cx="${c + Math.cos(a) * 365 * k}" cy="${c + Math.sin(a) * 365 * k}" r="${n(9)}" fill="#fff" />`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <g fill="none" stroke="#fff" stroke-linecap="round">
    <circle cx="${c}" cy="${c}" r="${n(470)}" stroke-width="${n(14)}" />
    <circle cx="${c}" cy="${c}" r="${n(440)}" stroke-width="${n(5)}" />
    <g stroke-width="${n(5)}">${ticks}</g>
    <circle cx="${c}" cy="${c}" r="${n(340)}" stroke-width="${n(8)}" />
    <polygon points="${star(6, 340, 1)}" stroke-width="${n(6)}" />
    <polygon points="${star(7, 335, 3)}" stroke-width="${n(4)}" />
    <circle cx="${c}" cy="${c}" r="${n(150)}" stroke-width="${n(7)}" />
    <circle cx="${c}" cy="${c}" r="${n(120)}" stroke-width="${n(3)}" />
  </g>
  ${dots}
</svg>`;
}
