// JSON schemas for the two model calls, used as Gemini's response schema (or Groq strict mode).
// Every property is in `required` with `additionalProperties: false`, so nullable fields use type unions.

type Schema = Record<string, unknown>;

const obj = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str: Schema = { type: "string" };
const nullableStr: Schema = { type: ["string", "null"] };
const arr = (items: Schema): Schema => ({ type: "array", items });
const enumOf = (...values: string[]): Schema => ({ type: "string", enum: values });

export const FACT_CATEGORIES = [
  "setup",
  "no_review_needed",
  "review_trigger",
  "review_requirement",
  "eligibility",
  "scope_needs_review",
  "scope_no_review",
  "timeline",
  "rejection_reason",
  "limit",
  "other",
] as const;

/** Call 1 (gpt-oss-20b): pull atomic facts out of the trimmed pages, each with a verbatim quote. */
export const extractSchema: Schema = obj({
  oauthSupported: enumOf("yes", "no", "unclear"),
  facts: arr(
    obj({
      claim: str,
      category: enumOf(...FACT_CATEGORIES),
      sourceUrl: str,
      quote: str,
    }),
  ),
});

const evidence = obj({
  label: enumOf("Docs", "Uncertain"),
  url: nullableStr,
  note: nullableStr,
});
const claim = obj({ text: str, evidence });

/** Call 2 (gpt-oss-120b): the guide template. Composio and portal sections are filled in code, not by the model. */
export const writeSchema: Schema = obj({
  verdict: obj({
    difficulty: enumOf("Easy", "Medium", "Hard", "Gated"),
    timeToFirstTest: claim,
    timeToProduction: claim,
    summary: str,
  }),
  callouts: arr(claim),
  steps: arr(obj({ title: str, detail: str, actor: enumOf("agent", "you"), evidence })),
  requirements: arr(
    obj({
      item: str,
      status: enumOf("required", "not_required", "conditional", "unknown"),
      detail: str,
      evidence,
    }),
  ),
  scopes: obj({
    triggerReview: arr(obj({ scope: str, why: str, evidence })),
    noReview: arr(obj({ scope: str, why: str, evidence })),
    tip: str,
  }),
  blockers: arr(obj({ reason: str, fix: str, evidence })),
});
