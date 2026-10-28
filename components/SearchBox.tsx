"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { librarySlugFor } from "@/lib/aliases";
import { parseQuery } from "@/lib/slug";

export function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = parseQuery(value);
    if (!q) {
      setError("Enter an app name (e.g. Notion) or a website (e.g. notion.so).");
      return;
    }
    const lib = librarySlugFor(q.slug);
    router.push(lib ? `/guides/${lib}` : `/generate?q=${encodeURIComponent(value.trim())}`);
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="App name or website, e.g. Notion, hubspot.com"
          aria-label="App name or website"
          maxLength={100}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Find path
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </form>
  );
}
