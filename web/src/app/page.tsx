import Link from "next/link";
import { FormMessage } from "@/components/ui";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { deleted } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      {deleted === "1" && <FormMessage state={{ message: "退会が完了しました。ご利用ありがとうございました。" }} />}
      <h1 className="text-3xl font-bold">VRC-DressDrop</h1>
      <p className="text-lg leading-relaxed">
        画像を貼るだけで、VRChatのワールドに置ける展示用3Dモデルを作れます。
        即売会のブースに、あなたのグッズのサンプルを並べましょう。
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/templates" className="rounded-md border border-zinc-300 px-5 py-3 font-semibold dark:border-zinc-700">
          さっそく作ってみる
        </Link>
        <Link href="/signup" className="rounded-md bg-zinc-900 px-5 py-3 font-semibold text-white dark:bg-white dark:text-zinc-900">
          無料で登録（3トークン付き）
        </Link>
      </div>
    </main>
  );
}
