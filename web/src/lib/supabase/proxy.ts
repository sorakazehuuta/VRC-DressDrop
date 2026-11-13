import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "./env";

// respond: 返すレスポンスを作る（そのまま進める・英語の URL を振り替える など）。Cookie を更新したら作り直す
export async function updateSession(request: NextRequest, respond: (request: NextRequest) => NextResponse = (req) => NextResponse.next({ request: req })) {
  let response = respond(request);

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = respond(request);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // セッションの期限切れトークンをここで更新する。createServerClient との間に処理を挟まないこと
  await supabase.auth.getClaims();

  return response;
}
