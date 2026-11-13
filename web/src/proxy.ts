import { NextResponse, type NextRequest } from "next/server";
import { isLocalizable, LOCALE_COOKIE, LOCALE_HEADER, localePath, PATH_HEADER, splitLocale, type Locale } from "@/i18n/config";
import { detectLocale, isCrawler } from "@/i18n/detect";
import { updateSession } from "@/lib/supabase/proxy";

// ページへ表示する言語を伝える。英語の URL（/en/...）は /en を外したページに振り替える
function withLocale(locale: Locale, path: string, rewrite: boolean) {
  return (request: NextRequest) => {
    const headers = new Headers(request.headers);
    headers.set(LOCALE_HEADER, locale);
    headers.set(PATH_HEADER, path);
    if (!rewrite) return NextResponse.next({ request: { headers } });
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.rewrite(url, { request: { headers } });
  };
}

// 管理画面は日本語だけ（言語を付けない）。URL はブラウザに届くファイルに書かないため、ここでだけ判定する
const isAdminPath = (path: string) => path === "/admin" || path.startsWith("/admin/");

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const redirectTo = (path: string) => NextResponse.redirect(new URL(`${path}${search}`, request.url));

  // /ja/... は日本語の URL（言語なし）にそろえる
  if (pathname === "/ja" || pathname.startsWith("/ja/")) return redirectTo(pathname.slice(3) || "/");

  const { locale, path } = splitLocale(pathname);
  if (isAdminPath(path)) {
    // 管理画面は言語を付けない（英語の URL は日本語の URL へ）。ページには日本語とパスを伝える
    if (locale === "en") return redirectTo(path);
    return updateSession(request, withLocale("ja", path, false));
  }
  if (!isLocalizable(path)) {
    // API・認証の受け口は言語を付けない
    if (locale === "en") return redirectTo(path);
    return updateSession(request);
  }

  if (locale === "en") return updateSession(request, withLocale("en", path, true));

  // 日本語の URL: 利用者が英語を選んでいるか、初めての日本以外からのアクセスなら英語版へ転送する（ページの読み込みだけ。検索エンジンは除く）
  const isPageLoad = request.method === "GET" && request.headers.get("sec-fetch-dest") !== "empty" && !request.headers.has("rsc") && !request.headers.has("next-action");
  if (isPageLoad && !isCrawler(request.headers.get("user-agent"))) {
    const preferred = detectLocale({
      cookie: request.cookies.get(LOCALE_COOKIE)?.value,
      country: request.headers.get("x-vercel-ip-country"),
    });
    if (preferred === "en") return redirectTo(localePath("en", path));
  }
  return updateSession(request, withLocale("ja", path, false));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|fbx|ico|txt|xml|webmanifest)$).*)"],
};
