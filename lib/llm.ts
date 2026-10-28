import { GoogleGenAI } from "@google/genai";
import Groq, { APIError, RateLimitError } from "groq-sdk";
import { estimateTokens } from "./retrieval/trim";
import type { ProgressEvent } from "./types";
import { stageUsage, type StageUsage } from "./usage";

// Two model steps: a cheap one per page (extract) and a stronger one for the final write.
// LLM_PROVIDER=openrouter (default), gemini or groq. Gemini and Groq are kept as fallbacks.
export type Provider = "openrouter" | "gemini" | "groq";
export type Role = "extract" | "write";
type Emit = (e: ProgressEvent) => void;

export const PROVIDER: Provider =
  process.env.LLM_PROVIDER === "groq" || process.env.LLM_PROVIDER === "gemini" ? process.env.LLM_PROVIDER : "openrouter";

const list = (v: string | undefined, fallback: string[]) =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : fallback;

// OpenRouter free models that support json_schema structured output (checked 2026-10-28 via /api/v1/models).
// Each role lists 3 in priority order; OpenRouter falls through to the next if one is rate-limited or down.
const OPENROUTER_MODELS: Record<Role, string[]> = {
  extract: list(process.env.OPENROUTER_EXTRACT_MODELS, [
    "nvidia/nemotron-3.5-super-vl:free",
    "xingchen-agi/xing4.0-29b-a4b:free",
    "dots-studio/dots-3-note-preview:free",
  ]),
  // dots-3-note-preview spent the whole 12k output budget reasoning on the Zoom write (2026-10-28), so it's last.
  write: list(process.env.OPENROUTER_WRITE_MODELS, [
    "nvidia/nemotron-3.5-super-vl:free",
    "xingchen-agi/xing4.0-29b-a4b:free",
    "dots-studio/dots-3-note-preview:free",
  ]),
};

const MODELS: Record<Provider, Record<Role, string>> = {
  openrouter: { extract: OPENROUTER_MODELS.extract[0], write: OPENROUTER_MODELS.write[0] },
  gemini: {
    extract: process.env.GEMINI_EXTRACT_MODEL ?? "gemini-3.5-flash-lite",
    write: process.env.GEMINI_WRITE_MODEL ?? "gemini-3.8-flash",
  },
  groq: {
    extract: process.env.GROQ_EXTRACT_MODEL ?? "openai/gpt-oss-20b",
    write: process.env.GROQ_WRITE_MODEL ?? "openai/gpt-oss-120b",
  },
};

export const modelFor = (role: Role) => MODELS[PROVIDER][role];

