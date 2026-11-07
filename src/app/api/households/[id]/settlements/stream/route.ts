import { getHousehold, getSettlements } from "@/lib/store";
import { checkHouseholdSettlements, ensureCheckpointStream, getWatcherState, tatumConfigured } from "@/lib/tatum";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events: pushes settlement updates to the household page.
 * While a client is connected we re-run the (cached, rate-limited) backfill
 * check every 8 seconds and emit an event whenever a settlement flips.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getHousehold(id)) return new Response("Household not found", { status: 404 });
  ensureCheckpointStream(id);

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      send("status", { tatumConfigured: tatumConfigured(), watcher: getWatcherState() });

      timer = setInterval(async () => {
        if (closed) return;
        const before = new Map(getSettlements(id).map((s) => [s.id, s.status]));
        const result = await checkHouseholdSettlements(id).catch(() => null);
        if (!result || closed) return;
        for (const settled of result.settled) {
          if (before.get(settled.settlementId) !== "settled") {
            send("settled", settled);
          }
        }
        send("heartbeat", { at: new Date().toISOString(), watcher: getWatcherState() });
      }, 8000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
