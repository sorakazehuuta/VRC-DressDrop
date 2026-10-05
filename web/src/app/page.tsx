import Image from "next/image";
import Link from "next/link";
import { FormMessage } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import icon from "../../images/common/icons/VRPrintLab_icon.png";

const steps = [
  { title: "テンプレートを選ぶ", body: "Tシャツなど、展示したいグッズの形を選びます。" },
  { title: "画像を貼って調整", body: "画像をアップロードして、大きさ・位置・色をブラウザ上で調整します。" },
  { title: "VRChat に置く", body: "unitypackage をダウンロードして、ワールドのブースに配置します。" },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);

  return (
    <main className="flex flex-1 flex-col">
      {deleted === "1" && (
        <div className="mx-auto w-full max-w-5xl px-4 pt-6">
          <FormMessage state={{ message: "退会が完了しました。ご利用ありがとうございました。" }} />
        </div>
      )}

      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-16 md:grid-cols-[1fr_auto] md:py-24">
        <div className="flex flex-col gap-6">
          <h1 className="text-3xl font-bold leading-tight text-brand sm:text-4xl">
            画像を貼るだけで、
            <br />
            VRChat に置ける3Dグッズに。
          </h1>
          <p className="text-lg leading-relaxed text-zinc-600">
            モデリングの知識は不要です。即売会のブースに、あなたのグッズのサンプルを並べましょう。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/templates" className="rounded-md bg-accent px-5 py-3 font-semibold text-white hover:bg-accent-dark">
              さっそく作ってみる
            </Link>
            {loggedIn ? (
              <Link href="/works" className="rounded-md border border-brand px-5 py-3 font-semibold text-brand hover:bg-zinc-50">
                マイ作品を見る
              </Link>
            ) : (
              <Link href="/signup" className="rounded-md border border-brand px-5 py-3 font-semibold text-brand hover:bg-zinc-50">
                無料で登録（3トークン付き）
              </Link>
            )}
          </div>
        </div>
        <Image src={icon} alt="" priority className="mx-auto hidden w-64 md:block" sizes="256px" />
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50">
        <ol className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-12 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
              <h2 className="font-semibold text-brand">{step.title}</h2>
              <p className="text-sm leading-relaxed text-zinc-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
