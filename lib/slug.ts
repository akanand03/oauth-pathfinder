export interface ParsedQuery {
  name: string;
  slug: string;
  website: string | null;
}

/** Turns "Notion", "notion.so" or "https://www.notion.so/product" into a stable name + slug. */
export function parseQuery(raw: string): ParsedQuery | null {
  const input = raw.trim().slice(0, 100);
  if (!input || !/^[\p{L}\p{N} .:/_\-&+]+$/u.test(input)) return null;

  let website: string | null = null;
  let base = input;
  const looksLikeUrl = /^https?:\/\//i.test(input) || /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(input);
  if (looksLikeUrl) {
    try {
      const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      website = `https://${url.hostname}`;
      const parts = url.hostname.replace(/^www\./, "").split(".");
      base = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    } catch {
      return null;
    }
  }

  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return null;
  const name = looksLikeUrl ? base.charAt(0).toUpperCase() + base.slice(1) : input;
  return { name, slug, website };
}

/**
 * The provider's own spelling ("HubSpot") as written in `texts` (docs pages, or a guide's own text).
 * All-lowercase hits are ignored since they're mostly URLs; all-caps only counts if nothing else does.
 * Falls back to what the user typed if it has capitals, else title case.
 */
export function properName(name: string, texts: string[]): string {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return name;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const [hit] of text.matchAll(re)) {
      if (hit !== hit.toLowerCase()) counts.set(hit, (counts.get(hit) ?? 0) + 1);
    }
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]).map(([hit]) => hit);
  const best = ranked.find((h) => h !== h.toUpperCase()) ?? ranked[0];
  if (best) return best;
  if (/\p{Lu}/u.test(name)) return name;
  return name.replace(/(^|[\s\-_.])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
