import { NextResponse } from "next/server";
import { ensureHousehold } from "@/lib/hydrate";
import { addSettlement, computeBalances, getHousehold } from "@/lib/store";
import { displayToUsdcMinor, suggestSettlements } from "@/lib/settlement";
import { ensureCheckpointStream } from "@/lib/tatum";
import { rememberInBackground } from "@/lib/memory/background";
import { getMembers } from "@/lib/store";

/**
 * Create pending settlements from the household's current balances.
 * The household must first set its display-per-USDC rate (PATCH household),
 * because converting e.g. NGN balances into a USDC amount needs a rate the
 * household itself stands behind — Evenly never invents an FX rate.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await ensureHousehold(id);
  const household = getHousehold(id);
  if (!household) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  if (!household.displayPerUsdcMinor) {
    return NextResponse.json(
      { error: `Set your ${household.currency}-per-USDC rate first, so settlement amounts in USDC are honest.` },
      { status: 400 },
    );
  }
  const pairs = suggestSettlements(computeBalances(id));
  if (pairs.length === 0) return NextResponse.json({ settlements: [], note: "Everyone is settled up already." });
  const settlements = pairs.map((pair) =>
    addSettlement({
      householdId: id,
      fromMemberId: pair.fromMemberId,
      toMemberId: pair.toMemberId,
      amountUsdcMinor: displayToUsdcMinor(pair.displayMinor, household.displayPerUsdcMinor as number),
    }),
  );
  // A settlement is a promise the household made; like everything else it
  // belongs in Walrus Memory from the moment it exists. Without this, a
  // pending settlement lived only in the creating instance's local store
  // and no other instance could ever see it, match its transfer or flip it.
  const members = getMembers(id);
  rememberInBackground(
    settlements.map((s) => ({
      kind: "settlement" as const,
      householdId: id,
      fields: {
        settlement: s.id,
        from: members.find((m) => m.id === s.fromMemberId)?.name ?? s.fromMemberId,
        to: members.find((m) => m.id === s.toMemberId)?.name ?? s.toMemberId,
        amountUsdcMinor: String(s.amountUsdcMinor),
        status: "pending",
      },
    })),
  );
  ensureCheckpointStream(id);
  return NextResponse.json({ settlements }, { status: 201 });
}
