import { NextResponse } from "next/server";
import { ensureHousehold } from "@/lib/hydrate";
import { getHousehold } from "@/lib/store";
import { checkHouseholdSettlements, ensureCheckpointStream, getWatcherState, simulatedTransferFor, tatumConfigured } from "@/lib/tatum";
import { getMemoryBackend } from "@/lib/memory/client";

/**
 * Run one settlement check now.
 *
 * - Detection: polling backfill over recent transactions affecting each
 *   creditor, read from the public Sui GraphQL indexer (the JSON-RPC query
 *   API was retired). With a Tatum key the checkpoint stream also runs
 *   server-side and feeds the same matcher.
 * - The only simulated path is an explicitly simulated transfer in
 *   local-mock mode, labelled simulated in the response and in the
 *   settlement memory.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await ensureHousehold(id))) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  let body: { simulate?: boolean } = {};
  try {
    body = (await req.json()) as { simulate?: boolean };
  } catch {
    /* empty body is fine */
  }

  if (body.simulate) {
    if (getMemoryBackend().mode !== "local-mock") {
      return NextResponse.json({ error: "Simulation is only available in local demo mode." }, { status: 400 });
    }
    const transfer = simulatedTransferFor(id);
    if (!transfer) return NextResponse.json({ error: "No pending settlement to simulate." }, { status: 400 });
    const result = await checkHouseholdSettlements(id, [transfer], true);
    return NextResponse.json({ ...result, simulated: true, watcher: getWatcherState() });
  }

  ensureCheckpointStream(id);
  const result = await checkHouseholdSettlements(id);
  return NextResponse.json({
    ...result,
    simulated: false,
    tatumConfigured: tatumConfigured(),
    watcher: getWatcherState(),
    note: tatumConfigured()
      ? undefined
      : "No Tatum API key configured, so the live checkpoint stream is off. This check used the public Sui indexer backfill.",
  });
}
