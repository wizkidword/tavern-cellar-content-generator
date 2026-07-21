import { OperatorSession, SESSION_COOKIE_NAME, verifyOperatorSessionToken } from "@/lib/auth/session";

export type OperatorAuthConfig = {
  appOrigin: string;
  sessionSecret: string;
};

export class OperatorAccessError extends Error {
  readonly code = "AUTH_REQUIRED";

  constructor() {
    super("Sign in is required to access Tavern Cellar Foundry.");
    this.name = "OperatorAccessError";
  }
}

export class CsrfRejectedError extends Error {
  readonly code = "CSRF_REJECTED";

  constructor() {
    super("This request did not come from the configured Foundry origin.");
    this.name = "CsrfRejectedError";
  }
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function getOperatorSessionFromCookieHeader(
  cookieHeader: string | null,
  config: OperatorAuthConfig,
) {
  return getOperatorSessionFromCookieValue(readCookie(cookieHeader, SESSION_COOKIE_NAME), config);
}

export function getOperatorSessionFromCookieValue(
  cookieValue: string | null | undefined,
  config: OperatorAuthConfig,
) {
  return verifyOperatorSessionToken(cookieValue, config.sessionSecret);
}

export function assertSameOrigin(origin: string | null, configuredOrigin: string) {
  if (!origin) {
    throw new CsrfRejectedError();
  }

  try {
    if (new URL(origin).origin !== new URL(configuredOrigin).origin) {
      throw new CsrfRejectedError();
    }
  } catch (error) {
    if (error instanceof CsrfRejectedError) {
      throw error;
    }

    throw new CsrfRejectedError();
  }
}

export function assertOperatorRequest(
  request: Request,
  config: OperatorAuthConfig,
): OperatorSession {
  const session = getOperatorSessionFromCookieHeader(request.headers.get("cookie"), config);

  if (!session) {
    throw new OperatorAccessError();
  }

  assertSameOrigin(request.headers.get("origin"), config.appOrigin);
  return session;
}
