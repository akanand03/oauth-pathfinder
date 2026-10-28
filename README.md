# OAuth Pathfinder

Developers building AI agents need "Connect X" buttons. Each one means registering an OAuth app with provider X, and sometimes passing a review. OAuth Pathfinder tells you up front whether that takes 5 minutes or 5 weeks, what's required, and what gets submissions rejected.

- **Home:** search by app name or website, and browse the library grid with difficulty badges.
- **Library:** GitHub (Easy), Slack (Medium), Google Gmail (Hard), LinkedIn (Gated) and Notion (Medium), checked by hand against live docs.
- **On every guide:** a timeline (active work vs waiting on the provider), a Scope Advisor with lighter-scope suggestions, and, for Gmail and LinkedIn, copyable drafts (scope justifications, demo video outline, pre-submission checklist).
- **Live generation:** an app not in the library is researched by an agent in real time. Progress streams over SSE, and the guide is saved.
- **Shareable URLs:** every guide lives at `/guides/[slug]`. Generated guides are stored in Redis, so links keep working.
- **`/verification`:** what we checked, what we corrected, what remains uncertain, and a section for manual setup tests.
- **`/eval`:** a table comparing library and agent-generated guides claim by claim (rows filled in by hand from `data/eval.json`).

## Setup

```bash
npm install
cp .env.example .env.local   # add OPENROUTER_API_KEY and TAVILY_API_KEY (Upstash optional locally)
npm run dev
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | yes, for generation | OpenRouter API key from [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys). Only free models are used. |
| `LLM_PROVIDER` | no | `openrouter` (default), `gemini` or `groq` |
| `OPENROUTER_EXTRACT_MODELS` / `OPENROUTER_WRITE_MODELS` | no | Comma-separated `:free` model fallback lists (defaults below) |
| `GEMINI_API_KEY` | only if `LLM_PROVIDER=gemini` | Gemini API key from [AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_EXTRACT_MODEL` / `GEMINI_WRITE_MODEL` | no | Default `gemini-3.5-flash-lite` / `gemini-3.8-flash` |
| `GROQ_API_KEY` | only if `LLM_PROVIDER=groq` | Groq API key (fallback provider) |
| `TAVILY_API_KEY` | yes, for generation | Web search (free: 1,000 searches/month; each guide uses 3, and repeats are cached) |
| `COMPOSIO_API_KEY` | no | Managed-auth check via Composio's toolkit API. Without it, that section is marked Uncertain. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | on Vercel | Guides, page/search caches, locks, rate limits. Locally falls back to memory, with generated guides also saved to `.data/generated-guides.json`. |
| `GROQ_EXTRACT_MODEL` / `GROQ_WRITE_MODEL` | no | Groq fallback models, default `openai/gpt-oss-20b` / `openai/gpt-oss-120b` |
| `PAGE_TOKEN_CAP` | no | Tokens of trimmed text per page (default 4000) |
| `RATE_LIMIT_PER_HOUR` | no | New guides per IP per hour (default 3) |
| `GLOBAL_DAILY_LIMIT` | no | New guides per day across all visitors (default 8 on OpenRouter, 30 otherwise) |

## How to deploy

The app is a standard Next.js project; Vercel needs no `vercel.json`.

