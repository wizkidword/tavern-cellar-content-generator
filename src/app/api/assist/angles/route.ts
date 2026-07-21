import { NextResponse } from "next/server";

import { suggestAngles } from "@/lib/content-pipeline";
import { getAppErrorHttpStatus, reportAppError } from "@/lib/errors/app-error";
import {
  assertOperatorApiAccess,
  assertProviderActionAllowed,
  RateLimitedError,
} from "@/lib/operator-auth";
import { angleAssistSchema, parseRequestBody } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  try {
    const session = assertOperatorApiAccess(request);
    assertProviderActionAllowed(session.sid);

    const body = parseRequestBody(angleAssistSchema, await request.json());

    const result = await suggestAngles({
      categoryId: body.categoryId,
      primaryKeyword: body.primaryKeyword,
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

    const appError = reportAppError(error, "api.assist.angles");
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