/** Env vars live generation needs for the selected provider. */
const KEY_ENV: Record<Provider, string> = { openrouter: "OPENROUTER_API_KEY", gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY" };
export const requiredEnv = () => [KEY_ENV[PROVIDER], "TAVILY_API_KEY"];

export interface JsonRequest {
  stage: string;
  role: Role;
  system: string;
  input: string;
  schema: Record<string, unknown>;
  maxOutput: number;
}

export interface JsonResult {
  /** Parsed JSON, or null when the output was cut off or empty. */
  json: unknown | null;
  usage: StageUsage;
}

/** Thrown for limits a wait won't fix (daily quota, no free tier). The run stops and nothing is saved. */
export class QuotaError extends Error {}

export interface Session {
  generateJson(req: JsonRequest): Promise<JsonResult>;
  /** Largest per-minute token budget seen so far, if the provider reports one. */
  perMinuteLimit: number | null;
}

export function createSession(emit: Emit): Session {
  if (PROVIDER === "groq") return new GroqSession(emit);
  if (PROVIDER === "gemini") return new GeminiSession(emit);
  return new OpenRouterSession(emit);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- OpenRouter

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MAX_ATTEMPTS = 4;

interface OpenRouterResponse {
  model?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { code?: number; message?: string; metadata?: Record<string, unknown> };
}

class OpenRouterSession implements Session {
  perMinuteLimit = null;
  private key: string;

  constructor(private emit: Emit) {
    if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
    this.key = process.env.OPENROUTER_API_KEY.trim();
  }

  async generateJson(req: JsonRequest): Promise<JsonResult> {
    let models = OPENROUTER_MODELS[req.role];
    let badReplies = 0;
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      let data: OpenRouterResponse;
      try {
        res = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.key}`,
            "Content-Type": "application/json",
            "X-OpenRouter-Title": "OAuth Pathfinder",
          },
          body: JSON.stringify({
            models, // fallback order; only :free models so a fallback never bills
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.input },
            ],
            response_format: { type: "json_schema", json_schema: { name: req.role, strict: true, schema: req.schema } },
            provider: { require_parameters: true }, // only route to endpoints that honour the JSON schema
            reasoning: { effort: "low", exclude: true },
            max_tokens: req.maxOutput,
          }),
          // Free reasoning models can take minutes on the write step; the timeout covers reading the body too.
          signal: AbortSignal.timeout(req.role === "write" ? 200_000 : 120_000),
        });
        data = (await res.json()) as OpenRouterResponse;
      } catch (err) {
        // A timeout or truncated body used to look like an empty reply (0 tokens). Retry on the next model instead.
        console.error("[llm] OpenRouter reply unreadable:", err instanceof Error ? err.message : err);
        if (attempt >= OPENROUTER_MAX_ATTEMPTS) {
          throw new Error("OpenRouter's free models didn't return a complete reply in time. No guide was saved.");
        }
        models = rotate(models);
        this.emit({ type: "stage", stage: "wait", message: `No complete reply; retrying with ${models[0]}` });
        continue;
      }
      // OpenRouter can report a failure inside a 200 body, so check both.
      const code = data.error ? (data.error.code ?? res.status) : res.status;

      if (res.ok && !data.error) {
        const model = data.model ?? models[0];
        const usage = stageUsage(req.stage, model, {
          input: data.usage?.prompt_tokens ?? 0,
          output: data.usage?.completion_tokens ?? 0,
        });
        const choice = data.choices?.[0];
        const content = choice?.message?.content ?? "";
        console.log(`[llm] ${req.stage} ${model} finish=${choice?.finish_reason} chars=${content.length}`);
        if (choice?.finish_reason === "length" && content) return { json: null, usage };
        try {
          return { json: JSON.parse(stripFences(content)), usage };
        } catch {
          // Empty (e.g. all output spent reasoning) or invalid JSON: try the next free model once before giving up.
          if (badReplies++ === 0 && models.length > 1) {
            models = rotate(models);
            this.emit({ type: "stage", stage: "wait", message: `${model} returned invalid JSON; retrying with ${models[0]}` });
            continue;
          }
          return { json: null, usage };
        }
      }

      const message = data.error?.message ?? `HTTP ${res.status}`;
      console.error("[llm] OpenRouter error", code, message.slice(0, 300), data.error?.metadata ?? "");
      if (code === 401) throw new QuotaError("OpenRouter rejected the API key (401). Check OPENROUTER_API_KEY.");
      if (code === 402) throw new QuotaError("OpenRouter says the account is out of credits (402). No guide was saved.");
      const retryable = code === 429 || code === 502 || code === 503;
      if (!retryable) throw new Error(`OpenRouter error ${code}: ${message}`);

      const wait = openRouterRetryMs(res.headers, attempt);
      if (wait === "daily") {
        throw new QuotaError("OpenRouter's free daily request limit is used up (resets at midnight UTC). No guide was saved.");
      }
      if (attempt >= OPENROUTER_MAX_ATTEMPTS) {
        throw new QuotaError("All free OpenRouter models are busy right now. Try again in a few minutes. No guide was saved.");
      }
      this.emit({
        type: "stage",
        stage: "wait",
        message: `Waiting ${Math.ceil(wait / 1000)}s: ${code === 429 ? "OpenRouter rate limit" : "free models busy"} (attempt ${attempt + 1} of ${OPENROUTER_MAX_ATTEMPTS})`,
      });
      await sleep(wait);
    }
  }
}

/** Wait before retrying, from Retry-After or X-RateLimit-Reset; "daily" when the reset is hours away. */
function openRouterRetryMs(headers: Headers, attempt: number): number | "daily" {
  const retryAfter = Number(headers.get("retry-after"));
  const resetAt = Number(headers.get("x-ratelimit-reset")); // epoch ms
  let ms = retryAfter > 0 ? retryAfter * 1000 : resetAt > 0 ? resetAt - Date.now() : 0;
  if (ms > 5 * 60_000 && headers.get("x-ratelimit-remaining") === "0") return "daily";
  if (ms <= 0) ms = 10_000 * 2 ** (attempt - 1);
  return Math.min(ms, 90_000) + Math.random() * 1000;
}

const rotate = (list: string[]) => [...list.slice(1), list[0]];

/** Some models wrap JSON in ```json fences even with a schema. */
function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

// ---------------------------------------------------------------- Gemini

const GEMINI_MAX_ATTEMPTS = 5;

class GeminiSession implements Session {
  perMinuteLimit = null;
  private ai: GoogleGenAI;

  constructor(private emit: Emit) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async generateJson(req: JsonRequest): Promise<JsonResult> {
    const model = modelFor(req.role);
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await this.ai.interactions.create(
          {
            model,
            input: req.input,
            system_instruction: req.system,
            response_format: { type: "text", mime_type: "application/json", schema: req.schema },
            generation_config: { thinking_level: "low", max_output_tokens: req.maxOutput },
          },
          // We handle 429s ourselves so the wait shows up in the progress feed.
          { retries: { strategy: "none" } },
        );
        const u = res.usage;
        const usage = stageUsage(req.stage, model, {
          input: u?.total_input_tokens ?? 0,
          // Thinking tokens are billed as output.
          output: (u?.total_output_tokens ?? 0) + (u?.total_thought_tokens ?? 0),
        });
        const text = res.output_text;
        if (res.status !== "completed" || !text) return { json: null, usage };
        return { json: JSON.parse(text), usage };
      } catch (err) {
        const wait = geminiRetryMs(err, attempt);
        if (wait === null) throw err;
        this.emit({
          type: "stage",
          stage: "wait",
          message: `Waiting ${Math.ceil(wait / 1000)}s for Gemini's rate limit (attempt ${attempt + 1} of ${GEMINI_MAX_ATTEMPTS})`,
        });
        await sleep(wait);
      }
    }
  }
}

/** How long to wait before retrying a Gemini error, or null to give up (throws a friendly error for hard limits). */
function geminiRetryMs(err: unknown, attempt: number): number | null {
  const e = err as { status?: number; statusCode?: number; message?: string; headers?: Headers | Record<string, string> };
  const status = e?.status ?? e?.statusCode;
  const message = String(e?.message ?? "");
  console.error("[llm] Gemini error", status, message.slice(0, 300));

  if (status === 403 && /free tier is not available/i.test(message)) {
    throw new QuotaError(
      "Gemini's free tier isn't available for this Google Cloud project. Link billing at aistudio.google.com/billing or use a key from an eligible project. No guide was saved.",
    );
  }
  if (status !== 429) return null;
  if (/quota_exceeded|per day|PerDay|daily/i.test(message)) {
    throw new QuotaError("Gemini daily quota reached (resets at midnight Pacific). No guide was saved.");
  }
  if (attempt >= GEMINI_MAX_ATTEMPTS) {
    throw new QuotaError("Gemini kept rate-limiting this run. Try again in a minute. No guide was saved.");
  }
  // Use the server's hint when there is one, otherwise exponential backoff with jitter.
  const header = e.headers instanceof Headers ? e.headers.get("retry-after") : e.headers?.["retry-after"];
  const hint = Number(header) || Number(message.match(/retry(?:Delay"?:\s*"?| in )([\d.]+)\s*s/i)?.[1]);
  const base = hint ? hint * 1000 : 10_000 * 2 ** (attempt - 1);
  return Math.min(base, 90_000) + Math.random() * 1000;
}

// ---------------------------------------------------------------- Groq (fallback)

/** Spaces calls by reading Groq's per-minute token headers, so the free tier (8k TPM) doesn't 429 mid-run. */
class GroqSession implements Session {
  private groq: Groq;
  private limit: number | null = null;
  private remaining: number | null = null;
  private resetAt = 0;

  constructor(private emit: Emit) {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 1 });
  }

  get perMinuteLimit() {
    return this.limit;
  }

  private update(headers: Headers) {
    const limit = Number(headers.get("x-ratelimit-limit-tokens"));
    const reset = parseDuration(headers.get("x-ratelimit-reset-tokens"));
    if (limit) this.limit = limit;
    if (headers.has("x-ratelimit-remaining-tokens")) this.remaining = Number(headers.get("x-ratelimit-remaining-tokens"));
    if (reset !== null) this.resetAt = Date.now() + reset;
  }

  private async waitFor(needed: number) {
    if (this.remaining === null || this.remaining >= needed) return;
    const waitMs = this.resetAt - Date.now() + 500;
    if (waitMs <= 0) return;
    this.emit({ type: "stage", stage: "wait", message: `Waiting ${Math.ceil(waitMs / 1000)}s for Groq's per-minute token limit` });
    await sleep(waitMs);
    this.remaining = null;
  }

  async generateJson(req: JsonRequest): Promise<JsonResult> {
    const model = modelFor(req.role);
    const needed = estimateTokens(req.system + req.input) + req.maxOutput;
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.waitFor(needed);
      try {
        const { data, response } = await this.groq.chat.completions
          .create({
            model,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.input },
            ],
            response_format: { type: "json_schema", json_schema: { name: req.role, strict: true, schema: req.schema } },
            reasoning_effort: "low",
            max_completion_tokens: req.maxOutput,
          })
          .withResponse();
        this.update(response.headers);
        const usage = stageUsage(req.stage, model, {
          input: data.usage?.prompt_tokens ?? 0,
          output: data.usage?.completion_tokens ?? 0,
        });
        const choice = data.choices[0];
        if (choice?.finish_reason === "length" || !choice?.message?.content) return { json: null, usage };
        return { json: JSON.parse(choice.message.content), usage };
      } catch (err) {
        if (err instanceof RateLimitError) {
          console.error("[llm] Groq rate limit:", err.message);
          if (/per day|TPD/i.test(err.message)) {
            const wait = err.message.match(/try again in ((?:\d+h)?(?:\d+m)?[\d.]+s)/i)?.[1]?.replace(/\.\d+s$/, "s");
            throw new QuotaError(`Groq daily token limit reached${wait ? ` (try again in ${wait})` : ""}. No guide was saved.`);
          }
          const retryAfter = Number(err.headers?.get("retry-after") ?? 30);
          if (attempt === 0 && retryAfter <= 70) {
            this.emit({ type: "stage", stage: "wait", message: `Waiting ${retryAfter}s for Groq's per-minute token limit` });
            await sleep(retryAfter * 1000 + 500);
            continue;
          }
        }
        if (err instanceof APIError && err.status === 413) {
          throw new QuotaError(
            "This request is larger than your Groq tier's per-minute token limit. Lower PAGE_TOKEN_CAP or upgrade to Dev Tier.",
          );
        }
        throw err;
      }
    }
    throw new QuotaError("Groq kept rate-limiting this run. Try again in a minute.");
  }
}

/** Parses Groq durations like "59.69s", "1m26.4s", "120ms". */
function parseDuration(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:([\d.]+)ms)?$/);
  if (!m) return null;
  return ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000 + Number(m[4] ?? 0);
}
