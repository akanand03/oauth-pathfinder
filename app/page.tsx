import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DifficultyBadge } from "@/components/Badges";
import { SearchBox } from "@/components/SearchBox";
import { LIBRARY } from "@/lib/library";
import { recentGuides } from "@/lib/store";
import type { Guide } from "@/lib/types";


function GuideCard({ guide }: { guide: Guide }) {
  return (
    <Link
      href={`/guides/${guide.slug}`}
      className="group flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{guide.name}</h3>
        <DifficultyBadge difficulty={guide.verdict.difficulty} />
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{guide.verdict.summary}</p>
      <dl className="mt-auto grid grid-cols-2 gap-2 text-xs text-zinc-500">
        <div>
          <dt className="uppercase tracking-wide">First test</dt>
          <dd className="text-zinc-700 dark:text-zinc-300">{guide.verdict.timeToFirstTest.text}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Production</dt>
          <dd className="line-clamp-2 text-zinc-700 dark:text-zinc-300">{guide.verdict.timeToProduction.text}</dd>
        </div>
      </dl>
    </Link>
  );
}

async function RecentGuides() {
  await connection();
  const recent = await recentGuides();
  if (recent.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Recently generated</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {recent.map((g) => (
          <GuideCard key={g.slug} guide={g} />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="mx-auto max-w-2xl space-y-5 pt-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Will your “Connect” button take 5 minutes or 5 weeks?</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          See what it takes to register an OAuth app with a provider and get it approved: the steps, the requirements, which
          scopes trigger review, and what gets submissions rejected. Every claim is labelled with its evidence.
        </p>
        <SearchBox />
        <p className="text-xs text-zinc-500">Not in the library? An agent researches it live in about a minute and saves the guide.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Library</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {LIBRARY.map((g) => (
            <GuideCard key={g.slug} guide={g} />
          ))}
        </div>
      </section>

      <Suspense fallback={null}>
        <RecentGuides />
      </Suspense>

      <section className="grid gap-4 text-sm sm:grid-cols-4">
        {[
          ["Easy", "No review. Live the same day."],
          ["Medium", "Works now; review only for public listing."],
          ["Hard", "Verification plus security assessment."],
          ["Gated", "Access is an application that can be denied."],
        ].map(([d, text]) => (
          <div key={d} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <DifficultyBadge difficulty={d as Guide["verdict"]["difficulty"]} />
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
