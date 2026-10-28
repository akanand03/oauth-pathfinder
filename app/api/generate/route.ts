import { runAgent } from "@/lib/agent";
import { librarySlugFor } from "@/lib/library";
import { requiredEnv } from "@/lib/llm";
import { checkGenerateLimit } from "@/lib/ratelimit";
import { parseQuery } from "@/lib/slug";
import { acquireLock, getGuide, isLocked, releaseLock, saveGuide } from "@/lib/store";
import type { ProgressEvent } from "@/lib/types";

export const maxDuration = 300;

// GET so the browser can use EventSource. Generation is gated by cache, lock and rate limit.
export async function GET(req: Request) {
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
      if (await getGuide(slug)) {
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
          if (await getGuide(slug)) {
            emit({ type: "done", slug });
            return finish();
          }
          if (!(await isLocked(slug))) {
            emit({ type: "error", message: "The other run finished without a guide. Try again." });
            return finish();
          }
        }
        emit({ type: "error", message: "Timed out waiting for the other run. Try again shortly." });
        return finish();
      }

      try {
        const guide = await runAgent({ ...q, slug }, emit);
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
