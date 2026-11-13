import type { ComponentProps, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-6 ${className}`}>
      {children}
    </div>
  );
}

// 白い箱で囲まずに、上の区切り線と見出しでまとまりを分ける節（同じ形の箱を縦に並べないため）
export function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border-t border-zinc-200 pt-6 first:border-t-0 first:pt-0 ${className}`}>{children}</section>;
}

export function Field({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold text-zinc-800">{label}</span>
      <input
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        {...props}
      />
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

// primary: 確定・保存などの操作、accent: 作る・買う・ダウンロードなど先へ進む操作（1 画面に 1 つ）
const buttonStyles = {
  primary: "bg-brand text-white hover:bg-brand-light",
  accent: "bg-accent text-white hover:bg-accent-dark",
  secondary:
    "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

// ボタンと同じ見た目のリンクにも使う
export const buttonClassName = (variant: keyof typeof buttonStyles = "primary", className = "") =>
  `inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return <button className={buttonClassName(variant, className)} {...props} />;
}

export function FormMessage({ state }: { state: { error?: string; message?: string } | null | undefined }) {
  if (state?.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state?.message) {
    return (
      <p aria-live="polite" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {state.message}
      </p>
    );
  }
  return null;
}
