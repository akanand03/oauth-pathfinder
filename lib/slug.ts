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
