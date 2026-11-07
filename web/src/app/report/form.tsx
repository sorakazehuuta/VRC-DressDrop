"use client";

import { useActionState } from "react";
import { Button, Field, FormMessage } from "@/components/ui";
import { reportCategories } from "@/lib/reports";
import { submitReport } from "./actions";

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function ReportForm() {
  const [state, action, pending] = useActionState(submitReport, null);
  if (state?.message) return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">通報の種類</span>
        <select name="category" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            選んでください
          </option>
          {Object.entries(reportCategories).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="取得 ID（分かれば）"
        name="purchaseRef"
        autoComplete="off"
        maxLength={100}
        hint="パッケージに入っている LICENSE.txt の「取得 ID」です。作品を特定するのに使います。"
      />
      <Field label="見かけた場所（分かれば）" name="location" maxLength={500} hint="ワールド名、販売ページの URL など" />
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">内容</span>
        <textarea name="details" required minLength={10} maxLength={1000} rows={6} className={inputClass} />
        <span className="text-xs text-zinc-500">
          どの画像が、どのような権利を侵害しているかなどを書いてください。権利者ご本人からの申し立ての場合は、その旨も書いてください。
        </span>
      </label>
      <Field label="連絡先のメールアドレス（任意）" name="contactEmail" type="email" autoComplete="email" hint="確認のためにご連絡することがあります。" />
      {/* ボット対策（画面には出さない） */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "送信中…" : "通報する"}
      </Button>
    </form>
  );
}
