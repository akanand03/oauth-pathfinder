import { cacheGet, cacheSet } from "../store";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const SEARCH_TTL = 7 * 24 * 3600;

/** One Tavily web search (1 credit, no model tokens). Cached 7 days. */
export async function search(query: string): Promise<{ results: SearchResult[]; cached: boolean }> {
  const key = `search:${query.toLowerCase()}`;
  const hit = await cacheGet<SearchResult[]>(key);
  if (hit) return { results: hit, cached: true };

  if (!process.env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY is not set");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 8 }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Tavily search failed (HTTP ${res.status})`);
  const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  const results = (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title ?? "", url: r.url!, snippet: r.content ?? "" }));
  if (results.length > 0) await cacheSet(key, results, SEARCH_TTL);
  return { results, cached: false };
}
