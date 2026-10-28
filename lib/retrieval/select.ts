import type { SearchResult } from "./search";

/** "developers.notion.com" -> "notion.com". Naive (ignores multi-part TLDs like co.uk), good enough for provider domains. */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  return parts.slice(-2).join(".");
}

/** Uses the website the user typed, else the most common domain among results whose host mentions the provider. */
export function inferProviderDomain(slug: string, website: string | null, results: SearchResult[]): string | null {
  if (website) return registrableDomain(new URL(website).hostname);
  const counts = new Map<string, number>();
  for (const r of results) {
    const host = safeHost(r.url);
    if (host && host.replace(/[^a-z0-9]/g, "").includes(slug.replace(/-/g, ""))) {
      const d = registrableDomain(host);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function safeHost(u: string): string | null {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function pageKey(u: string): string {
  const url = new URL(u);
  return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
}

function scoreResult(r: SearchResult): number {
  const url = r.url.toLowerCase();
  const host = safeHost(r.url) ?? "";
  let s = 0;
  if (/^(developers?|docs|api|dev)\./.test(host)) s += 3;
  if (/\/(docs|developers?|api|reference|guides?)\b/.test(url)) s += 3;
  if (/oauth|authoriz|\/auth/.test(url)) s += 3;
  if (/review|verif|publish|marketplace|listing|distribut|approv|partner/.test(url)) s += 3;
  if (/apps\/new|my-integrations|integrations|create|register|console/.test(url)) s += 2;
  if (/blog|news|community|forum|questions|changelog|careers|press|status\./.test(url)) s -= 5;
  return s;
}

/**
 * Picks up to `max` official pages: the best page for each query first (OAuth setup, review, portal),
 * then the next best overall. Only pages on the provider's own domain qualify.
 */
export function pickOfficialPages(perQuery: SearchResult[][], domain: string, max = 3): SearchResult[] {
  const official = (r: SearchResult) => {
    const host = safeHost(r.url);
    return !!host && (host === domain || host.endsWith(`.${domain}`));
  };
  const picked: SearchResult[] = [];
  const seen = new Set<string>();
  const take = (r: SearchResult) => {
    const k = pageKey(r.url);
    if (seen.has(k) || picked.length >= max) return;
    seen.add(k);
    picked.push(r);
  };
  const ranked = perQuery.map((rs) => rs.filter(official).sort((a, b) => scoreResult(b) - scoreResult(a)));
  for (const rs of ranked) {
    const best = rs.find((r) => !seen.has(pageKey(r.url)));
    if (best) take(best);
  }
  for (const r of ranked.flat().sort((a, b) => scoreResult(b) - scoreResult(a))) take(r);
  return picked;
}
