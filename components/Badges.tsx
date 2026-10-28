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

const EVIDENCE_META = {
  Tested: {
    meaning: "Tested: checked hands-on, by a person or our code",
    cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    path: "M5 12.5l4.5 4.5L19 7.5",
  },
  Docs: {
    meaning: "Docs: from the provider's documentation",
    cls: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    path: "M7 4h7l4 4v12H7zM10 12h5M10 16h5",
  },
  Uncertain: {
    meaning: "Uncertain: not confirmed",
    cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    path: "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.5h.01",
  },
} as const;

function EvidenceGlyph({ label }: { label: Evidence["label"] }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={EVIDENCE_META[label].path} />
    </svg>
  );
}

const ICON_BOX = "inline-flex h-[18px] w-[18px] items-center justify-center rounded border";

/** Evidence as a small icon. Hover or keyboard focus (tap on mobile) shows what it means, the note and the source. */
export function EvidenceTag({ evidence }: { evidence: Evidence }) {
  const meta = EVIDENCE_META[evidence.label];
  const tip = [meta.meaning, evidence.note, evidence.url ? "Opens the source page." : null].filter(Boolean).join(". ").replace(/\.\./g, ".");
  const icon = <EvidenceGlyph label={evidence.label} />;
  return (
    <span className="group relative inline-flex align-middle">
      {evidence.url ? (
        <a href={evidence.url} target="_blank" rel="noopener noreferrer" aria-label={tip} className={`${ICON_BOX} ${meta.cls} hover:brightness-95`}>
          {icon}
        </a>
      ) : (
        <span tabIndex={0} role="img" aria-label={tip} className={`${ICON_BOX} ${meta.cls} cursor-help`}>
          {icon}
        </span>
      )}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-60 -translate-x-1/2 rounded-md bg-zinc-900 px-2.5 py-1.5 text-left text-[11px] font-normal leading-snug text-white shadow-lg group-focus-within:block group-hover:block dark:bg-zinc-700"
      >
        {tip}
      </span>
    </span>
  );
}

/** The one legend for evidence icons, with counts for this guide. */
export function EvidenceLegend({ counts }: { counts: Record<Evidence["label"], number> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
      {(["Docs", "Tested", "Uncertain"] as const).map((label) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={`${ICON_BOX} ${EVIDENCE_META[label].cls}`} aria-hidden>
            <EvidenceGlyph label={label} />
          </span>
          {EVIDENCE_META[label].meaning.split(": ")[1].replace(/^./, (c) => c.toUpperCase())} ({counts[label]})
        </span>
      ))}
      <span>Hover or tap an icon for details.</span>
    </div>
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
