"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProgressEvent } from "@/lib/types";

interface Line {
  icon: string;
  text: string;
  kind: "stage" | "detail" | "found" | "error";
}

function toLine(e: ProgressEvent): Line | null {
  switch (e.type) {
    case "stage":
      return e.stage === "wait"
        ? { icon: "⏳", text: e.message, kind: "detail" }
        : { icon: "▸", text: e.message, kind: "stage" };
    case "search":
      return { icon: "🔎", text: `Searching “${e.query}”`, kind: "detail" };
    case "fetch":
      return { icon: "📄", text: `Reading ${e.url}`, kind: "detail" };
    case "found":
      return { icon: "✓", text: e.message, kind: "found" };
    case "error":
      return { icon: "✕", text: e.message, kind: "error" };
    default:
      return null;
  }
}

export function ProgressFeed() {
  const router = useRouter();
  const q = useSearchParams().get("q") ?? "";
  const [lines, setLines] = useState<Line[]>([]);
  const [status, setStatus] = useState<"running" | "error" | "done">("running");
  useEffect(() => {
    // Duplicate connects (e.g. Strict Mode) are safe: the server lock makes them wait for one run.
    if (!q) return;
    let finished = false;
    const source = new EventSource(`/api/generate?q=${encodeURIComponent(q)}`);
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as ProgressEvent;
      const line = toLine(event);
      if (line) setLines((prev) => [...prev, line]);
      if (event.type === "done") {
        finished = true;
        setStatus("done");
        source.close();
        router.push(`/guides/${event.slug}`);
      } else if (event.type === "error") {
        finished = true;
        setStatus("error");
        source.close();
      }
    };
    source.onerror = () => {
      source.close();
      if (finished) return;
      setStatus("error");
      setLines((prev) => [...prev, { icon: "✕", text: "Connection lost. Reload to check whether the guide was saved.", kind: "error" }]);
    };
    return () => source.close();
  }, [q, router]);

  if (!q) {
    return (
      <p>
        Nothing to research. <Link href="/" className="text-indigo-600 underline">Go back</Link>.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Researching “{q}”</h1>
        <p className="text-sm text-zinc-500">
          Our code runs 3 searches, picks the top official pages and trims them to the OAuth and review sections. A small
          model extracts quoted facts page by page, then a larger model writes the guide. Nothing signs in or submits
          forms.
        </p>
      </div>
      <ol className="space-y-1.5 rounded-xl border border-zinc-200 bg-white p-5 font-mono text-sm dark:border-zinc-800 dark:bg-zinc-900">
        {lines.map((l, i) => (
          <li
            key={i}
            className={
              l.kind === "stage"
                ? "pt-2 font-semibold first:pt-0"
                : l.kind === "found"
                  ? "pl-5 text-emerald-700 dark:text-emerald-400"
                  : l.kind === "error"
                    ? "text-rose-600"
                    : "truncate pl-5 text-zinc-500"
            }
          >
            {l.icon} {l.text}
          </li>
        ))}
        {status === "running" && <li className="animate-pulse pl-5 text-zinc-400">…</li>}
      </ol>
      {status === "error" && (
        <Link href="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
          ← Back to search
        </Link>
      )}
    </div>
  );
}
