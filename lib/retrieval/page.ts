import { cacheGet, cacheSet } from "../store";

export interface FetchedPage {
  url: string;
  title: string;
  /** Plain text with "## " headings and "- " list items. */
  text: string;
  /** Labels of form inputs, if the page itself is a form (e.g. an app-creation page that isn't behind login). */
  formFields: string[];
}

const PAGE_TTL = 7 * 24 * 3600;
const MAX_BYTES = 2_000_000;

/** Fetches a public page and converts it to plain text. Read-only: GET, no cookies, no form submission. Cached 7 days. */
export async function fetchPage(url: string): Promise<{ page: FetchedPage; cached: boolean }> {
  const key = `page:${url}`;
  const hit = await cacheGet<FetchedPage>(key);
  if (hit) return { page: hit, cached: true };

  assertPublicUrl(url);
  const res = await fetch(url, {
    headers: { "User-Agent": "OAuthPathfinderBot/1.0 (+research; read-only)", Accept: "text/html,text/plain" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  assertPublicUrl(res.url);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain/.test(type)) throw new Error(`unsupported content type ${type}`);
  const raw = (await res.text()).slice(0, MAX_BYTES);

  const page = type.includes("html")
    ? { url: res.url, title: extractTitle(raw), text: htmlToText(raw), formFields: extractFormFields(raw) }
    : { url: res.url, title: url, text: raw, formFields: [] };
  await cacheSet(key, page, PAGE_TTL);
  return { page, cached: false };
}

/** Blocks localhost / private-network targets so search results can't make the server fetch internal URLs. */
function assertPublicUrl(u: string) {
  const url = new URL(u);
  if (!/^https?:$/.test(url.protocol)) throw new Error("only http(s) URLs");
  const h = url.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.startsWith("[")
  ) {
    throw new Error("refusing to fetch a private address");
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function extractTitle(html: string): string {
  return decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
}

export function htmlToText(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|iframe|template)\b[\s\S]*?<\/\1>/gi, " ");
  const main = s.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? s.match(/<article\b[\s\S]*?<\/article>/i)?.[0];
  if (main) s = main;
  s = s
    .replace(/<h[1-4][^>]*>/gi, "\n\n## ")
    .replace(/<\/h[1-4]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(br|\/p|\/div|\/tr|\/section|\/ul|\/ol|\/table)[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(s)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractFormFields(html: string): string[] {
  if (!/<form\b/i.test(html)) return [];
  const labels = [...html.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/gi)].map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
  const inputs = [...html.matchAll(/<(input|textarea|select)\b[^>]*>/gi)]
    .filter((m) => !/type="(hidden|submit|button)"/i.test(m[0]))
    .map((m) => m[0].match(/(?:aria-label|placeholder|name)="([^"]+)"/i)?.[1] ?? "")
    .map(decodeEntities);
  return [...new Set([...labels, ...inputs].filter((f) => f && f.length < 80))].slice(0, 25);
}
