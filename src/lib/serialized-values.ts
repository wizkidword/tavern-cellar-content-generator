import { z } from "zod";

const stringArraySchema = z.array(z.string());
const categoryIdArraySchema = z.array(z.number().int().positive());

export function serializeStringArray(values: Iterable<string>) {
  return JSON.stringify(
    Array.from(values)
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function parseStringArray(value: string | null | undefined) {
  try {
    const parsed = stringArraySchema.safeParse(JSON.parse(value ?? "[]"));

    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function serializeWordPressCategoryIds(values: Iterable<number>) {
  return JSON.stringify(
    Array.from(new Set(Array.from(values).filter((value) => Number.isInteger(value) && value > 0))).sort(
      (left, right) => left - right,
    ),
  );
}

export function parseWordPressCategoryIds(value: string | null | undefined) {
  try {
    const parsed = categoryIdArraySchema.safeParse(JSON.parse(value ?? "[]"));

    return parsed.success ? parsed.data : [];
  } catch {
    // Older rows can be plain comma-separated strings.
  }

  return Array.from(
    new Set(
      (value ?? "")
        .split(/[^0-9]+/)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
}
