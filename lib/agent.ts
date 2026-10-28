import { createSession, modelFor, PROVIDER } from "./llm";
import { checkComposio } from "./retrieval/composio";
import { fetchPage, type FetchedPage } from "./retrieval/page";
import { search, type SearchResult } from "./retrieval/search";
import { inferProviderDomain, pageKey, pickOfficialPages } from "./retrieval/select";
import { estimateTokens, trimToRelevant } from "./retrieval/trim";
import { extractSchema, writeSchema } from "./schema";
import type { Evidence, Guide, ProgressEvent } from "./types";
import { formatUsd, type StageUsage } from "./usage";
import { properName, type ParsedQuery } from "./slug";

// Retrieval runs in our code; the model only ever sees trimmed page text.
// Budget per guide: 3 searches (no tokens) + 1 small extraction call per page + 1 write call. Models live in ./llm.
const PAGE_TOKEN_CAP = Number(process.env.PAGE_TOKEN_CAP ?? 4000); // keeps each extraction call ~5k tokens
// Reasoning models (OpenRouter free models, Gemini) spend part of the output budget thinking;
// 2,500 cut off every Notion extraction on 2026-10-28.
const EXTRACT_MAX_OUTPUT = PROVIDER === "groq" ? 2500 : 8000;
// Gemini and the OpenRouter reasoning models count thinking tokens against max output, so give the write step headroom.
const WRITE_MAX_OUTPUT = PROVIDER === "groq" ? 6000 : 12000;
const MAX_FACTS = 45;

type Emit = (e: ProgressEvent) => void;

const TIMED_OUT = Symbol("timed out");

