import type { GimmickParamValue, GimmickSelection } from "@/lib/gimmicks/schema";

// エディタの3D表示でギミックの動きを試すための状態。
// 「触る」などの操作は回数（touches）や番号（actionId）で伝え、3D側はその変化を見て動かす
export type PreviewState = {
  playing: boolean;
  // 暗いワールドを想定して照明を落とす（光る系のギミックが見やすくなる）
  dark: boolean;
  // 「触る」を押した回数。ON/OFF や段階的な回転はこの回数から決める
  touches: number;
  // 「持って動かす」「持って振る」のデモ。actionId が変わるたびに最初から再生する
  action: { kind: "hold" | "shake"; id: number } | null;
  // 「近づくと光る」: 人が反応する距離の内側にいるか（カメラの距離は見た目の大きさで変わるため、ボタンで切り替える）
  near: boolean;
};

export const initialPreviewState: PreviewState = { playing: true, dark: false, touches: 0, action: null, near: false };

// プレビューに対応しているギミック。新しいギミックを追加したら、3D側（preview-3d.tsx）とここに追加する
export const PREVIEW_SLUGS = [
  "toggle-visibility",
  "toggle-particles",
  "toggle-light",
  "toggle-transparency",
  "spin",
  "step-rotate",
  "glow-on-touch",
  "sway-on-touch",
  "glow-on-approach",
  "particles",
  "trail",
  "glow",
  "magic-circle",
  "pickup",
  "shake-sparkle",
  "follow",
] as const;

// 光る・照らす・粒が舞うなど、暗い場所のほうが見え方が分かりやすいギミック
const LOOKS_BETTER_IN_DARK = new Set(["toggle-particles", "toggle-light", "glow-on-touch", "glow-on-approach", "particles", "trail", "glow", "magic-circle", "shake-sparkle"]);

export const looksBetterInDark = (slug: string) => LOOKS_BETTER_IN_DARK.has(slug);

export function findSelection(selected: GimmickSelection[], slug: string) {
  return selected.find((s) => s.slug === slug);
}

export const num = (params: Record<string, GimmickParamValue>, key: string, fallback: number) => {
  const v = params[key];
  return typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : fallback;
};
export const bool = (params: Record<string, GimmickParamValue>, key: string, fallback: boolean) => {
  const v = params[key];
  return typeof v === "boolean" ? v : fallback;
};
export const color = (params: Record<string, GimmickParamValue>, key: string, fallback: string) => {
  const v = params[key];
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
};

export type PrimaryAction = { kind: "touch" | "hold" | "shake"; label: string; hint: string };

// 選んだギミックに合わせて、プレビューのメインのボタンを決める（触ったときの動作は1つしか選べない）
export function primaryAction(selected: GimmickSelection[], touches: number): PrimaryAction | null {
  const has = (slug: string) => selected.some((s) => s.slug === slug);
  if (has("pickup")) return { kind: "hold", label: "持って動かす", hint: "手で持って動かしたときの様子を再生します。" };
  if (has("shake-sparkle")) return { kind: "shake", label: "持って振る", hint: "手で持って振ったときの様子を再生します。" };
  if (has("toggle-visibility")) return { kind: "touch", label: "スイッチを押す", hint: "横の小さなスイッチをクリックしても押せます。" };
  if (has("follow")) {
    return {
      kind: "touch",
      label: touches % 2 === 1 ? "触る（止める）" : "触る（ついてくる）",
      hint: "触った人の肩のあたりについてくる動きを、その場で再現しています。",
    };
  }
  if (["toggle-light", "toggle-particles", "toggle-transparency", "step-rotate", "sway-on-touch", "glow-on-touch"].some(has)) {
    return { kind: "touch", label: "触る", hint: "モデルをクリックしても触れます。" };
  }
  return null;
}
