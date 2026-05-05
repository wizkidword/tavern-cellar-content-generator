import { NextResponse } from "next/server";

import { suggestAngles } from "@/lib/content-pipeline";
import {
  assertOperatorAccessForRequest,
  OperatorAccessError,
} from "@/lib/operator-auth";

export async function POST(request: Request) {
  try {
    assertOperatorAccessForRequest(request);

    const body = (await request.json()) as {
      categoryId?: number;
      primaryKeyword?: string;
      notes?: string;
    };

    const categoryId = Number(body.categoryId ?? 0);

    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "Pick a category before generating angles." }, { status: 400 });
    }

    const result = await suggestAngles({
      categoryId,
      primaryKeyword: String(body.primaryKeyword ?? ""),
      notes: body.notes,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Angle generation failed.";
    const status = error instanceof OperatorAccessError ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
