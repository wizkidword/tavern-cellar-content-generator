export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type RateLimitEntry = {
  count: number;
  startedAt: number;
};

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(private readonly policy: RateLimitPolicy) {}

  check(key: string, now = Date.now()): RateLimitResult {
    const entry = this.entries.get(key);

    if (!entry || now - entry.startedAt >= this.policy.windowMs) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return {
      allowed: entry.count < this.policy.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((this.policy.windowMs - (now - entry.startedAt)) / 1000)),
    };
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    const current = this.entries.get(key);
    const entry =
      !current || now - current.startedAt >= this.policy.windowMs
        ? { count: 0, startedAt: now }
        : current;
    const status = this.check(key, now);

    if (!status.allowed) {
      return status;
    }

    entry.count += 1;
    this.entries.set(key, entry);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  clear(key: string) {
    this.entries.delete(key);
  }
}

export class RateLimitedError extends Error {
  readonly code = "RATE_LIMITED";

  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests. Try again shortly.");
    this.name = "RateLimitedError";
  }
}

const loginFailures = new FixedWindowRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });
const providerRequests = new FixedWindowRateLimiter({ limit: 12, windowMs: 10 * 60 * 1000 });
const providerRequestsGlobal = new FixedWindowRateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 });

export function assertLoginAttemptAllowed() {
  const status = loginFailures.check("global");

  if (!status.allowed) {
    throw new RateLimitedError(status.retryAfterSeconds);
  }
}

export function recordFailedLoginAttempt() {
  loginFailures.consume("global");
}

export function clearFailedLoginAttempts() {
  loginFailures.clear("global");
}

export function assertProviderRequestAllowed(sessionId: string) {
  const sessionStatus = providerRequests.check(sessionId);
  const globalStatus = providerRequestsGlobal.check("global");
  const blockedStatus = !sessionStatus.allowed ? sessionStatus : globalStatus;

  if (!blockedStatus.allowed) {
    throw new RateLimitedError(blockedStatus.retryAfterSeconds);
  }

  providerRequests.consume(sessionId);
  providerRequestsGlobal.consume("global");
}
