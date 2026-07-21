import { AppError } from "@/lib/errors/app-error";

type FetchPolicy = {
  retries?: number;
  service: "image" | "wordpress";
  timeoutMs: number;
  uncertainWrite?: boolean;
};

function retryDelay(attempt: number) {
  return 120 * 2 ** attempt + Math.floor(Math.random() * 80);
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function failureCodeFor(policy: FetchPolicy, timedOut: boolean) {
  if (policy.service === "wordpress") {
    if (timedOut && policy.uncertainWrite) {
      return "WP_WRITE_UNCERTAIN";
    }

    return timedOut ? "WP_TIMEOUT" : "WP_RESPONSE_INVALID";
  }

  return timedOut ? "IMAGE_OPERATION_FAILED" : "IMAGE_DOWNLOAD_INVALID";
}

export async function fetchWithPolicy(
  input: RequestInfo | URL,
  init: RequestInit,
  policy: FetchPolicy,
): Promise<Response> {
  const retries = policy.retries ?? 0;
  let lastFailure: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      if (attempt < retries && shouldRetryStatus(response.status)) {
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
        continue;
      }

      return response;
    } catch (error) {
      lastFailure = error;

      if (attempt < retries && !controller.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
        continue;
      }

      throw new AppError(failureCodeFor(policy, controller.signal.aborted), {
        cause: error,
        retryable: !controller.signal.aborted,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new AppError(failureCodeFor(policy, false), {
    cause: lastFailure,
    retryable: true,
  });
}

export async function withOperationTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  code: "AI_TIMEOUT" | "IMAGE_OPERATION_FAILED",
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new AppError(code, { retryable: true })), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
