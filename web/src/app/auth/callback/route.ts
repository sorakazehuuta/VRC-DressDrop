import { NextResponse, type NextRequest } from "next/server";
import { localePath, splitLocale } from "@/i18n/config";
import { DISPOSABLE_EMAIL_MARKER, safeNextPath } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/legal";
import { createAdminClient, createClient } from "@/lib/supabase/server";

// OAuth・確認メール・パスワード再設定メールから戻ってきたときの受け口（PKCE の code を交換する）
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Google / Discord での登録・ログインは、ログイン画面の「同意したものとみなします」で同意した扱いにする（まだ記録がない人だけ）
      if (data.user) {
        await createAdminClient()
          .from("profiles")
          .update({ terms_version: TERMS_VERSION, terms_agreed_at: new Date().toISOString() })
          .eq("id", data.user.id)
          .is("terms_version", null);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Google / Discord のメールアドレスが使い捨てのドメインで、登録を拒否されたとき
  const reason = searchParams.get("error_description")?.includes(DISPOSABLE_EMAIL_MARKER) ? "disposable" : "callback";
  // ログイン画面は、戻り先（next）と同じ言語で開く
  const login = localePath(splitLocale(next).locale, `/login?error=${reason}&next=${encodeURIComponent(next)}`);
  return NextResponse.redirect(`${origin}${login}`);
}
