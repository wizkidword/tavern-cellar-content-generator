import test from "node:test";
import assert from "node:assert/strict";

import {
  formatDateTimeLocal,
  isScheduleSlotAvailable,
  pickRandomWordPressScheduleSlot,
} from "@/lib/random-schedule";

test("prefers a random schedule slot in the first seven days when space is available", () => {
  const now = new Date("2026-06-12T12:00:00.000Z");
  const slot = pickRandomWordPressScheduleSlot({
    now,
    scheduledTimes: [],
    random: () => 0.5,
  });

  assert.ok(slot.getTime() > now.getTime());
  assert.equal(slot.toISOString(), "2026-06-16T00:30:00.000Z");
  assert.ok(slot.getTime() <= now.getTime() + 7 * 24 * 60 * 60 * 1000);
});

test("rejects schedule slots less than three hours from existing WordPress scheduled posts", () => {
  const scheduledTime = new Date("2026-06-12T16:00:00.000Z");

  assert.equal(
    isScheduleSlotAvailable(new Date("2026-06-12T13:01:00.000Z"), [scheduledTime]),
    false,
  );
  assert.equal(
    isScheduleSlotAvailable(new Date("2026-06-12T19:00:00.000Z"), [scheduledTime]),
    true,
  );
});

test("falls back to the next available thirty-minute slot when random attempts are crowded", () => {
  const now = new Date("2026-06-12T12:00:00.000Z");
  const scheduledTimes = [
    new Date("2026-06-12T13:00:00.000Z"),
    new Date("2026-06-12T15:00:00.000Z"),
  ];
  const slot = pickRandomWordPressScheduleSlot({
    now,
    scheduledTimes,
    maxAttempts: 1,
    random: () => 0,
  });

  assert.equal(slot.toISOString(), "2026-06-12T18:00:00.000Z");
});

test("expands to the rest of the first thirty days only after the first week is full", () => {
  const now = new Date("2026-06-12T12:00:00.000Z");
  const scheduledTimes = Array.from({ length: 7 * 24 + 2 }, (_, index) => {
    return new Date(now.getTime() + index * 60 * 60 * 1000);
  });
  const slot = pickRandomWordPressScheduleSlot({
    now,
    scheduledTimes,
    maxAttempts: 1,
    random: () => 0,
  });

  assert.equal(slot.toISOString(), "2026-06-19T16:00:00.000Z");
  assert.ok(slot.getTime() > now.getTime() + 7 * 24 * 60 * 60 * 1000);
  assert.ok(slot.getTime() <= now.getTime() + 30 * 24 * 60 * 60 * 1000);
});

test("pushes into the next thirty-day window when the first window is full", () => {
  const now = new Date("2026-06-12T12:00:00.000Z");
  const scheduledTimes = Array.from({ length: 30 * 24 + 2 }, (_, index) => {
    return new Date(now.getTime() + index * 60 * 60 * 1000);
  });
  const slot = pickRandomWordPressScheduleSlot({
    now,
    scheduledTimes,
    maxAttempts: 1,
    random: () => 0,
  });

  assert.equal(slot.toISOString(), "2026-07-12T16:00:00.000Z");
  assert.ok(slot.getTime() > now.getTime() + 30 * 24 * 60 * 60 * 1000);
  assert.ok(slot.getTime() <= now.getTime() + 60 * 24 * 60 * 60 * 1000);
});

test("throws a clear error when every slot in the next sixty days conflicts", () => {
  const now = new Date("2026-06-12T12:00:00.000Z");
  const scheduledTimes = Array.from({ length: 60 * 24 + 2 }, (_, index) => {
    return new Date(now.getTime() + index * 60 * 60 * 1000);
  });

  assert.throws(
    () =>
      pickRandomWordPressScheduleSlot({
        now,
        scheduledTimes,
        maxAttempts: 1,
        random: () => 0,
      }),
    /No available WordPress schedule slot.*60 days/,
  );
});

test("formats random slots for datetime-local form fields", () => {
  assert.equal(
    formatDateTimeLocal(new Date(2026, 5, 12, 9, 5, 30)),
    "2026-06-12T09:05",
  );
});
