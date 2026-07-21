import { NextResponse } from "next/server";

import { getAppErrorHttpStatus, reportAppError } from "@/lib/errors/app-error";
import { assertOperatorApiAccess } from "@/lib/operator-auth";
import { parseRequestBody, wikimediaImageSearchSchema } from "@/lib/validation/schemas";
import { searchLicensedWikimediaImages } from "@/lib/wikimedia-commons";

export async function POST(request: Request) {
  try {
    assertOperatorApiAccess(request);
    const body = parseRequestBody(wikimediaImageSearchSchema, await request.json());
    const images = await searchLicensedWikimediaImages(body.query);

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
