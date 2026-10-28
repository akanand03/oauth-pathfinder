import { runAgent } from "@/lib/agent";
import { librarySlugFor } from "@/lib/library";
import { requiredEnv } from "@/lib/llm";
import { checkGenerateLimit } from "@/lib/ratelimit";
import { parseQuery } from "@/lib/slug";
import { acquireLock, getGuide, isLocked, releaseLock, saveGuide } from "@/lib/store";
import type { ProgressEvent } from "@/lib/types";

// Vercel Hobby with Fluid compute caps functions at 300s. Free-model runs have taken up to ~340s,
// so the agent stops 25s early and saves what it has as a partial guide.
export const maxDuration = 300;
const SAVE_MARGIN_MS = 25_000;

// GET so the browser can use EventSource. Generation is gated by cache, lock and rate limit.
export async function GET(req: Request) {
  const deadline = Date.now() + maxDuration * 1000 - SAVE_MARGIN_MS;
  const q = parseQuery(new URL(req.url).searchParams.get("q") ?? "");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      // The client may disconnect mid-run; keep researching so the result is still cached.
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const emit = (e: ProgressEvent) => send(`data: ${JSON.stringify(e)}\n\n`);
      const keepAlive = setInterval(() => send(": ping\n\n"), 15_000);
      const finish = () => {
        clearInterval(keepAlive);
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by client */
        }
      };

      if (!q) {
        emit({ type: "error", message: "Enter an app name or website (letters, numbers, dots, dashes)." });
        return finish();
      }

      const slug = librarySlugFor(q.slug) ?? q.slug;
      // A partial guide (time limit hit) can be regenerated; a full one is served from the cache.
      const existing = await getGuide(slug);
      if (existing && !existing.partial) {
        emit({ type: "found", message: "Guide already exists, opening it." });
        emit({ type: "done", slug });
        return finish();
      }

      const missing = requiredEnv().filter((k) => !process.env[k]);
      if (missing.length > 0) {
        emit({ type: "error", message: `Live generation isn't configured on this deployment (${missing.join(", ")} missing).` });
        return finish();
      }

      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
      const limit = await checkGenerateLimit(ip);
      if (!limit.ok) {
        emit({ type: "error", message: limit.reason! });
        return finish();
      }

      if (!(await acquireLock(slug))) {
        emit({ type: "stage", stage: "wait", message: "Someone else is researching this app. Waiting for their result…" });
        for (let i = 0; i < 90 && !closed; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const done = await getGuide(slug);
          if (done && !done.partial) {
            emit({ type: "done", slug });
            return finish();
          }
          if (!(await isLocked(slug))) {
            // The other run ended: show its result (possibly partial), or report that it saved nothing.
            if (done) emit({ type: "done", slug });
            else emit({ type: "error", message: "The other run finished without a guide. Try again." });
            return finish();
          }
        }
        emit({ type: "error", message: "Timed out waiting for the other run. Try again shortly." });
        return finish();
      }

      try {
        const guide = await runAgent({ ...q, slug }, emit, deadline);
        await saveGuide(guide);
        emit({ type: "done", slug });
      } catch (err) {
        console.error("generate failed", err);
        emit({ type: "error", message: err instanceof Error ? err.message : "Generation failed" });
      } finally {
        await releaseLock(slug);
        finish();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
