import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  request.headers.delete("x-vrpl-local-preview");
  // Local model review never needs an account or a Supabase request.
  // This narrowly scoped bypass must not apply to the actual editor or APIs.
  if (process.env.NODE_ENV === "development" &&
      (request.nextUrl.pathname === "/local-preview/cake" ||
       request.nextUrl.pathname.startsWith("/local-preview/cake/"))) {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname)) {
      return new NextResponse("Not found", { status: 404 });
    }
    const headers = new Headers(request.headers);
    headers.set("x-vrpl-local-preview", "cake");
    return NextResponse.next({ request: { headers } });
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|fbx)$).*)"],
};
