import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import type { Guide } from "./types";
import { getLibraryGuide } from "./library";
import { properName } from "./slug";

// Upstash when configured; otherwise an in-memory map so `npm run dev` works with no setup.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

const memory: Map<string, unknown> =
  ((globalThis as Record<string, unknown>).__pathfinderMem as Map<string, unknown>) ??
  ((globalThis as Record<string, unknown>).__pathfinderMem = new Map());

// Without Upstash, generated guides are also written to a local JSON file so they survive a dev-server restart.
// Vercel's filesystem is read-only and per-instance, so there this is skipped and Upstash is required.
const GUIDE_FILE = path.join(process.cwd(), ".data", "generated-guides.json");
const useFile = !redis && !process.env.VERCEL;

export const storageMode = redis ? "upstash" : useFile ? "file" : "memory";

type GuideFile = Record<string, { savedAt: number; guide: Guide }>;

function readGuideFile(): GuideFile {
  try {
    return JSON.parse(readFileSync(GUIDE_FILE, "utf8")) as GuideFile;
  } catch {
    return {};
  }
}

function writeGuideFile(guide: Guide) {
  const all = readGuideFile();
  all[guide.slug] = { savedAt: Date.now(), guide };
  mkdirSync(path.dirname(GUIDE_FILE), { recursive: true });
  const tmp = `${GUIDE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2));
  renameSync(tmp, GUIDE_FILE);
}

// Load saved guides into memory once per process.
if (useFile && !memory.has("guides:recent")) {
  const saved = Object.values(readGuideFile()).sort((a, b) => b.savedAt - a.savedAt);
  for (const { guide } of saved) memory.set(`guide:${guide.slug}`, guide);
  memory.set("guides:recent", saved.map(({ guide }) => guide.slug));
}

async function get<T>(key: string): Promise<T | null> {
  if (redis) return (await redis.get<T>(key)) ?? null;
  return (memory.get(key) as T) ?? null;
}

/** Generic TTL cache for search results and fetched pages. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (redis) return (await redis.get<T>(key)) ?? null;
  const entry = memory.get(key) as { v: T; exp: number } | undefined;
  return entry && entry.exp > Date.now() ? entry.v : null;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  if (redis) await redis.set(key, value, { ex: ttlSeconds });
  else memory.set(key, { v: value, exp: Date.now() + ttlSeconds * 1000 });
}

/** Guides saved before names were taken from the docs may be lowercase ("hubspot"); fix the casing from the guide's own text. */
function withProperName(guide: Guide): Guide {
  const name = properName(guide.name, [guide.verdict.summary, ...guide.callouts.map((c) => c.text)]);
  return name === guide.name ? guide : { ...guide, name };
}

export async function getGuide(slug: string): Promise<Guide | null> {
  const library = getLibraryGuide(slug);
  if (library) return library;
  const saved = await get<Guide>(`guide:${slug}`);
  return saved && withProperName(saved);
}

export async function saveGuide(guide: Guide): Promise<void> {
  if (redis) {
    await redis.set(`guide:${guide.slug}`, guide);
    await redis.zadd("guides:recent", { score: Date.now(), member: guide.slug });
  } else {
    memory.set(`guide:${guide.slug}`, guide);
    const recent = (memory.get("guides:recent") as string[]) ?? [];
    memory.set("guides:recent", [guide.slug, ...recent.filter((s) => s !== guide.slug)]);
    if (useFile) writeGuideFile(guide);
  }
}

export async function recentGuides(limit = 12): Promise<Guide[]> {
  const slugs = redis
    ? await redis.zrange<string[]>("guides:recent", 0, limit - 1, { rev: true })
    : ((memory.get("guides:recent") as string[]) ?? []).slice(0, limit);
  const guides = await Promise.all(slugs.map((s) => get<Guide>(`guide:${s}`)));
  return guides.filter((g): g is Guide => g !== null).map(withProperName);
}

/** Prevents two concurrent requests from researching the same app. Returns true if acquired. */
export async function acquireLock(slug: string, ttlSeconds = 300): Promise<boolean> {
  const key = `lock:${slug}`;
  if (redis) return (await redis.set(key, "1", { nx: true, ex: ttlSeconds })) === "OK";
  const until = memory.get(key) as number | undefined;
  if (until && until > Date.now()) return false;
  memory.set(key, Date.now() + ttlSeconds * 1000);
  return true;
}

export async function isLocked(slug: string): Promise<boolean> {
  if (redis) return (await redis.exists(`lock:${slug}`)) === 1;
  const until = memory.get(`lock:${slug}`) as number | undefined;
  return !!until && until > Date.now();
}

export async function releaseLock(slug: string): Promise<void> {
  if (redis) await redis.del(`lock:${slug}`);
  else memory.delete(`lock:${slug}`);
}

/** Fixed-window counter. Returns the count after incrementing. */
export async function incrWindow(key: string, windowSeconds: number): Promise<number> {
  if (redis) {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSeconds);
    return n;
  }
  const entry = memory.get(key) as { n: number; reset: number } | undefined;
  if (!entry || entry.reset < Date.now()) {
    memory.set(key, { n: 1, reset: Date.now() + windowSeconds * 1000 });
    return 1;
  }
  entry.n += 1;
  return entry.n;
}

/** Undoes an incrWindow for a request that was refused, so refusals don't use up the window. */
export async function decrWindow(key: string): Promise<void> {
  if (redis) {
    await redis.decr(key);
    return;
  }
  const entry = memory.get(key) as { n: number; reset: number } | undefined;
  if (entry && entry.n > 0) entry.n -= 1;
}
