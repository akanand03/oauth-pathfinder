import { cacheGet, cacheSet } from "../store";
import type { Guide } from "../types";

const DOCS = "https://docs.composio.dev/toolkits/managed-auth";
const TTL = 7 * 24 * 3600;

/**
 * Checks Composio's toolkit API for managed OAuth (no model tokens). The toolkit list on the docs page
 * is rendered client-side, so the API is the only reliable source; it needs COMPOSIO_API_KEY.
 */
export async function checkComposio(slug: string): Promise<Guide["composio"]> {
  const toolkit = slug.replace(/-/g, "_");
  if (!process.env.COMPOSIO_API_KEY) {
    return {
      managed: "unknown",
      toolkit: null,
      note: "Not checked: COMPOSIO_API_KEY isn't configured. Check the managed-auth directory manually.",
      evidence: { label: "Uncertain", url: DOCS, note: "The directory is rendered client-side; the API needs a key." },
    };
  }

  const cacheKey = `composio:${toolkit}`;
  const hit = await cacheGet<Guide["composio"]>(cacheKey);
  if (hit) return hit;

  const apiUrl = `https://backend.composio.dev/api/v3.1/toolkits/${toolkit}`;
  const res = await fetch(apiUrl, {
    headers: { "x-api-key": process.env.COMPOSIO_API_KEY },
    signal: AbortSignal.timeout(10_000),
  });
  let result: Guide["composio"];
  if (res.status === 404) {
    result = {
      managed: "no",
      toolkit: null,
      note: `Composio has no toolkit named "${toolkit}", so there's no managed OAuth app. Register your own.`,
      evidence: { label: "Tested", url: DOCS, note: `Checked live via ${apiUrl}` },
    };
  } else if (res.ok) {
    const data = (await res.json()) as { composio_managed_auth_schemes?: string[] };
    const schemes = data.composio_managed_auth_schemes ?? [];
    const managed = schemes.some((s) => /oauth/i.test(s));
    result = {
      managed: managed ? "yes" : "no",
      toolkit: toolkit.toUpperCase(),
      note: managed
        ? `Composio supplies the OAuth app (${schemes.join(", ")}), so you can skip registration while prototyping.`
        : "The toolkit exists but OAuth is bring-your-own: register your own app and give Composio its client ID and secret.",
      evidence: { label: "Tested", url: DOCS, note: `Checked live via ${apiUrl}` },
    };
  } else {
    return {
      managed: "unknown",
      toolkit: null,
      note: `Composio API returned HTTP ${res.status}; not checked.`,
      evidence: { label: "Uncertain", url: DOCS },
    };
  }
  await cacheSet(cacheKey, result, TTL);
  return result;
}
