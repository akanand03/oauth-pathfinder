"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const keyFor = (id: string) => `pathfinder:helpful:${id}`;

function read(id: string): boolean {
  try {
    return window.localStorage.getItem(keyFor(id)) === "1";
  } catch {
    return false; // storage blocked (private mode, disabled site data)
  }
}

function write(id: string, value: boolean) {
  try {
    if (value) window.localStorage.setItem(keyFor(id), "1");
    else window.localStorage.removeItem(keyFor(id));
  } catch {
    /* storage blocked; the click just doesn't persist */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Per-viewer "was this helpful?" toggle. Stored only in this browser; nothing is sent anywhere. */
export function HelpfulButton({ id }: { id: string }) {
  const helpful = useSyncExternalStore(subscribe, () => read(id), () => false);
  return (
    <button
      type="button"
      aria-pressed={helpful}
      onClick={() => write(id, !helpful)}
      className={`rounded-full border px-2 py-0.5 text-xs transition ${
        helpful
          ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-200"
          : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      }`}
    >
      {helpful ? "👍 Thanks!" : "Was this helpful? 👍"}
    </button>
  );
}
