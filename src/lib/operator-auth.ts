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
  type OperatorSession,
  SESSION_COOKIE_NAME,
  timingSafeStringEqual,
} from "@/lib/auth/session";
import { getOperatorAuthConfig, isOperatorAuthenticationRequired } from "@/lib/env";

export { CsrfRejectedError, OperatorAccessError } from "@/lib/auth/guards";
export { RateLimitedError } from "@/lib/auth/rate-limit";

function getLocalOperatorSession(): OperatorSession {
  const now = Math.floor(Date.now() / 1000);

  return {
    sub: "operator",
    sid: "local-auth-disabled",
    iat: now,
    exp: now + 60 * 60,
    ver: 1,
  };
}

export async function requireOperatorPage() {
  if (!isOperatorAuthenticationRequired()) {
    return getLocalOperatorSession();
  }

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
  if (!isOperatorAuthenticationRequired()) {
    return getLocalOperatorSession();
  }

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
  if (!isOperatorAuthenticationRequired()) {
    return getLocalOperatorSession();
  }

  return assertOperatorRequest(request, getOperatorAuthConfig());
}

export function assertOperatorCredential(candidate: string) {
  if (!isOperatorAuthenticationRequired()) {
    return true;
  }

  const config = getOperatorAuthConfig();
  return timingSafeStringEqual(candidate, config.operatorToken);
}

export async function createOperatorSession() {
  if (!isOperatorAuthenticationRequired()) {
    return;
  }

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
  if (!isOperatorAuthenticationRequired()) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export function assertProviderActionAllowed(sessionId: string) {
  assertProviderRequestAllowed(sessionId);
}