1. **Storage:** create a free [Upstash Redis](https://console.upstash.com) database and copy its REST URL and token. Without it, each serverless instance has its own memory, so saved guides, caches and the daily cap won't persist.
2. **Repo:** push to GitHub. `.env*` is gitignored (only `.env.example`, with empty values, is committed). Check with `git status` that `.env.local` isn't staged.
3. **Import** the repo at [vercel.com/new](https://vercel.com/new). Framework preset: Next.js; build command and output are the defaults.
4. **Environment variables** (Project → Settings → Environment Variables): `OPENROUTER_API_KEY`, `TAVILY_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and optionally `COMPOSIO_API_KEY`. Leave `GLOBAL_DAILY_LIMIT` unset to keep the 8-guides/day cap.
5. **Deploy.** `/api/generate` sets `maxDuration = 300`; check that your Vercel plan allows a 300-second function duration. Live runs on free models took 2–3.5 minutes (Zoom 140s, Notion 203s).
6. **Smoke test:** open `/`, a library guide, `/verification` and `/eval`. Generating a guide spends free-model requests, so try one only when you mean to.

**Persistence:** locally, without Upstash, generated guides are saved to `.data/generated-guides.json` (gitignored) and reloaded on restart. On Vercel the filesystem is read-only and per instance, so that file isn't used: set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (free Upstash database) or generated guides, caches, locks and the daily cap reset on every cold start. Guides generated locally don't move to Vercel automatically; re-generate them there, or copy them into Redis.

Without `OPENROUTER_API_KEY` (or the key for the chosen `LLM_PROVIDER`) the site still works; live generation shows a "not configured" message.

## How the agent works

Retrieval happens in our code, not inside the model. A guide targets **under 40k tokens**, and each model call stays small (~5k tokens) so it fits free-tier per-minute limits:

1. **Search (0 tokens):** at most 3 searches (OAuth docs, review/verification, developer portal) via Tavily.
2. **Pick pages (0 tokens):** infer the provider's own domain and keep the top 3 official pages, preferring docs, OAuth, review, and app-creation URLs. Third-party blogs are never used.
3. **Fetch and trim (0 tokens):** fetch each page ourselves (read-only GET, private addresses blocked), strip the HTML to text, and keep only the sections mentioning OAuth, scopes, review, verification, or approval, capped at `PAGE_TOKEN_CAP` (4k) tokens. If a page is itself a public form, its field labels are recorded as **Tested**.
4. **Composio (0 tokens):** call Composio's toolkit API for `composio_managed_auth_schemes`. The docs directory is rendered client-side, so the API is the reliable source.
5. **Extract (one call per page, ~5k tokens each):** pull atomic facts, each with a verbatim quote. The server checks every quote against the page text.
6. **Write (one call):** turn the compact fact list into the guide JSON.

**Models (OpenRouter, default).** Both calls go to OpenRouter's OpenAI-compatible API with a `models` fallback list of three free models that support JSON Schema output (checked against `/api/v1/models` on 2026-10-28), so one busy model doesn't break a run:

| Step | Models, in fallback order |
| --- | --- |
| Extract | `nvidia/nemotron-3.5-super-vl:free`, `xingchen-agi/xing4.0-29b-a4b:free`, `dots-studio/dots-3-note-preview:free` |
| Write | `nvidia/nemotron-3.5-super-vl:free`, `xingchen-agi/xing4.0-29b-a4b:free`, `dots-studio/dots-3-note-preview:free` (last: it spent its whole 12k output budget reasoning on a Zoom write) |

Requests use `response_format: json_schema` (strict) with `provider.require_parameters: true`, so they only route to endpoints that honour the schema and every guide matches the template. The guide records which model actually answered each stage. If OpenRouter returns a 429 (or 502/503 when every free model is busy), the agent waits (`Retry-After` or `X-RateLimit-Reset` if given, otherwise backoff), shows "Waiting Ns: OpenRouter rate limit" in the feed, and retries up to 4 times. Hitting the free daily limit stops the run with a clear message.

**Free-tier budget.** Free models allow 20 requests/minute and 50/day per account (1,000/day once 10 credits have been bought). A guide makes 4 model calls, so generation is capped at **8 new guides per day** across all visitors; after that the app says so and library and saved guides keep working. Cost shows $0 on free models.

Gemini (`LLM_PROVIDER=gemini`: 3.5 Flash-Lite extract, 3.8 Flash write, Interactions API structured output, backoff on 429) and Groq (`LLM_PROVIDER=groq`: gpt-oss-20b/120b, paced by `x-ratelimit-*` headers) remain as fallbacks.

The server then **enforces evidence labels**. `Docs` survives only if it cites a fetched page with at least one verified quote; anything else becomes `Uncertain`. The model can't emit `Tested`; only checks our code ran live can. Token use and estimated cost per stage are logged and shown on every generated guide.

**Caching, so repeats cost zero:** finished guides are permanent. Search results, fetched pages, and Composio lookups are cached for 7 days. A per-slug lock stops two visitors from researching the same app at once.

## What I learned from the eval

`/eval` compares the agent's Notion guide with the hand-checked library guide, claim by claim (23 claims).

| Run | Matched | Wrong | Missed | What changed |
| --- | --- | --- | --- | --- |
| v1 | 13 | 4 | 6 | Original prompts. |
| v2 | 11 | 0 | 12 | Prompt fixes: difficulty order, duration-only time fields, no invented scopes, skip other-product pages. Wrong answers gone, but the main Authorization page returned 0 facts. |
| v3 | 10 | 0 | 13 | Narrowed the skip rule so OAuth pages are always read. The model now tried page 1 but reasoned past the 8,000-token output cap twice, so it still gave 0 facts. |

- **Quote checking works.** Across runs, 90%+ of extracted facts had quotes found word for word on the page, and no wrong claim came from a made-up fact.
- **Errors came from reading the wrong page and putting facts in the wrong field.** v1 turned Notion's *Workers* page (about Workers calling GitHub/Google) into setup steps, put an installation-scope warning in "time to production", and told readers to look up scopes Notion doesn't have.
- **Results vary between runs.** The same page gave 14, 0 and 10 facts across three Zoom runs, with the same model and prompt. One run is not a measurement.
- **What the prompt fixes changed.** The v2 fixes removed every wrong answer (4 → 0), and Zoom moved from Easy to Medium. Misses rose because the main OAuth page produced no facts: in v2 the skip rule was too broad; in v3, with the rule narrowed, the free model spent its whole output budget reasoning on that page. Fact IDs like "(F2)" are now stripped in code. The likely next fix is outside the prompt: give the longest page a larger output cap, or split it in two.

## Key decisions

*Draft.*

- **Why these 5 apps:** they cover every difficulty tier. GitHub has no review (Easy). Slack and Notion work right away and only review a marketplace listing (Medium). Gmail needs verification plus a paid security audit for its useful scopes (Hard). LinkedIn is a partner program that can say no (Gated). One of each shows how to read any generated guide.
- **Why one template:** every guide answers the same questions in the order a developer asks them: how long, what do I do, am I eligible, which scopes avoid review, what goes wrong, can I skip it. One JSON shape means library and generated guides render with the same component and can be compared on `/eval`.
- **Why evidence labels with verified quotes:** OAuth rules change and models make things up. Every fact is `Docs` (with a link to the exact page) or `Uncertain`, and `Tested` only comes from checks our code ran. For generated guides, the model must quote the page word for word and our code checks the quote is really there; if not, the fact is downgraded to `Uncertain`.
- **Why the agent reads but never signs in or submits:** signing in or submitting forms would mean handling someone's credentials, accepting terms for them, and possibly starting a real review. Reading public pages is safe and repeatable. Anything behind a login stays `Uncertain`.
- **Why we cut tokens from 337k to 25–36k per guide:** letting the model browse freely used about 337k tokens in one step. Now our code does the searching, picks 3 official pages, strips and trims them, and the model only reads that text. Input is about 8–9k tokens per guide; free reasoning models add most of the rest as thinking (live runs: Zoom 24.9k, Notion 35.7k), still under the 40k target and $0 on free models.
- **Why free OpenRouter models:** reviewers can run the app with no paid key. Gemini's free tier was refused for the projects we tried, and Groq's free tier hit daily limits. OpenRouter's free models, with 3 fallbacks per step, keep cost at $0; the trade-off is speed and a 50-requests/day limit, so generation is capped at 8 guides a day.

## Limitations

- **Model change:** the brief asked for Groq `groq/compound`. Groq's deprecations page lists it as decommissioned on 2026-09-21 with no replacement. An earlier version let `gpt-oss-120b` run `browser_search` freely, which used about 337k tokens in one stage. Retrieval now runs in our own code. Gemini was tried next, but its free tier was refused for the projects we tested (`403 free tier is not available`), so the default is now OpenRouter's free models, with Gemini and Groq selectable via `LLM_PROVIDER`.
- Free models spend part of their output budget on reasoning. In the first live Notion run (2026-10-28) all three extraction calls hit the 2,500-token output cap and the guide was written from no facts. The cap is now 8,000 for reasoning providers, and the agent refuses to write a guide when no facts were extracted. Later runs (Zoom, Notion) extracted 25–40 facts. Free models are also inconsistent: the same Zoom page gave 14, 0 and 10 facts across three runs.
- Pages rendered by JavaScript come back nearly empty when fetched as HTML and are skipped.
- Trimming is keyword-based, so a relevant section that doesn't use the expected words can be dropped.
- Quote verification proves a quote is on the page, not that the claim's paraphrase matches it.
- On OpenRouter `:free` models cost is $0. Free models can be slower, rate-limited at busy times, and change or disappear; the model lists are env-configurable. Free providers may log prompts, so only public docs text is sent.
- For Gemini/Groq, cost figures are paid-tier equivalents from published per-token prices and the token counts the API returns, with thinking tokens counted as output.
- Gemini's free tier is decided per Google Cloud project; some projects get `403 free tier is not available` and need billing linked at aistudio.google.com/billing. Free-tier rate limits are only listed in AI Studio, not the docs. Free-tier prompts may be used by Google to improve its products.
- Developer portals are usually behind login, so generated guides rarely have `Tested` fields.
- Review timelines are almost never official SLAs. Where only third-party or anecdotal numbers exist, they're marked as such.
- Generated guides aren't re-checked automatically. `lastChecked` shows their age.
- The rate limit is a fixed window per IP. It's a cost guard, not abuse-proof.
