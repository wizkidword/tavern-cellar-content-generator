import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOperatorRequest,
  CsrfRejectedError,
  getOperatorSessionFromCookieValue,
  OperatorAccessError,
} from "@/lib/auth/guards";
import { FixedWindowRateLimiter } from "@/lib/auth/rate-limit";
import {
  createOperatorSessionToken,
  SESSION_COOKIE_NAME,
  timingSafeStringEqual,
  verifyOperatorSessionToken,
} from "@/lib/auth/session";
import { proxy } from "@/proxy";
import { validateWordPressOriginIp, validateWordPressUrl } from "@/lib/env";
import { NextRequest } from "next/server";

const secret = "0123456789abcdef0123456789abcdef";
const config = {
  appOrigin: "https://foundry.example.test",
  sessionSecret: secret,
};

function sessionCookie(token: string) {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

test("issues a signed, expiring operator session without storing the credential", () => {
  const token = createOperatorSessionToken(secret, 60, 1_000);
  const session = verifyOperatorSessionToken(token, secret, 1_030);

  assert.ok(session);
  assert.equal(session.sub, "operator");
  assert.equal(session.exp, 1_060);
  assert.equal(token.includes("FOUNDRY_OPERATOR_TOKEN"), false);

  const currentToken = createOperatorSessionToken(secret, 60);
  assert.equal(getOperatorSessionFromCookieValue(currentToken, config)?.sub, "operator");
});

test("rejects expired and tampered sessions", () => {
  const token = createOperatorSessionToken(secret, 60, 1_000);
  const tampered = `${token.slice(0, -1)}x`;

  assert.equal(verifyOperatorSessionToken(token, secret, 1_061), null);
  assert.equal(verifyOperatorSessionToken(tampered, secret, 1_030), null);
});

test("uses timing-safe credential comparisons", () => {
  assert.equal(timingSafeStringEqual("correct operator credential", "correct operator credential"), true);
  assert.equal(timingSafeStringEqual("correct operator credential", "incorrect operator credential"), false);
});

test("requires HTTPS for non-local WordPress endpoints", () => {
  assert.equal(validateWordPressUrl("https://taverncellar.com").hostname, "taverncellar.com");
  assert.equal(validateWordPressUrl("http://localhost:8080").hostname, "localhost");
  assert.throws(
    () => validateWordPressUrl("http://wordpress.example.test"),
    /WORDPRESS_URL must use HTTPS/,
  );
});

test("validates an optional direct WordPress origin route", () => {
  assert.equal(validateWordPressOriginIp(undefined), undefined);
  assert.equal(validateWordPressOriginIp(" 192.0.2.10 "), "192.0.2.10");
  assert.equal(validateWordPressOriginIp("2001:db8::1"), "2001:db8::1");
  assert.throws(
    () => validateWordPressOriginIp("wordpress.example.test"),
    /WORDPRESS_ORIGIN_IP must be a valid IPv4 or IPv6 address/,
  );
});

test("does not authorize a request that only spoofs a localhost Host header", () => {
  const request = new Request("https://remote.example.test/api/assist/keywords", {
    headers: {
      host: "localhost",
      origin: config.appOrigin,
    },
    method: "POST",
  });

  assert.throws(() => assertOperatorRequest(request, config), OperatorAccessError);
});

test("does not authorize a request that only spoofs X-Forwarded-Host", () => {
  const request = new Request("https://remote.example.test/api/assist/keywords", {
    headers: {
      origin: config.appOrigin,
      "x-forwarded-host": "localhost",
    },
    method: "POST",
  });

  assert.throws(() => assertOperatorRequest(request, config), OperatorAccessError);
});

test("does not authorize a request that only spoofs a localhost Origin header", () => {
  const request = new Request("https://remote.example.test/api/assist/keywords", {
    headers: {
      origin: "http://localhost:3000",
    },
    method: "POST",
  });

  assert.throws(() => assertOperatorRequest(request, config), OperatorAccessError);
});

test("requires the configured origin even for a valid signed session", () => {
  const token = createOperatorSessionToken(secret, 60 * 60);
  const request = new Request("https://remote.example.test/api/assist/keywords", {
    headers: {
      cookie: sessionCookie(token),
      origin: "https://attacker.example.test",
    },
    method: "POST",
  });

  assert.throws(() => assertOperatorRequest(request, config), CsrfRejectedError);
});

test("permits a valid session only when it arrives from the configured origin", () => {
  const token = createOperatorSessionToken(secret, 60 * 60);
  const request = new Request(`${config.appOrigin}/api/assist/keywords`, {
    headers: {
      cookie: sessionCookie(token),
      origin: config.appOrigin,
    },
    method: "POST",
  });

  const session = assertOperatorRequest(request, config);
  assert.equal(session.sub, "operator");
});

test("proxy redirects unauthenticated page reads and returns structured API authentication errors", async () => {
  const pageResponse = proxy(
    new NextRequest("https://remote.example.test/opportunities", {
      headers: { host: "localhost", "x-forwarded-host": "localhost" },
    }),
  );
  const apiResponse = proxy(new NextRequest("https://remote.example.test/api/assist/keywords"));

  assert.equal(pageResponse.status, 307);
  assert.equal(pageResponse.headers.get("location"), "https://remote.example.test/login");
  assert.equal(apiResponse.status, 401);
  assert.deepEqual(await apiResponse.json(), {
    error: {
      code: "AUTH_REQUIRED",
      message: "Sign in is required to access Tavern Cellar Foundry.",
    },
  });
});

test("throttles repeated failures and recovers after the fixed window", () => {
  const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 1_000 });

  assert.equal(limiter.consume("operator", 0).allowed, true);
  assert.equal(limiter.consume("operator", 100).allowed, true);
  assert.equal(limiter.consume("operator", 200).allowed, false);
  assert.equal(limiter.consume("operator", 1_001).allowed, true);
});
