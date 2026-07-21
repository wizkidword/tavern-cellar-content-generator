import { format } from "date-fns";
import Link from "next/link";

import { FoundryNav } from "@/app/foundry-nav";
import { getCalendarData } from "@/lib/intelligence/read-models";
import { requireOperatorPage } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

function formatSchedule(value: Date | null, localValue: string | null) {
  if (localValue) {
    return localValue.replace("T", " ");
  }

  if (!value) {
    return "No schedule set";
  }

  return format(value, "MMM d, yyyy h:mm a");
}

export default async function CalendarPage() {
  await requireOperatorPage();
  const articles = await getCalendarData();

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-5 py-6 md:px-8 xl:px-10">
        <FoundryNav />

        <section className="panel panel-strong rounded-[2rem] p-6 md:p-8">
          <p className="eyebrow mb-3">Calendar</p>
          <h1 className="display max-w-4xl text-4xl leading-none font-semibold text-[#fff1d7] md:text-5xl">
            Scheduled Tavern Cellar publishing work.
          </h1>
        </section>

        <section className="mt-6 panel rounded-[2rem] p-6 md:p-8">
          <div className="space-y-4">
            {articles.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-5 py-8 text-[var(--muted)]">
                No scheduled articles yet.
              </div>
            ) : null}

            {articles.map((article) => (
              <Link className="opportunity-row" href={`/articles/${article.id}`} key={article.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="status-pill status-scheduled">
                    {formatSchedule(article.scheduledFor, article.scheduledForLocal)}
                  </span>
                  <span className="text-sm text-[var(--muted)]">{article.category.name}</span>
                </div>
                <h2 className="mt-4 text-2xl font-semibold text-[#fff4e1]">{article.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{article.angle}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
