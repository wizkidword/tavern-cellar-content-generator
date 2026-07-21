import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, verifyOperatorSessionToken } from "@/lib/auth/session";

function unauthorizedApiResponse() {
  return NextResponse.json(
    {
      error: {
        code: "AUTH_REQUIRED",
        message: "Sign in is required to access Tavern Cellar Foundry.",
      },
    },
    {
      status: 401,
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    },
  );
}

export function proxy(request: NextRequest) {
  const session = verifyOperatorSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
    process.env.SESSION_SECRET ?? "",
  );
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return unauthorizedApiResponse();
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
