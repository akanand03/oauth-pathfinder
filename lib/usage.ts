// Paid-tier prices per 1M tokens (checked 2026-10-28). OpenRouter ":free" models cost $0 and aren't listed here.
// On Gemini's free tier the real cost is also $0;
// we still show the paid-equivalent so the number means something after upgrading.
// Gemini: https://ai.google.dev/gemini-api/docs/pricing (3.8 Flash launch price through 2026-12-31; output includes thinking).
// Groq: https://console.groq.com/docs/models
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "openai/gpt-oss-20b": { input: 0.075, output: 0.3 },
  "openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
};

export interface StageUsage {
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface GuideUsage {
  stages: StageUsage[];
  totalTokens: number;
  estimatedCostUsd: number;
  searches: number;
  pagesFetched: number;
  pagesFromCache: number;
}

export function stageUsage(stage: string, model: string, usage: { input: number; output: number }): StageUsage {
  const inputTokens = usage.input;
  const outputTokens = usage.output;
  const price = PRICES[model];
  const costUsd = price ? (inputTokens * price.input + outputTokens * price.output) / 1_000_000 : 0;
  return { stage, model, inputTokens, outputTokens, costUsd };
}

export function formatUsd(n: number): string {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}
