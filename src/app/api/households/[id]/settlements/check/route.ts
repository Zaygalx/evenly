import { NextResponse } from "next/server";
import { getHousehold } from "@/lib/store";
import { checkHouseholdSettlements, ensureCheckpointStream, getWatcherState, simulatedTransferFor, tatumConfigured } from "@/lib/tatum";
import { getMemoryBackend } from "@/lib/memory/client";

/**
 * Run one settlement check now.
 *
 * - With a Tatum key: polling backfill over recent transactions to each
 *   creditor (the checkpoint stream also runs server-side and feeds the
 *   same matcher).
 * - Without a key: nothing can be verified on-chain, and we say so. The only
 *   exception is an explicitly simulated transfer in local-mock mode, which
 *   is labelled simulated in the response and in the settlement memory.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getHousehold(id)) return NextResponse.json({ error: "Household not found." }, { status: 404 });
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
      : "No Tatum API key configured — on-chain transfers cannot be detected yet. Add TATUM_API_KEY to enable live settlement.",
  });
}
