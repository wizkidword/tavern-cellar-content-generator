import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "foundry_session";

const SESSION_VERSION = 1;
const SIGNATURE_ALGORITHM = "sha256";

export type OperatorSession = {
  sub: "operator";
  sid: string;
  iat: number;
  exp: number;
  ver: typeof SESSION_VERSION;
};

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string, secret: string) {
  return createHmac(SIGNATURE_ALGORITHM, secret).update(value).digest("base64url");
}

function isSessionPayload(value: unknown): value is OperatorSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    payload.sub === "operator" &&
    typeof payload.sid === "string" &&
    payload.sid.length >= 16 &&
    typeof payload.iat === "number" &&
    Number.isInteger(payload.iat) &&
    typeof payload.exp === "number" &&
    Number.isInteger(payload.exp) &&
    payload.ver === SESSION_VERSION
  );
}

export function hasStrongSessionSecret(value: string) {
  return Buffer.byteLength(value, "utf8") >= 32;
}

export function timingSafeStringEqual(left: string, right: string) {
  const leftDigest = createHmac(SIGNATURE_ALGORITHM, "foundry-credential-compare")
    .update(left)
    .digest();
  const rightDigest = createHmac(SIGNATURE_ALGORITHM, "foundry-credential-compare")
    .update(right)
    .digest();

  return timingSafeEqual(leftDigest, rightDigest);
}

export function createOperatorSessionToken(
  secret: string,
  maxAgeSeconds: number,
  now = Math.floor(Date.now() / 1000),
) {
  const payload: OperatorSession = {
    sub: "operator",
    sid: base64UrlEncode(randomBytes(18)),
    iat: now,
    exp: now + maxAgeSeconds,
    ver: SESSION_VERSION,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `v${SESSION_VERSION}.${encodedPayload}`;

  return `${unsignedToken}.${sign(unsignedToken, secret)}`;
}

export function verifyOperatorSessionToken(
  token: string | null | undefined,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): OperatorSession | null {
  if (!token || !hasStrongSessionSecret(secret)) {
    return null;
  }

  const [version, encodedPayload, suppliedSignature, ...remainder] = token.split(".");

  if (
    version !== `v${SESSION_VERSION}` ||
    !encodedPayload ||
    !suppliedSignature ||
    remainder.length > 0
  ) {
    return null;
  }

  const unsignedToken = `${version}.${encodedPayload}`;
  const expectedSignature = sign(unsignedToken, secret);

  if (!timingSafeStringEqual(suppliedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;

    if (!isSessionPayload(payload) || payload.exp <= now || payload.iat > now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
