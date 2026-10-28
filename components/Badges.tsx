import type { Difficulty, Evidence } from "@/lib/types";

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  Easy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  Hard: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300",
  Gated: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300",
  Unknown: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${DIFFICULTY_STYLES[difficulty]}`}>
      {difficulty}
    </span>
  );
}

const EVIDENCE_STYLES = {
  Tested: "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300",
  Docs: "border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-300",
  Uncertain: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300",
} as const;

export function EvidenceTag({ evidence }: { evidence: Evidence }) {
  const cls = `inline-flex items-center rounded border px-1.5 py-px text-[11px] font-medium ${EVIDENCE_STYLES[evidence.label]}`;
  const title = [evidence.note, evidence.url].filter(Boolean).join(" · ");
  const body = (
    <>
      {evidence.label}
      {evidence.url ? " ↗" : ""}
    </>
  );
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {evidence.url ? (
        <a href={evidence.url} target="_blank" rel="noopener noreferrer" className={`${cls} hover:underline`} title={title}>
          {body}
        </a>
      ) : (
        <span className={cls} title={title}>{body}</span>
      )}
      {evidence.note && <span className="text-[11px] text-zinc-500">{evidence.note}</span>}
    </span>
  );
}

export function ActorTag({ actor }: { actor: "agent" | "you" }) {
  return actor === "agent" ? (
    <span className="rounded bg-indigo-100 px-1.5 py-px text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
      Agent can do
    </span>
  ) : (
    <span className="rounded bg-zinc-200 px-1.5 py-px text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      You must do
    </span>
  );
}
