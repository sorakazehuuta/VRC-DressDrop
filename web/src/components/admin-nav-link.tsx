import Link from "next/link";
import { getMessages } from "@/i18n/server";
import { commonMessages } from "./messages";

// 管理画面へのリンク。サーバーで管理者と確かめたときだけ描画し、ヘッダーのメニュー（クライアント）には
// 描画済みの要素として渡す。管理者以外のページの HTML・JavaScript には URL も文字も含まれない
export async function AdminNavLink({ variant }: { variant: "tab" | "menu" }) {
  const m = await getMessages(commonMessages);
  return (
    <Link
      href="/admin"
      className={
        variant === "tab"
          ? "rounded-md border border-zinc-300 px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-50"
          : "block border-l-4 border-transparent px-4 py-3 text-zinc-700 hover:bg-zinc-50"
      }
    >
      {m.nav.admin}
    </Link>
  );
}
