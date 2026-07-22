import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCalendarDays,
  calendarDayKey,
  groupCalendarItems,
  parseCalendarDay,
  parseCalendarMonth,
} from "@/lib/calendar-view";

test("uses the saved WordPress-local schedule date for calendar placement", () => {
  const item = {
    scheduledFor: new Date("2026-08-01T01:00:00.000Z"),
    scheduledForLocal: "2026-07-31T21:00",
  };

  assert.equal(calendarDayKey(item), "2026-07-31");
});

test("builds a complete Sunday through Saturday calendar grid", () => {
  const days = buildCalendarDays(new Date(2026, 7, 1));

  assert.equal(days.length % 7, 0);
  assert.equal(days[0]?.key, "2026-07-26");
  assert.equal(days.at(-1)?.key, "2026-09-05");
  assert.equal(days.filter((day) => day.isInMonth).length, 31);
});

test("groups scheduled posts by calendar date and rejects invalid query dates", () => {
  const first = { scheduledFor: new Date(2026, 7, 4, 12), scheduledForLocal: "2026-08-04T12:00" };
  const second = { scheduledFor: new Date(2026, 7, 4, 15), scheduledForLocal: "2026-08-04T15:00" };
  const grouped = groupCalendarItems([first, second]);

  assert.equal(grouped.get("2026-08-04")?.length, 2);
  assert.equal(parseCalendarDay("2026-02-30"), null);
  assert.equal(formatMonth(parseCalendarMonth("2026-08", new Date(2025, 0, 1))), "2026-08");
});

function formatMonth(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}
