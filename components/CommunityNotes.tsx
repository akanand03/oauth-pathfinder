import Link from "next/link";
import { HelpfulButton } from "./HelpfulButton";
import type { CommunityNote, Guide } from "@/lib/types";

const TAGS: Record<CommunityNote["tag"], string> = {
  time_sink: "⏱️ Time sink",
  rejection: "🚫 Rejection reason",
  shortcut: "💡 Shortcut",
  gotcha: "⚠️ Gotcha",
};

const SOURCE_LABEL: Record<CommunityNote["sourceType"], string> = {
  forum: "Forum",
  qa: "Q&A",
  code: "Code",
  blog: "Blog",
};

/** Generic source-type glyphs (no brand logos). */
function SourceIcon({ type }: { type: CommunityNote["sourceType"] }) {
  const common = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (type) {
    case "forum":
      return (
        <svg {...common} aria-hidden>
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" />
        </svg>
      );
    case "qa":
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" />
          <path d="M12 17.5h.01" />
        </svg>
      );
    case "code":
      return (
        <svg {...common} aria-hidden>
          <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
        </svg>
      );
    case "blog":
      return (
        <svg {...common} aria-hidden>
          <path d="M6 3h9l4 4v14H6z" />
          <path d="M9 11h7M9 15h7M9 7h3" />
        </svg>
      );
  }
}

const AVATAR_HUES = [
  "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200",
  "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200",
  "bg-lime-100 text-lime-800 dark:bg-lime-900/60 dark:text-lime-200",
  "bg-pink-100 text-pink-800 dark:bg-pink-900/60 dark:text-pink-200",
];

function initials(name: string): string {
  const words = name.replace(/^u\//, "").split(/[\s_-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

function Avatar({ name }: { name: string }) {
  const hue = AVATAR_HUES[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_HUES.length];
  return (
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${hue}`} aria-hidden>
      {initials(name)}
    </span>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Show the date only as precisely as the source gave it. */
function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  if (d) return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
  if (m) return `${MONTHS[Number(m) - 1]} ${y}`;
  return y;
}

export function AnecdotalBadge() {
  return (
    <span className="inline-flex items-center rounded border border-fuchsia-300 bg-fuchsia-50 px-1.5 py-px text-[11px] font-medium text-fuchsia-800 dark:border-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300">
      Community: anecdotal
    </span>
  );
}

export function NoteCard({ note, appName }: { note: CommunityNote; appName?: string }) {
  const author = note.author ?? "A developer";
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-zinc-100 px-1.5 py-px text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {TAGS[note.tag]}
        </span>
        <AnecdotalBadge />
        {note.conflictsWithDocs && (
          <span
            className="inline-flex items-center rounded border border-orange-300 bg-orange-50 px-1.5 py-px text-[11px] font-medium text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
            title={note.conflictNote ?? undefined}
          >
            Conflicts with docs
          </span>
        )}
        {appName && <span className="ml-auto text-[11px] font-medium text-zinc-500">{appName}</span>}
      </div>

      <p className="text-sm text-zinc-800 dark:text-zinc-200">{note.tip}</p>
      {note.quote && (
        <blockquote className="border-l-2 border-fuchsia-300 pl-3 text-sm italic text-zinc-600 dark:border-fuchsia-800 dark:text-zinc-400">
          “{note.quote}”
        </blockquote>
      )}
      {note.conflictsWithDocs && note.conflictNote && (
        <p className="text-xs text-orange-800 dark:text-orange-300">{note.conflictNote}</p>
      )}

      <div className="mt-auto flex items-center gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <Avatar name={author} />
        <div className="min-w-0 flex-1 text-xs">
          <div className="truncate font-medium text-zinc-700 dark:text-zinc-300">{author}</div>
          <a
            href={note.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-1 text-zinc-500 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
            title={note.dateNote ?? undefined}
          >
            <SourceIcon type={note.sourceType} />
            <span className="sr-only">{SOURCE_LABEL[note.sourceType]}:</span>
            {note.site} · {formatDate(note.date)} ↗
          </a>
        </div>
      </div>
      <div>
        <HelpfulButton id={note.id} />
      </div>
    </article>
  );
}

export function CommunityNotes({ guide }: { guide: Guide }) {
  const notes = guide.communityNotes ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Real experiences from public posts, summarized in our words. One person&apos;s story, not a rule: trust the labelled facts above
        when they disagree.
      </p>
      {notes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">No community notes yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Home page strip: the featured notes across the library (max 3). */
export function FeaturedNotes({ guides }: { guides: Guide[] }) {
  const featured = guides
    .flatMap((g) => (g.communityNotes ?? []).filter((n) => n.featured).map((note) => ({ note, guide: g })))
    .slice(0, 3);
  if (featured.length === 0) return null;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">💬 What developers wish they knew</h2>
        <span className="text-xs text-zinc-500">Anecdotal; open a guide for the documented facts.</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {featured.map(({ note, guide }) => (
          <div key={note.id} className="flex flex-col gap-1">
            <NoteCard note={note} appName={guide.name} />
            <Link href={`/guides/${guide.slug}`} className="px-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400">
              More in the {guide.name} guide →
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
