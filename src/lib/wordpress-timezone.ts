function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatParts(value: Date) {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(
    value.getUTCDate(),
  )}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

function parseUtcOffset(timeZone: string) {
  const match = /^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(timeZone.trim());

  if (!match) {
    return null;
  }

  const [, sign, hour, minute = "0"] = match;
  const offsetMinutes = Number(hour) * 60 + Number(minute);

  if (offsetMinutes > 14 * 60) {
    return null;
  }

  return sign === "+" ? offsetMinutes : -offsetMinutes;
}

/**
 * Converts an instant to the local wall-clock form accepted by WordPress.
 * Supports both an IANA zone from /wp/v2/settings and the UTC-offset fallback
 * returned by older WordPress installations.
 */
export function formatDateTimeInWordPressTimeZone(value: Date, timeZone: string | null) {
  if (Number.isNaN(value.getTime()) || !timeZone?.trim()) {
    return null;
  }

  const utcOffsetMinutes = parseUtcOffset(timeZone);

  if (utcOffsetMinutes !== null) {
    return formatParts(new Date(value.getTime() + utcOffsetMinutes * 60_000));
  }

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value);
    const values = new Map(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    const year = values.get("year");
    const month = values.get("month");
    const day = values.get("day");
    const hour = values.get("hour");
    const minute = values.get("minute");

    return year && month && day && hour && minute
      ? `${year}-${month}-${day}T${hour}:${minute}`
      : null;
  } catch {
    return null;
  }
}
