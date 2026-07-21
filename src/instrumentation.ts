function isLoopbackHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const configuredOrigin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";

  try {
    if (isLoopbackHostname(new URL(configuredOrigin).hostname)) {
      return;
    }
  } catch {
    // The shared config validator below reports the actual configuration problem.
  }

  console.warn(
    "[foundry] A non-loopback APP_ORIGIN is configured. Verifying required operator authentication before accepting requests.",
  );

  const { getOperatorAuthConfig } = await import("@/lib/env");
  getOperatorAuthConfig();
}
