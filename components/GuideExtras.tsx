import { EvidenceTag } from "./Badges";
import { CopyButton } from "./CopyButton";
import type { Drafts, Guide, ScopeSuggestion, TimelinePhase } from "@/lib/types";

const card = "rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900";

/** Lighter-path suggestions plus the scope tip. Generated guides have no suggestions yet, so they show the tip only. */
export function ScopeAdvisor({ guide }: { guide: Guide }) {
  const suggestions: ScopeSuggestion[] = guide.scopeAdvisor ?? [];
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Lighter path</h3>
      {suggestions.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {suggestions.map((s, i) => (
            <li key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="font-medium">{s.need}</p>
              <p className="mt-1">
                → Use <code className="font-mono text-xs text-emerald-800 dark:text-emerald-300">{s.use}</code>
                {s.insteadOf && (
                  <>
                    {" "}instead of <code className="font-mono text-xs text-rose-700 dark:text-rose-400">{s.insteadOf}</code>
                  </>
                )}
              </p>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">{s.why}</p>
              <div className="mt-2">
                <EvidenceTag evidence={s.evidence} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <strong>Tip:</strong> {guide.scopes.tip}
      </p>
    </div>
  );
}

/** Generated guides don't carry a timeline yet; derive one from the verdict so every guide shows the view. */
function timelineFor(guide: Guide): TimelinePhase[] {
  if (guide.timeline?.length) return guide.timeline;
  const v = guide.verdict;
  const hasReview = guide.scopes.triggerReview.length > 0 || v.difficulty !== "Easy";
  return [
    { phase: "setup", label: "Create the app and build OAuth", duration: v.timeToFirstTest.text, kind: "active", evidence: v.timeToFirstTest.evidence },
    { phase: "test", label: "Test with your own account", duration: "After setup", kind: "active", evidence: v.timeToFirstTest.evidence },
    {
      phase: "review",
      label: hasReview ? "Review / approval" : "Review",
      duration: hasReview ? "See production estimate" : "None expected",
      kind: hasReview ? "waiting" : "none",
      evidence: v.timeToProduction.evidence,
    },
    { phase: "production", label: "Production", duration: v.timeToProduction.text, kind: "none", evidence: v.timeToProduction.evidence },
  ];
}

const PHASE_NAME: Record<TimelinePhase["phase"], string> = {
  setup: "Setup",
  test: "Test mode",
  review: "Review wait",
  production: "Production",
};

const KIND_STYLE: Record<TimelinePhase["kind"], string> = {
  active: "bg-indigo-500",
  waiting: "bg-[repeating-linear-gradient(45deg,var(--color-amber-400)_0_6px,var(--color-amber-200)_6px_12px)] dark:bg-[repeating-linear-gradient(45deg,var(--color-amber-600)_0_6px,var(--color-amber-900)_6px_12px)]",
  none: "bg-zinc-200 dark:bg-zinc-700",
};

export function Timeline({ guide }: { guide: Guide }) {
  const phases = timelineFor(guide);
  return (
    <div className={`${card} space-y-4`}>
      <ol className="grid gap-4 sm:grid-cols-4">
        {phases.map((p, i) => (
          <li key={i} className="space-y-2">
            <div className={`h-3 rounded-full ${KIND_STYLE[p.kind]}`} aria-hidden />
            <div className="text-xs uppercase tracking-wide text-zinc-500">{PHASE_NAME[p.phase]}</div>
            <div className="text-sm font-medium">{p.duration}</div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">{p.label}</div>
            <EvidenceTag evidence={p.evidence} />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
        <Legend cls={KIND_STYLE.active} text="Your active work" />
        <Legend cls={KIND_STYLE.waiting} text="Waiting on the provider" />
        <Legend cls={KIND_STYLE.none} text="No work / milestone" />
      </div>
      {!guide.timeline?.length && (
        <p className="text-xs text-zinc-500">Derived from the verdict above; this guide has no detailed timeline.</p>
      )}
    </div>
  );
}

function Legend({ cls, text }: { cls: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-6 rounded-full ${cls}`} aria-hidden />
      {text}
    </span>
  );
}

export function AgentDrafts({ drafts }: { drafts: Drafts }) {
  const outline = drafts.demoVideoOutline.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const checklist = drafts.checklist.map((s) => `- [ ] ${s}`).join("\n");
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>Templates: edit before using.</strong> {drafts.note}
      </p>

      <div className={`${card} space-y-4`}>
        <h3 className="font-semibold">Scope justification</h3>
        {drafts.scopeJustification.map((j) => (
          <div key={j.scope} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono text-xs">{j.scope}</code>
              <CopyButton text={j.text} />
            </div>
            <p className="whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{j.text}</p>
          </div>
        ))}
      </div>

      <div className={`${card} space-y-2`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Demo video script outline</h3>
          <CopyButton text={outline} />
        </div>
        <ol className="list-inside list-decimal space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
          {drafts.demoVideoOutline.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      <div className={`${card} space-y-2`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Pre-submission checklist</h3>
          <CopyButton text={checklist} />
        </div>
        <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
          {drafts.checklist.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden>☐</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
