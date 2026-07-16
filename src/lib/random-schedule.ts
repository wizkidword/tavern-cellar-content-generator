const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const RANDOM_SCHEDULE_MAX_DAYS = 30;
export const RANDOM_SCHEDULE_FIRST_WINDOW_DAYS = 7;
export const RANDOM_SCHEDULE_MIN_GAP_MINUTES = 180;
export const RANDOM_SCHEDULE_LEAD_MINUTES = 30;
export const RANDOM_SCHEDULE_INTERVAL_MINUTES = 30;
export const RANDOM_SCHEDULE_SEARCH_WINDOWS = 2;

type PickRandomWordPressScheduleSlotInput = {
  now?: Date;
  scheduledTimes: Date[];
  random?: () => number;
  maxAttempts?: number;
  maxSearchWindows?: number;
};

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime());
}

function roundUpToInterval(value: Date, intervalMinutes: number) {
  const intervalMs = intervalMinutes * MINUTE_MS;

  return new Date(Math.ceil(value.getTime() / intervalMs) * intervalMs);
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * MINUTE_MS);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function buildScheduleSearchWindows(now: Date, maxSearchWindows: number) {
  const maxSearchDays = RANDOM_SCHEDULE_MAX_DAYS * maxSearchWindows;
  const windows: Array<{ start: Date; end: Date }> = [
    {
      start: roundUpToInterval(
        addMinutes(now, RANDOM_SCHEDULE_LEAD_MINUTES),
        RANDOM_SCHEDULE_INTERVAL_MINUTES,
      ),
      end: addDays(now, Math.min(RANDOM_SCHEDULE_FIRST_WINDOW_DAYS, maxSearchDays)),
    },
  ];

  if (maxSearchDays > RANDOM_SCHEDULE_FIRST_WINDOW_DAYS) {
    windows.push({
      start: roundUpToInterval(
        addDays(now, RANDOM_SCHEDULE_FIRST_WINDOW_DAYS),
        RANDOM_SCHEDULE_INTERVAL_MINUTES,
      ),
      end: addDays(now, Math.min(RANDOM_SCHEDULE_MAX_DAYS, maxSearchDays)),
    });
  }

  for (
    let windowStartDay = RANDOM_SCHEDULE_MAX_DAYS;
    windowStartDay < maxSearchDays;
    windowStartDay += RANDOM_SCHEDULE_MAX_DAYS
  ) {
    windows.push({
      start: roundUpToInterval(
        addDays(now, windowStartDay),
        RANDOM_SCHEDULE_INTERVAL_MINUTES,
      ),
      end: addDays(
        now,
        Math.min(windowStartDay + RANDOM_SCHEDULE_MAX_DAYS, maxSearchDays),
      ),
    });
  }

  return windows.filter((window) => window.end.getTime() > window.start.getTime());
}

export function formatDateTimeLocal(value: Date) {
  if (!isValidDate(value)) {
    throw new Error("Use a valid schedule date and time.");
  }

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(
    value.getHours(),
  )}:${pad(value.getMinutes())}`;
}

export function isScheduleSlotAvailable(
  candidate: Date,
  scheduledTimes: Date[],
  gapMinutes = RANDOM_SCHEDULE_MIN_GAP_MINUTES,
) {
  if (!isValidDate(candidate)) {
    return false;
  }

  const gapMs = gapMinutes * MINUTE_MS;

  return scheduledTimes.every((scheduledTime) => {
    if (!isValidDate(scheduledTime)) {
      return true;
    }

    return Math.abs(candidate.getTime() - scheduledTime.getTime()) >= gapMs;
  });
}

export function pickRandomWordPressScheduleSlot(input: PickRandomWordPressScheduleSlotInput) {
  const now = input.now ?? new Date();
  const random = input.random ?? Math.random;
  const maxAttempts = input.maxAttempts ?? 500;
  const maxSearchWindows = Math.max(
    1,
    Math.floor(input.maxSearchWindows ?? RANDOM_SCHEDULE_SEARCH_WINDOWS),
  );
  const maxSearchDays = RANDOM_SCHEDULE_MAX_DAYS * maxSearchWindows;

  if (!isValidDate(now)) {
    throw new Error(`No available WordPress schedule slot was found in the next ${maxSearchDays} days.`);
  }

  const scheduledTimes = input.scheduledTimes.filter(isValidDate);

  for (const window of buildScheduleSearchWindows(now, maxSearchWindows)) {
    const windowMs = window.end.getTime() - window.start.getTime();

    if (windowMs <= 0) {
      continue;
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const normalizedRandom = Math.min(Math.max(random(), 0), 1);
      const candidate = roundUpToInterval(
        new Date(window.start.getTime() + normalizedRandom * windowMs),
        RANDOM_SCHEDULE_INTERVAL_MINUTES,
      );

      if (
        candidate.getTime() <= window.end.getTime() &&
        isScheduleSlotAvailable(candidate, scheduledTimes)
      ) {
        return candidate;
      }
    }

    for (
      let candidate = window.start;
      candidate.getTime() <= window.end.getTime();
      candidate = addMinutes(candidate, RANDOM_SCHEDULE_INTERVAL_MINUTES)
    ) {
      if (isScheduleSlotAvailable(candidate, scheduledTimes)) {
        return candidate;
      }
    }
  }

  throw new Error(
    `No available WordPress schedule slot was found in the next ${maxSearchDays} days.`,
  );
}
