import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type CalendarScheduledItem = {
  scheduledFor: Date | null;
  scheduledForLocal: string | null;
};

export type CalendarDay = {
  date: Date;
  key: string;
  isInMonth: boolean;
};

function validDate(year: number, month: number, day: number) {
  const value = new Date(year, month - 1, day);

  return value.getFullYear() === year && value.getMonth() === month - 1 && value.getDate() === day
    ? value
    : null;
}

export function parseCalendarMonth(value: string | undefined, fallback: Date) {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");

  if (!match) {
    return startOfMonth(fallback);
  }

  const parsed = validDate(Number(match[1]), Number(match[2]), 1);

  return parsed ? startOfMonth(parsed) : startOfMonth(fallback);
}

export function parseCalendarDay(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");

  if (!match) {
    return null;
  }

  const parsed = validDate(Number(match[1]), Number(match[2]), Number(match[3]));

  return parsed ? format(parsed, "yyyy-MM-dd") : null;
}

export function calendarDayKey(item: CalendarScheduledItem) {
  const localMatch = /^(\d{4}-\d{2}-\d{2})(?:T|\s)/.exec(item.scheduledForLocal?.trim() ?? "");

  if (localMatch && parseCalendarDay(localMatch[1])) {
    return localMatch[1];
  }

  return item.scheduledFor ? format(item.scheduledFor, "yyyy-MM-dd") : null;
}

export function buildCalendarDays(month: Date): CalendarDay[] {
  const normalizedMonth = startOfMonth(month);
  const first = startOfWeek(normalizedMonth, { weekStartsOn: 0 });
  const last = endOfWeek(endOfMonth(normalizedMonth), { weekStartsOn: 0 });
  const days: CalendarDay[] = [];

  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) {
    days.push({
      date: cursor,
      isInMonth: isSameMonth(cursor, normalizedMonth),
      key: format(cursor, "yyyy-MM-dd"),
    });
  }

  return days;
}

export function groupCalendarItems<T extends CalendarScheduledItem>(items: readonly T[]) {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = calendarDayKey(item);

    if (!key) {
      continue;
    }

    const scheduledItems = grouped.get(key) ?? [];
    scheduledItems.push(item);
    grouped.set(key, scheduledItems);
  }

  return grouped;
}
