import { processDeletions } from "@/lib/storage-deletions";

// 削除に失敗した Storage のファイルを再試行する（Vercel Cron から1日1回呼ぶ。vercel.json を参照）
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await processDeletions());
}
