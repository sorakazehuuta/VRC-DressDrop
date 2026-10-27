// プレビューの最初の視点（モデルの中心からカメラへ向かう方向）。
// templates:prepare がプリント面の中心の向き（facing）を preview.glb に記録し、エディタとサムネイルはその正面から見る。
// scripts/thumbnail/render.html にも同じ計算があるので、変えるときは両方を直すこと

export type PreviewExtras = {
  source: string;
  sourceSha256: string;
  prefab: string;
  // プリント面の中心の法線（glTF の座標）。記録がなければ正面（+Z）
  facing?: [number, number, number];
};

export function cameraDirection(facing?: readonly number[] | null): [number, number, number] {
  let [x, y, z] = facing && facing.length === 3 && facing.some((v) => v !== 0) ? facing : [0, 0, 1];
  const len = Math.hypot(x, y, z);
  [x, y, z] = [x / len, y / len, z / len];
  if (Math.abs(y) > 0.9) {
    // 真上・真下から見ると向きが決まらないので、手前（+Z）に少し傾ける
    z += 0.45;
  } else {
    // 横向きの面は、少し上から見下ろす
    y += 0.3;
  }
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
}
