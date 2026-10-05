import type { ComponentProps, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Field({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        {...props}
      />
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

const buttonStyles = {
  primary: "bg-brand text-white hover:bg-brand-light",
  secondary:
    "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

// ボタンと同じ見た目のリンクにも使う
export const buttonClassName = (variant: keyof typeof buttonStyles = "primary", className = "") =>
  `inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`;

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
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state?.message) {
    return (
      <p aria-live="polite" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {state.message}
      </p>
    );
  }
  return null;
}
