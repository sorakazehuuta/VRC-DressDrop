// プレビューの最初の視点（モデルの中心からカメラへ向かう方向）。
// templates:prepare がプリント面の中心の向き（facing）を preview.glb に記録し、エディタとサムネイルはその正面から見る。
// scripts/thumbnail/render.html にも同じ計算があるので、変えるときは両方を直すこと

export type PreviewExtras = {
  source: string;
  sourceSha256: string;
  prefab: string;
  // プリント面の中心の法線（glTF の座標）。記録がなければ正面（+Z）
  facing?: [number, number, number];
  // プリント面の中心での画像の上方向（上・下向きの面を、画像が正立して見える側から見るために使う）
  up?: [number, number, number];
};

export function cameraDirection(facing?: readonly number[] | null, up?: readonly number[] | null): [number, number, number] {
  let [x, y, z] = facing && facing.length === 3 && facing.some((v) => v !== 0) ? facing : [0, 0, 1];
  const len = Math.hypot(x, y, z);
  [x, y, z] = [x / len, y / len, z / len];
  if (Math.abs(y) > 0.9) {
    // 真上・真下から見ると向きが決まらないので少し傾ける。カメラの上は +Y なので、上から見ると傾けた側の反対、
    // 下から見ると傾けた側が画面の上になる。画像の上方向が画面の上に来る側へ傾ける（記録がなければ手前 +Z）
    const hx = up?.length === 3 ? up[0] : 0;
    const hz = up?.length === 3 ? up[2] : 0;
    const h = Math.hypot(hx, hz);
    const [tx, tz] = h > 1e-3 ? (y > 0 ? [-hx / h, -hz / h] : [hx / h, hz / h]) : [0, 1];
    x += tx * 0.45;
    z += tz * 0.45;
  } else {
    // 横向きの面は、少し上から見下ろす
    y += 0.3;
  }
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
}
