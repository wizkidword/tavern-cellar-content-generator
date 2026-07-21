import { NextResponse } from "next/server";

import { getAppErrorHttpStatus, reportAppError } from "@/lib/errors/app-error";
import { assertOperatorApiAccess } from "@/lib/operator-auth";
import { parseRequestBody, webImageSearchSchema } from "@/lib/validation/schemas";
import { searchWebImages } from "@/lib/web-image-search";

export async function POST(request: Request) {
  try {
    assertOperatorApiAccess(request);
    const body = parseRequestBody(webImageSearchSchema, await request.json());
    const images = await searchWebImages(body.query, body.scope);

    return NextResponse.json({ images });
  } catch (error) {
    const appError = reportAppError(error, "api.featured-images.search");

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
