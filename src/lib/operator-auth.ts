import { headers } from "next/headers";

import { getServerEnv } from "@/lib/env";

export class OperatorAccessError extends Error {
  constructor() {
    super(
      "Operator access denied. Use Foundry from localhost or configure FOUNDRY_OPERATOR_TOKEN for remote access.",
    );
    this.name = "OperatorAccessError";
  }
}

type OperatorAccessInput = {
  host?: string | null;
  origin?: string | null;
  token?: string | null;
};

function hostnameFromHost(host: string | null | undefined) {
  if (!host) {
    return "";
  }

  const trimmed = host.trim().toLowerCase();

  if (trimmed.startsWith("[")) {
    return trimmed.slice(1, trimmed.indexOf("]"));
  }

  return trimmed.split(":")[0];
}

function hostnameFromOrigin(origin: string | null | undefined) {
  if (!origin) {
    return "";
  }

  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function cookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

export function assertOperatorAccess(input: OperatorAccessInput) {
  const env = getServerEnv();
  const hostName = hostnameFromHost(input.host);
  const originName = hostnameFromOrigin(input.origin);
  const isLocal = isLocalHostname(hostName) || isLocalHostname(originName);

  if (isLocal) {
    return;
  }

  if (env.FOUNDRY_OPERATOR_TOKEN && input.token === env.FOUNDRY_OPERATOR_TOKEN) {
    return;
  }

  throw new OperatorAccessError();
}

export async function assertOperatorAccessFromHeaders() {
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie");

  assertOperatorAccess({
    host: headerStore.get("x-forwarded-host") ?? headerStore.get("host"),
    origin: headerStore.get("origin"),
    token:
      headerStore.get("x-foundry-operator-token") ??
      cookieValue(cookieHeader, "foundry_operator_token"),
  });
}

export function assertOperatorAccessForRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const cookieHeader = request.headers.get("cookie");

  assertOperatorAccess({
    host:
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      requestUrl.host,
    origin: request.headers.get("origin"),
    token:
      request.headers.get("x-foundry-operator-token") ??
      cookieValue(cookieHeader, "foundry_operator_token"),
  });
}
