import { NextResponse } from "next/server";
import { computeBalances, getDecisions, getExpenses, getHousehold, getMembers, getSettlements, setDisplayPerUsdc, setMemoryEnabled } from "@/lib/store";
import { getMemoryBackend } from "@/lib/memory/client";
import { ensureHousehold } from "@/lib/hydrate";
import { rememberInBackground } from "@/lib/memory/background";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await ensureHousehold(id))) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  const household = getHousehold(id)!;
  return NextResponse.json({
    household,
    members: getMembers(id),
    expenses: getExpenses(id),
    balances: computeBalances(id),
    decisions: getDecisions(id),
    settlements: getSettlements(id),
    memoryMode: getMemoryBackend().mode,
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await ensureHousehold(id))) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  let body: { memoryEnabled?: boolean; displayPerUsdcMinor?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.memoryEnabled === "boolean") setMemoryEnabled(id, body.memoryEnabled);
  if (typeof body.displayPerUsdcMinor === "number" && body.displayPerUsdcMinor > 0) {
    setDisplayPerUsdc(id, Math.round(body.displayPerUsdcMinor));
  }
  const updated = getHousehold(id)!;
  if (typeof body.memoryEnabled === "boolean" || typeof body.displayPerUsdcMinor === "number") {
    // Household settings are state too: persist a fresh household record
    // carrying the full current settings, so a cold instance rebuilds the
    // rate and the memory switch exactly as the household left them.
    // Rebuilders take the latest household record.
    rememberInBackground([
      {
        kind: "household",
        householdId: id,
        fields: {
          name: updated.name,
          currency: updated.currency,
          invite: updated.inviteToken,
          createdAt: updated.createdAt,
          memoryEnabled: String(updated.memoryEnabled),
          ...(updated.displayPerUsdcMinor ? { rate: String(updated.displayPerUsdcMinor) } : {}),
        },
      },
    ]);
  }
  return NextResponse.json({ household: updated });
}