/** Resolves to TIMED_OUT if `p` hasn't settled by `deadline`. The call keeps running; its result is ignored. */
async function beforeDeadline<T>(p: Promise<T>, deadline: number): Promise<T | typeof TIMED_OUT> {
  const ms = deadline - Date.now();
  if (ms <= 0) return TIMED_OUT;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<typeof TIMED_OUT>((r) => (timer = setTimeout(() => r(TIMED_OUT), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

// Don't start an extraction call with less time than this left; it would just be cut off.
const MIN_EXTRACT_MS = 20_000;

interface Fact {
  claim: string;
  category: string;
  sourceUrl: string;
  quote: string;
  verified: boolean;
}

const EXTRACT_PROMPT = `You extract facts about registering a third-party OAuth app with a provider, from ONE documentation page.
Rules:
- Only facts stated on the page. Never add outside knowledge.
- Each fact: a short claim, a category, sourceUrl = the page URL given, and quote = an exact, verbatim snippet (10-200 chars) copied from the page that supports it.
- Prefer: how to create the app, what works without review, what triggers review, review requirements (privacy policy, domain, logo, demo video, security assessment, business entity), eligibility, scopes needing review vs not, timelines, limits, rejection reasons, required authorize/token parameters, what happens when a user cancels, and simpler alternatives that skip OAuth (personal or internal tokens).
- Pages about the provider's own OAuth, authorization, app creation, tokens, review or publishing are exactly what we want: always extract from them, even if they also mention other services, SDKs or code samples.
- Return an empty list ONLY when the whole page is about the provider's own runtime or product calling OUT to a different provider's OAuth (e.g. a "Workers"/"Functions" page whose examples authorize against GitHub or Google). If only a section is like that, skip that section and extract the rest.
- If the page says there are no OAuth scopes (e.g. access is granted per page/resource by the user), state that as a fact.
- At most 15 facts. If the page has nothing relevant, return an empty list.`;

const WRITE_PROMPT = `You write an OAuth onboarding guide for developers building AI agents that need a "Connect <provider>" button, using ONLY the numbered facts given.
Evidence rules (strict):
- "Docs": only for content backed by a fact marked verified; evidence.url = that fact's source URL exactly.
- "Uncertain": anything from an UNVERIFIED fact, anything inferred, or anything not in the facts (url may be null; note says why).
- Never invent URLs, timelines, prices or requirements. If the facts don't cover a section, include fewer items or one item marked Uncertain.
Content rules:
- Scope: this guide is ONLY about other apps connecting to the provider's API through its OAuth. Ignore facts about the provider's own runtime/SDK connecting to other services (e.g. "Workers", deploy commands, CLI setup for calling GitHub/Google); never turn them into steps, requirements or blockers.
- difficulty (pick the FIRST that applies, top to bottom):
  1. Gated: getting access is an application that can be denied.
  2. Hard: useful scopes need review plus a security assessment or long verification.
  3. Medium: ANY review, approval or verification exists for some audience, even if only for public listing, marketplace distribution, or external (non-internal) users.
  4. Easy: no review of any kind for any audience.
  If the facts mention review/approval for external users or a listing, the answer is never Easy.
- verdict.timeToFirstTest and verdict.timeToProduction are DURATIONS ("Minutes", "5-10 business days", "Immediate, no review"), or "Not documented" marked Uncertain. Never put another kind of fact (settings, warnings, requirements) in them; put those in callouts.
- steps: ordered; actor "agent" for what an AI coding agent can do (write code, draft text, prepare config), "you" for what needs a human account or judgement (sign in, create the app, verify domain, record demo video, wait for review).
- scopes: list scope names ONLY if the facts name them. If the facts say the provider has no OAuth scopes (e.g. per-page or per-resource sharing), leave triggerReview empty, describe the access model in noReview, and do not tell the reader to look up scope names. If scopes simply aren't covered, leave both lists empty and say so in the tip.
- scopes.tip: the lightest way to get the access the agent needs (lightest scopes, least data shared). Never recommend a setting that would stop other users or workspaces from installing a public "Connect" button just to avoid an optional listing.
- requirements: include every requirement the facts state (e.g. redirect URI, installation settings), even if few; mark items the facts don't cover as "unknown" + Uncertain rather than leaving the list empty.
- Never mention fact numbers (F1, F2…) in any text; they're internal.
- Keep every string concise (one or two sentences).`;

/**
 * `deadline` (epoch ms) is when the run must stop so the caller can still save: the hosting function has a hard
 * time limit. If it hits during extraction or writing, the facts found so far are returned as a partial guide.
 */
export async function runAgent(q: ParsedQuery, emit: Emit, deadline = Number.POSITIVE_INFINITY): Promise<Guide> {
  const llm = createSession(emit);
  const usage: StageUsage[] = [];

  // 1. Retrieval: at most 3 searches, run by our code.
  emit({ type: "stage", stage: "search", message: "Searching docs" });
  const queries = [
    `${q.name} OAuth app developer documentation authorization`,
    `${q.name} app review verification publish integration marketplace`,
    `${q.name} developer portal create OAuth app client ID`,
  ];
  const perQuery: SearchResult[][] = [];
  for (const query of queries) {
    try {
      const { results, cached } = await search(query);
      emit({ type: "search", query: cached ? `${query} (cached)` : query });
      perQuery.push(results);
    } catch (err) {
      emit({ type: "found", message: `Search failed: ${err instanceof Error ? err.message : err}` });
      perQuery.push([]);
    }
  }
  const domain = inferProviderDomain(q.slug, q.website, perQuery.flat());
  if (!domain) throw new Error(`Couldn't identify ${q.name}'s official site. Try entering its website, e.g. ${q.slug}.com.`);
  const picks = pickOfficialPages(perQuery, domain, 3);
  if (picks.length === 0) throw new Error(`No official ${domain} docs found in search results. Try entering the developer site URL.`);
  emit({ type: "found", message: `Picked ${picks.length} official page${picks.length > 1 ? "s" : ""} on ${domain}` });

  // 2. Fetch + strip + trim each page ourselves (cached).
  emit({ type: "stage", stage: "fetch", message: "Reading developer portal and docs pages" });
  const pages: { page: FetchedPage; text: string }[] = [];
  let pagesFromCache = 0;
  for (const pick of picks) {
    try {
      const { page, cached } = await fetchPage(pick.url);
      if (cached) pagesFromCache++;
      emit({ type: "fetch", url: cached ? `${page.url} (cached)` : page.url });
      const text = trimToRelevant(page.text, PAGE_TOKEN_CAP);
      if (estimateTokens(text) < 40) {
        emit({ type: "found", message: `Skipped ${page.url}: no readable text (probably rendered by JavaScript)` });
        continue;
      }
      pages.push({ page, text });
    } catch (err) {
      emit({ type: "found", message: `Couldn't read ${pick.url}: ${err instanceof Error ? err.message : err}` });
    }
  }
  if (pages.length === 0) throw new Error("None of the official pages could be read. No model tokens were spent.");
  // Use the provider's own spelling from its docs ("HubSpot", not the typed "hubspot") from here on.
  q = { ...q, name: properName(q.name, pages.flatMap((p) => [p.page.title, p.text])) };

  // Portal observation in code: a fetched page that is itself a form, not behind login.
  const formPage = pages.find((p) => p.page.formFields.length >= 2);
  const portalObservation: Guide["portalObservation"] = formPage
    ? { url: formPage.page.url, fields: formPage.page.formFields, note: "Observed on the live page without signing in." }
    : { url: null, fields: [], note: "No app-creation form was publicly visible (usually behind sign-in), so fields weren't observed." };

  // 3. Composio: deterministic API check, no tokens.
  emit({ type: "stage", stage: "composio", message: "Checking Composio managed auth" });
  const composio = await checkComposio(q.slug);
  emit({
    type: "found",
    message: composio.managed === "unknown" ? "Composio: not checked" : `Composio managed OAuth: ${composio.managed}`,
  });

  // 4. Extraction: one small call per page so each stays well under free-tier per-minute token limits.
  const facts: Fact[] = [];
  let oauthSupported = "unclear";
  let timedOut = false;
  for (const [i, { page, text }] of pages.entries()) {
    if (deadline - Date.now() < MIN_EXTRACT_MS) {
      timedOut = true;
      break;
    }
    emit({ type: "stage", stage: "extract", message: `Reading page ${i + 1} of ${pages.length}` });
    const result = await beforeDeadline(
      llm.generateJson({
        stage: `extract ${i + 1}`,
        role: "extract",
        system: EXTRACT_PROMPT,
        input: `Provider: ${q.name}\nPage URL: ${page.url}\nPage title: ${page.title}\n\n${text}`,
        schema: extractSchema,
        maxOutput: EXTRACT_MAX_OUTPUT,
      }),
      deadline,
    );
    if (result === TIMED_OUT) {
      timedOut = true;
      break;
    }
    const { json, usage: u } = result;
    usage.push(u);
    console.log(`[agent] ${q.slug}/extract-${i + 1} ${u.model} tokens`, u.inputTokens, "in /", u.outputTokens, "out");

    if (!json) {
      emit({ type: "found", message: `Page ${i + 1}: output cut off, skipped (${u.inputTokens + u.outputTokens} tokens)` });
      continue;
    }
    const parsed = json as { oauthSupported: string; facts: Omit<Fact, "verified">[] };
    if (parsed.oauthSupported === "yes" || (parsed.oauthSupported === "no" && oauthSupported !== "yes")) {
      oauthSupported = parsed.oauthSupported;
    }
    const pageText = normalize(text);
    const pageFacts = parsed.facts.map((f) => ({
      ...f,
      sourceUrl: page.url, // the model only saw this page; never trust a different URL
      verified: f.quote.length >= 10 && pageText.includes(normalize(f.quote)),
    }));
    facts.push(...pageFacts);
    emit({
      type: "found",
      message: `Page ${i + 1}: ${pageFacts.length} facts, ${pageFacts.filter((f) => f.verified).length} quotes verified (${(u.inputTokens + u.outputTokens).toLocaleString()} tokens)`,
    });
  }

  // Writing from zero facts produces an empty "Unknown" guide; stop instead and keep the slug free to retry.
  if (facts.length === 0) {
    throw new Error(
      timedOut
        ? "The run hit the time limit before any facts were extracted. No guide was saved; try again later."
        : "No facts could be extracted from the official pages (model output was cut off or empty). No guide was saved.",
    );
  }

  const sources = [...pages.map((p) => p.page.url), ...(composio.evidence.url ? [composio.evidence.url] : [])];
  const accounting = () => {
    const totalTokens = usage.reduce((n, s) => n + s.inputTokens + s.outputTokens, 0);
    const estimatedCostUsd = usage.reduce((n, s) => n + s.costUsd, 0);
    return { stages: usage, totalTokens, estimatedCostUsd, searches: queries.length, pagesFetched: pages.length, pagesFromCache };
  };
  const partial = (stage: string): Guide => {
    emit({ type: "found", message: `Time limit reached during ${stage}: saving ${facts.length} extracted facts as a partial guide, all marked Uncertain.` });
    return partialGuide({ q, domain, facts, stage, composio, portalObservation, sources, usage: accounting() });
  };
  if (timedOut) return partial("extraction");

  // 5. Write: one call to the stronger model over the compact fact list.
  emit({ type: "stage", stage: "write", message: `Writing guide with ${modelFor("write")}` });
  const kept = [...facts.filter((f) => f.verified), ...facts.filter((f) => !f.verified)].slice(0, MAX_FACTS);
  const factLines = kept
    .map((f, i) => `F${i + 1} [${f.category}] ${f.claim} (source: ${f.sourceUrl}) ${f.verified ? "verified" : "UNVERIFIED"}`)
    .join("\n");
  const writeInput = `Provider: ${q.name}\nOAuth apps supported: ${oauthSupported}\nToday: ${today()}\n\nFacts:\n${factLines || "(no facts found)"}`;
  const inputEstimate = estimateTokens(WRITE_PROMPT + writeInput);
  const limit = llm.perMinuteLimit;
  const maxOut = limit ? Math.max(2500, Math.min(WRITE_MAX_OUTPUT, limit - inputEstimate - 300)) : WRITE_MAX_OUTPUT;

  const writeResult = await beforeDeadline(
    llm.generateJson({
      stage: "write",
      role: "write",
      system: WRITE_PROMPT,
      input: writeInput,
      schema: writeSchema,
      maxOutput: maxOut,
    }),
    deadline,
  );
  if (writeResult === TIMED_OUT) return partial("writing");
  const { json: written, usage: wu } = writeResult;
  usage.push(wu);
  console.log(`[agent] ${q.slug}/write ${wu.model} tokens`, wu.inputTokens, "in /", wu.outputTokens, "out");
  if (!written) throw new Error("The write step ran out of output tokens. No guide was saved.");
  const draft = stripFactIds(written) as Omit<
    Guide,
    "slug" | "name" | "website" | "kind" | "sources" | "lastChecked" | "composio" | "portalObservation"
  >;

  // Docs labels must point at a page we fetched and a fact whose quote we found on it.
  const verifiedPages = new Set(kept.filter((f) => f.verified).map((f) => pageKey(f.sourceUrl)));
  const fix = (e: Evidence): Evidence => enforceEvidence(e, verifiedPages);

  const { totalTokens, estimatedCostUsd } = accounting();
  console.log(`[agent] ${q.slug} total`, totalTokens, "tokens", formatUsd(estimatedCostUsd));
  emit({ type: "found", message: `Guide written · ${totalTokens.toLocaleString()} tokens total (~${formatUsd(estimatedCostUsd)})` });

  return {
    ...draft,
    slug: q.slug,
    name: q.name,
    website: q.website ?? `https://${domain}`,
    kind: "generated",
    verdict: {
      ...draft.verdict,
      timeToFirstTest: { ...draft.verdict.timeToFirstTest, evidence: fix(draft.verdict.timeToFirstTest.evidence) },
      timeToProduction: { ...draft.verdict.timeToProduction, evidence: fix(draft.verdict.timeToProduction.evidence) },
    },
    callouts: draft.callouts.map((c) => ({ ...c, evidence: fix(c.evidence) })),
    steps: draft.steps.map((s) => ({ ...s, evidence: fix(s.evidence) })),
    requirements: draft.requirements.map((r) => ({ ...r, evidence: fix(r.evidence) })),
    scopes: {
      ...draft.scopes,
      triggerReview: draft.scopes.triggerReview.map((s) => ({ ...s, evidence: fix(s.evidence) })),
      noReview: draft.scopes.noReview.map((s) => ({ ...s, evidence: fix(s.evidence) })),
    },
    blockers: draft.blockers.map((b) => ({ ...b, evidence: fix(b.evidence) })),
    composio,
    portalObservation,
    sources,
    lastChecked: today(),
    usage: accounting(),
  };
}

const PARTIAL_CALLOUTS = 20;

/**
 * Built in code, no model: the raw extracted facts, verified ones first, each labelled Uncertain because no
 * guide was written to check them against. Saved so a timed-out run isn't wasted; the route lets it be regenerated.
 */
export function partialGuide(args: {
  q: ParsedQuery;
  domain: string;
  facts: Fact[];
  stage: string;
  composio: Guide["composio"];
  portalObservation: Guide["portalObservation"];
  sources: string[];
  usage: Guide["usage"];
}): Guide {
  const { q, domain, facts, stage } = args;
  const ordered = [...facts.filter((f) => f.verified), ...facts.filter((f) => !f.verified)].slice(0, PARTIAL_CALLOUTS);
  const notWritten: Evidence = { label: "Uncertain", url: null, note: "Partial guide: the run stopped before this was written." };
  return {
    slug: q.slug,
    name: q.name,
    website: q.website ?? `https://${domain}`,
    kind: "generated",
    partial: true,
    verdict: {
      difficulty: "Unknown",
      timeToFirstTest: { text: "Not documented", evidence: notWritten },
      timeToProduction: { text: "Not documented", evidence: notWritten },
      summary: `Partial guide: the run hit the hosting time limit during ${stage}, so these are the raw facts found on ${q.name}'s official pages, not a written guide. Search for ${q.name} again to regenerate it.`,
    },
    callouts: ordered.map((f) => ({
      text: f.claim,
      evidence: {
        label: "Uncertain",
        url: f.sourceUrl,
        note: f.verified ? "Partial run: quote found on this page, but the guide wasn't written." : "Partial run: quote not verified.",
      },
    })),
    steps: [],
    requirements: [],
    scopes: { triggerReview: [], noReview: [], tip: "Not covered: the run stopped before the guide was written." },
    blockers: [],
    composio: args.composio,
    portalObservation: args.portalObservation,
    sources: args.sources,
    lastChecked: today(),
    usage: args.usage,
  };
}

/** Downgrades any Docs label the agent didn't earn. The model can't emit Tested at all; only code-observed checks can. */
export function enforceEvidence(e: Evidence, verifiedPages: Set<string>): Evidence {
  if (e.label !== "Docs") return e;
  let key: string | null = null;
  try {
    key = e.url ? pageKey(e.url) : null;
  } catch {
    key = null;
  }
  if (key && verifiedPages.has(key)) return e;
  return { label: "Uncertain", url: e.url ?? null, note: e.url ? "Downgraded: no verified quote from this page." : "No source URL." };
}

/** Removes internal fact references like "(F2)", "(F5, F6)" or "(F20–F22, F29)" from every string the model wrote. */
export function stripFactIds<T>(value: T): T {
  if (typeof value === "string") {
    return value
      .replace(/\s*\((?:F\d+(?:\s*[–-]\s*F?\d+)?(?:\s*,\s*)?)+\)/g, "")
      .replace(/\s+([.,;:])/g, "$1") as T;
  }
  if (Array.isArray(value)) return value.map(stripFactIds) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripFactIds(v)])) as T;
  }
  return value;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
