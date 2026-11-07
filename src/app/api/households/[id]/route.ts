import { NextResponse } from "next/server";
import { computeBalances, getDecisions, getExpenses, getHousehold, getMembers, getSettlements, setDisplayPerUsdc, setMemoryEnabled } from "@/lib/store";
import { getMemoryBackend } from "@/lib/memory/client";
import { ensureHousehold } from "@/lib/hydrate";

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
  return NextResponse.json({ household: getHousehold(id) });
}
