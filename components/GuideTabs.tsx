"use client";

import { useState, type ReactNode } from "react";

export interface GuideTab {
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
}

/** Secondary sections as tabs, all closed by default. Panels stay in the HTML (hidden) so nothing is lost. */
export function GuideTabs({ tabs }: { tabs: GuideTab[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-label="More details" className="space-y-3">
      <div role="tablist" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {tabs.map((t) => {
          const on = open === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              onClick={() => setOpen(on ? null : t.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition ${
                on
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {t.label}
              {t.count != null && <span className="ml-1.5 text-xs opacity-60">{t.count}</span>}
              <span aria-hidden className="ml-1.5 text-xs opacity-60">
                {on ? "▴" : "▾"}
              </span>
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={open !== t.id}>
          {t.content}
        </div>
      ))}
    </section>
  );
}
