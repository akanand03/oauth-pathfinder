"use client";

import { useState } from "react";
import { ActorTag, EvidenceTag } from "./Badges";
import type { Claim, GuidePath, ScopeSuggestion, Step } from "@/lib/types";

/**
 * "What do you need?" picker plus the step checklist. Picking a path shows its time and scopes and
 * highlights the steps that apply; the other steps stay visible but dimmed. With no paths, just the checklist.
 */
export function PathSteps({
  paths,
  advice,
  steps,
  callouts,
}: {
  paths: GuidePath[];
  advice: ScopeSuggestion[];
  steps: Step[];
  callouts: Claim[];
}) {
  const [pathId, setPathId] = useState<string | null>(null);
  const path = paths.find((p) => p.id === pathId) ?? null;
  const tip = path?.advice != null ? advice[path.advice] : null;

  return (
    <div className="space-y-10">
      {paths.length > 0 && (
        <section className="space-y-3" aria-labelledby="need-heading">
          <h2 id="need-heading" className="text-lg font-semibold">
            What do you need?
          </h2>
          <div role="radiogroup" aria-labelledby="need-heading" className="flex flex-wrap gap-2">
            {paths.map((p) => {
              const on = p.id === pathId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPathId(on ? null : p.id)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                    on
                      ? "border-indigo-500 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-500"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {path ? (
            <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-xs uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Time to production</span>
                <span className="font-semibold">{path.time}</span>
                <EvidenceTag evidence={path.evidence} />
              </div>
              <p className="text-sm">
                Request: <code className="break-words font-mono text-xs">{path.scopes}</code>
              </p>
              {tip && (
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {tip.insteadOf && (
                    <>
                      Instead of <code className="font-mono text-xs">{tip.insteadOf}</code>.{" "}
                    </>
                  )}
                  {tip.why} <EvidenceTag evidence={tip.evidence} />
                </p>
              )}
              <p className="text-xs text-zinc-500">
                {path.steps.length} of {steps.length} steps apply; they&apos;re highlighted below.
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Pick one to see its time and the steps that apply.</p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Steps</h2>
        {callouts.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-2 text-sm font-semibold">Before you start</h3>
            <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              {callouts.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="text-indigo-500">•</span>
                  <span>
                    {c.text} <EvidenceTag evidence={c.evidence} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ol className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {steps.map((s, i) => {
            const onPath = path ? path.steps.includes(i) : null;
            return (
              <li
                key={i}
                className={`flex gap-3 p-4 transition ${onPath ? "border-l-4 border-l-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20" : ""} ${
                  onPath === false ? "opacity-45" : ""
                }`}
              >
                <input
                  type="checkbox"
                  id={`step-${i}`}
                  className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
                  aria-describedby={`step-${i}-detail`}
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`step-${i}`} className="font-medium">
                      {i + 1}. {s.title}
                    </label>
                    <ActorTag actor={s.actor} />
                    <EvidenceTag evidence={s.evidence} />
                    {onPath === false && <span className="text-[11px] text-zinc-500">Not needed for this path</span>}
                  </div>
                  <p id={`step-${i}-detail`} className="text-sm text-zinc-600 dark:text-zinc-400">
                    {s.detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
