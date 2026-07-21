import { randomUUID } from "node:crypto";

export const APP_ERROR_CODES = [
  "AUTH_REQUIRED",
  "AUTH_INVALID",
  "CSRF_REJECTED",
  "RATE_LIMITED",
  "VALIDATION_FAILED",
  "WP_AUTH_FAILED",
  "WP_TIMEOUT",
  "WP_RESPONSE_INVALID",
  "WP_WRITE_UNCERTAIN",
  "PUBLISH_STATE_CONFLICT",
  "AI_RATE_LIMITED",
  "AI_TIMEOUT",
  "AI_RESPONSE_INVALID",
  "IMAGE_DOWNLOAD_INVALID",
  "IMAGE_TOO_LARGE",
  "IMAGE_OPERATION_FAILED",
  "DATABASE_CONFLICT",
  "OPERATION_FAILED",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

const publicMessages: Record<AppErrorCode, string> = {
  AUTH_REQUIRED: "Sign in is required to continue.",
  AUTH_INVALID: "The operator credential was not accepted.",
  CSRF_REJECTED: "This request did not come from the configured Foundry origin.",
  RATE_LIMITED: "That action is temporarily limited. Please wait and try again.",
  VALIDATION_FAILED: "Please check the form details and try again.",
  WP_AUTH_FAILED: "WordPress did not accept the configured credentials.",
  WP_TIMEOUT: "WordPress took too long to respond. No automatic write retry was attempted.",
  WP_RESPONSE_INVALID: "WordPress could not complete that request.",
  WP_WRITE_UNCERTAIN: "WordPress may have received the request, but Foundry could not confirm the result.",
  PUBLISH_STATE_CONFLICT: "This item is no longer in a state that can be published.",
  AI_RATE_LIMITED: "The AI provider is temporarily limiting requests. Please try again shortly.",
  AI_TIMEOUT: "The AI provider took too long to respond.",
  AI_RESPONSE_INVALID: "The AI provider returned an unusable response.",
  IMAGE_DOWNLOAD_INVALID: "The generated image could not be safely accepted.",
  IMAGE_TOO_LARGE: "The generated image is too large to accept.",
  IMAGE_OPERATION_FAILED: "The image operation could not be completed.",
  DATABASE_CONFLICT: "The record changed while Foundry was processing it. Please refresh and try again.",
  OPERATION_FAILED: "Foundry could not complete that request.",
};

export class AppError extends Error {
  readonly correlationId: string;

  constructor(
    readonly code: AppErrorCode,
    options: {
      cause?: unknown;
      correlationId?: string;
      retryable?: boolean;
    } = {},
  ) {
    super(publicMessages[code], { cause: options.cause });
    this.name = "AppError";
    this.correlationId = options.correlationId ?? randomUUID();
    this.retryable = options.retryable ?? false;
  }

  readonly retryable: boolean;
}

function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === "string" && (APP_ERROR_CODES as readonly string[]).includes(value);
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;

    if (isAppErrorCode(code)) {
      return new AppError(code, { cause: error, retryable: code === "RATE_LIMITED" });
    }
  }

  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (name === "SyntaxError" || name === "ZodError") {
    return new AppError("VALIDATION_FAILED", { cause: error });
  }

  if (name === "AbortError" || message.includes("timed out")) {
    return new AppError("OPERATION_FAILED", { cause: error, retryable: true });
  }

  if (message.includes("unique constraint") || message.includes("conflict")) {
    return new AppError("DATABASE_CONFLICT", { cause: error, retryable: true });
  }

  return new AppError("OPERATION_FAILED", { cause: error });
}

export function getPublicErrorMessage(code: string | undefined) {
  return isAppErrorCode(code) ? publicMessages[code] : publicMessages.OPERATION_FAILED;
}

export function getErrorFeedback(code: string | undefined, correlationId?: string) {
  const message = getPublicErrorMessage(code);

  return correlationId ? `${message} Reference: ${correlationId}.` : message;
}

export function getAppErrorHttpStatus(code: AppErrorCode) {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "AUTH_INVALID":
    case "CSRF_REJECTED":
      return 403;
    case "RATE_LIMITED":
    case "AI_RATE_LIMITED":
      return 429;
    case "VALIDATION_FAILED":
      return 400;
    case "DATABASE_CONFLICT":
    case "PUBLISH_STATE_CONFLICT":
      return 409;
    default:
      return 500;
  }
}

export function reportAppError(error: unknown, context: string) {
  const appError = toAppError(error);
  const errorName = error instanceof Error ? error.name : "UnknownError";

  console.error(
    JSON.stringify({
      event: "foundry.operation.failed",
      context,
      code: appError.code,
      correlationId: appError.correlationId,
      retryable: appError.retryable,
      errorName,
    }),
  );

  return appError;
}
