import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  assertOperatorRequest,
  assertSameOrigin,
  getOperatorSessionFromCookieHeader,
  getOperatorSessionFromCookieValue,
  OperatorAccessError,
} from "@/lib/auth/guards";
import { assertProviderRequestAllowed } from "@/lib/auth/rate-limit";
import {
  createOperatorSessionToken,
  SESSION_COOKIE_NAME,
  timingSafeStringEqual,
} from "@/lib/auth/session";
import { getOperatorAuthConfig } from "@/lib/env";

export { CsrfRejectedError, OperatorAccessError } from "@/lib/auth/guards";
export { RateLimitedError } from "@/lib/auth/rate-limit";

export async function requireOperatorPage() {
  const config = getOperatorAuthConfig();
  const cookieStore = await cookies();
  const session = getOperatorSessionFromCookieValue(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
    config,
  );

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function assertOperatorActionAccess() {
  const config = getOperatorAuthConfig();
  const headerStore = await headers();
  const session = getOperatorSessionFromCookieHeader(headerStore.get("cookie"), config);

  if (!session) {
    throw new OperatorAccessError();
  }

  assertSameOrigin(headerStore.get("origin"), config.appOrigin);
  return session;
}

export function assertOperatorApiAccess(request: Request) {
  return assertOperatorRequest(request, getOperatorAuthConfig());
}

export function assertOperatorCredential(candidate: string) {
  const config = getOperatorAuthConfig();
  return timingSafeStringEqual(candidate, config.operatorToken);
}

export async function createOperatorSession() {
  const config = getOperatorAuthConfig();
  const token = createOperatorSessionToken(config.sessionSecret, config.maxAgeSeconds);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: config.maxAgeSeconds,
    path: "/",
    sameSite: "strict",
    secure: config.secureCookie,
  });
}

export async function clearOperatorSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export function assertProviderActionAllowed(sessionId: string) {
  assertProviderRequestAllowed(sessionId);
}
