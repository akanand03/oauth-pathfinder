import { PROVIDER } from "./llm";
import { incrWindow } from "./store";

const PER_IP_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR ?? 3);
// OpenRouter's free models allow 50 requests/day per account. A guide makes 4 calls (3 extract + 1 write)
// plus any retries, so 8 guides/day leaves headroom.
const GLOBAL_PER_DAY = Number(process.env.GLOBAL_DAILY_LIMIT ?? (PROVIDER === "openrouter" ? 8 : 30));

export interface RateLimitResult {
  ok: boolean;
  reason?: string;
}

/** Only called when a guide actually needs generating; cached/library hits are free. */
export async function checkGenerateLimit(ip: string): Promise<RateLimitResult> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const day = Math.floor(Date.now() / 86_400_000);
  const ipCount = await incrWindow(`rl:ip:${ip}:${hour}`, 3600);
  if (ipCount > PER_IP_PER_HOUR) {
    return { ok: false, reason: `Rate limit: ${PER_IP_PER_HOUR} new guides per hour per visitor. Try again later.` };
  }
  const globalCount = await incrWindow(`rl:global:${day}`, 86400);
  if (globalCount > GLOBAL_PER_DAY) {
    return {
      ok: false,
      reason: `Today's ${GLOBAL_PER_DAY} new guide${GLOBAL_PER_DAY === 1 ? "" : "s"} for this demo ${GLOBAL_PER_DAY === 1 ? "is" : "are"} used up; it resets at midnight UTC. The library and all saved guides still work.`,
    };
  }
  return { ok: true };
}
