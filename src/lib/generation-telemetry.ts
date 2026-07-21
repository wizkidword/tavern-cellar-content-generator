import { type GenerationOperation } from "@prisma/client";

import { prisma } from "@/lib/db";
import { toAppError } from "@/lib/errors/app-error";

type UsageSnapshot = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
};

type GenerationRunReference = {
  articleId?: string | null;
  opportunityId?: string | null;
};

export type GenerationRunHandle = {
  id: string;
  startedAt: Date;
} | null;

export async function startGenerationRun(input: {
  operation: GenerationOperation;
  provider: string;
  model: string;
  promptVersion: string;
  reference?: GenerationRunReference;
}): Promise<GenerationRunHandle> {
  try {
    const run = await prisma.generationRun.create({
      data: {
        operation: input.operation,
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
        articleId: input.reference?.articleId ?? null,
        opportunityId: input.reference?.opportunityId ?? null,
      },
      select: {
        id: true,
        startedAt: true,
      },
    });

    return run;
  } catch {
    // Telemetry is intentionally observational. A telemetry outage must never
    // prevent an editorial operation from completing.
    return null;
  }
}

export async function completeGenerationRun(
  handle: GenerationRunHandle,
  usage?: UsageSnapshot | null,
) {
  if (!handle) {
    return;
  }

  try {
    const inputTokens = usage?.input_tokens ?? null;
    const outputTokens = usage?.output_tokens ?? null;
    const totalTokens = usage?.total_tokens ??
      (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);

    await prisma.generationRun.update({
      where: { id: handle.id },
      data: {
        state: "SUCCEEDED",
        completedAt: new Date(),
        latencyMs: Date.now() - handle.startedAt.getTime(),
        inputTokens,
        outputTokens,
        totalTokens,
      },
    });
  } catch {
    // Keep the original operation successful even when recording its outcome
    // becomes unavailable.
  }
}

export async function failGenerationRun(handle: GenerationRunHandle, error: unknown) {
  if (!handle) {
    return;
  }

  try {
    await prisma.generationRun.update({
      where: { id: handle.id },
      data: {
        state: "FAILED",
        completedAt: new Date(),
        latencyMs: Date.now() - handle.startedAt.getTime(),
        errorCode: toAppError(error).code,
      },
    });
  } catch {
    // See startGenerationRun: telemetry must not mask the real provider error.
  }
}
