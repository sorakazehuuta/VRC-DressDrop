"use server";

import { listGimmicks } from "@/lib/gimmicks/queries";
import { getTemplate } from "@/lib/templates/queries";

// 管理画面で変わったトークン数を、開いたままのエディタに反映するために読む（表示用。課金はダウンロード時にサーバーで計算する）
export async function latestCosts(slug: string) {
  const [template, gimmicks] = await Promise.all([getTemplate(slug), listGimmicks()]);
  return {
    template: template?.tokenCost ?? null,
    gimmicks: Object.fromEntries(gimmicks.map((g) => [g.slug, g.tokenCost])) as Record<string, number>,
  };
}
