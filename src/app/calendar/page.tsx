import { addMonths, format, isToday, subMonths } from "date-fns";
import Link from "next/link";

import { FoundryNav } from "@/app/foundry-nav";
import {
  buildCalendarDays,
  calendarDayKey,
  groupCalendarItems,
  parseCalendarDay,
  parseCalendarMonth,
} from "@/lib/calendar-view";
import { getCalendarData } from "@/lib/intelligence/read-models";
import { requireOperatorPage } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function stringValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function formatScheduleTime(value: Date | null, localValue: string | null) {
  const localTime = /T(\d{2}):(\d{2})/.exec(localValue ?? "");

  if (localTime) {
    const hour = Number(localTime[1]);
    const minute = localTime[2];
    const period = hour >= 12 ? "PM" : "AM";

    return `${hour % 12 || 12}:${minute} ${period}`;
  }

  return value ? format(value, "h:mm a") : "No time set";
}

function calendarHref(month: Date, day?: string) {
  const params = new URLSearchParams({ month: format(month, "yyyy-MM") });

  if (day) {
    params.set("day", day);
  }

  return `/calendar?${params.toString()}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string | string[]; month?: string | string[] }>;
}) {
  await requireOperatorPage();
  const query = await searchParams;
  const articles = await getCalendarData();
  const selectedDay = parseCalendarDay(stringValue(query.day));
  const month = parseCalendarMonth(
    stringValue(query.month),
    selectedDay ? new Date(`${selectedDay}T12:00:00`) : new Date(),
  );
  const days = buildCalendarDays(month);
  const articlesByDay = groupCalendarItems(articles);
  const selectedArticles = selectedDay ? articlesByDay.get(selectedDay) ?? [] : [];
  const unscheduledArticles = articles.filter((article) => !calendarDayKey(article));

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-5 py-6 md:px-8 xl:px-10">
        <FoundryNav />

        <section className="panel panel-strong rounded-[2rem] p-6 md:p-8">
          <p className="eyebrow mb-3">Calendar</p>
          <h1 className="display max-w-4xl text-4xl leading-none font-semibold text-[#fff1d7] md:text-5xl">
            Your scheduled publishing calendar.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Each number shows how many posts are scheduled for that date. Click any day to see what is planned.
          </p>
        </section>

        <section className="mt-6 panel rounded-[2rem] p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-2 pb-4 md:px-3">
            <div>
              <p className="label mb-1">Publishing month</p>
              <h2 className="text-2xl font-semibold text-[#fff4e1]">{format(month, "MMMM yyyy")}</h2>
            </div>
            <div className="flex gap-2">
              <Link className="action-secondary px-4 py-2 text-sm" href={calendarHref(subMonths(month, 1))}>
                Previous
              </Link>
              <Link className="action-secondary px-4 py-2 text-sm" href={calendarHref(addMonths(month, 1))}>
                Next
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-[1.2rem] border border-[var(--line)] bg-[var(--line)]">
            {WEEKDAYS.map((weekday) => (
              <div
                className="bg-[#14201e] px-1 py-2 text-center text-[0.66rem] font-bold tracking-[0.1em] text-[var(--muted)] uppercase sm:text-xs"
                key={weekday}
              >
                {weekday}
              </div>
            ))}
            {days.map((day) => {
              const scheduledArticles = articlesByDay.get(day.key) ?? [];
              const count = scheduledArticles.length;
              const selected = selectedDay === day.key;
              const countLabel = `${count} scheduled ${count === 1 ? "post" : "posts"}`;

              return (
                <Link
                  aria-current={selected ? "date" : undefined}
                  aria-label={`${format(day.date, "EEEE, MMMM d, yyyy")}: ${countLabel}`}
                  className={`min-h-20 bg-[#0d1715] p-2 transition sm:min-h-28 sm:p-3 ${
                    day.isInMonth ? "text-[#fff4e1] hover:bg-[#182723]" : "text-[#7b806f] hover:bg-[#131f1c]"
                  } ${selected ? "ring-2 ring-inset ring-[#f4ba65]" : ""}`}
                  href={calendarHref(day.date, day.key)}
                  key={day.key}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-bold ${
                        isToday(day.date) ? "bg-[#d58b33] text-[#160e08]" : ""
                      }`}
                    >
                      {format(day.date, "d")}
                    </span>
                    {count > 0 ? (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[#d58b33] px-1.5 py-0.5 text-xs font-extrabold text-[#160e08]">
                        {count}
                      </span>
                    ) : null}
                  </div>
                  {count > 0 ? (
                    <p className="mt-4 hidden text-xs leading-4 text-[#d7bf95] sm:block">{countLabel}</p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-6 panel rounded-[2rem] p-6 md:p-8">
          {selectedDay ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow mb-2">Selected day</p>
                  <h2 className="text-3xl font-semibold text-[#fff4e1]">
                    {format(new Date(`${selectedDay}T12:00:00`), "EEEE, MMMM d")}
                  </h2>
                </div>
                <span className="status-pill status-scheduled">
                  {selectedArticles.length} {selectedArticles.length === 1 ? "post" : "posts"}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {selectedArticles.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-5 py-8 text-[var(--muted)]">
                    Nothing is scheduled for this day.
                  </div>
                ) : (
                  selectedArticles.map((article) => (
                    <Link className="opportunity-row" href={`/articles/${article.id}`} key={article.id}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="status-pill status-scheduled">
                          {formatScheduleTime(article.scheduledFor, article.scheduledForLocal)}
                        </span>
                        <span className="text-sm text-[var(--muted)]">{article.category.name}</span>
                      </div>
                      <h3 className="mt-4 text-xl font-semibold text-[#fff4e1]">{article.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{article.angle}</p>
                    </Link>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-5 py-8 text-[var(--muted)]">
              Click a day in the calendar to see its scheduled posts.
            </div>
          )}
        </section>

        {unscheduledArticles.length > 0 ? (
          <section className="mt-6 panel rounded-[2rem] p-6 md:p-8">
            <p className="eyebrow mb-2">Needs a schedule</p>
            <p className="text-sm text-[var(--muted)]">
              These articles are marked scheduled but do not have a date yet, so they cannot appear on the calendar.
            </p>
            <div className="mt-5 space-y-3">
              {unscheduledArticles.map((article) => (
                <Link className="opportunity-row" href={`/articles/${article.id}`} key={article.id}>
                  <h2 className="text-xl font-semibold text-[#fff4e1]">{article.title}</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">{article.category.name}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
