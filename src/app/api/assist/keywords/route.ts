import { NextResponse } from "next/server";

import { suggestPrimaryKeywords } from "@/lib/content-pipeline";
import { getAppErrorHttpStatus, reportAppError } from "@/lib/errors/app-error";
import {
  assertOperatorApiAccess,
  assertProviderActionAllowed,
  RateLimitedError,
} from "@/lib/operator-auth";
import { keywordAssistSchema, parseRequestBody } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  try {
    const session = assertOperatorApiAccess(request);
    assertProviderActionAllowed(session.sid);

    const body = parseRequestBody(keywordAssistSchema, await request.json());

    const result = await suggestPrimaryKeywords({
      categoryId: body.categoryId,
      notes: body.notes,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }

    const appError = reportAppError(error, "api.assist.keywords");
    return NextResponse.json(
      {
        error: {
          code: appError.code,
          correlationId: appError.correlationId,
          message: appError.message,
          retryable: appError.retryable,
        },
      },
      { status: getAppErrorHttpStatus(appError.code) },
    );
  }
}
