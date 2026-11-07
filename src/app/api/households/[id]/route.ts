import { NextResponse } from "next/server";
import { computeBalances, getExpenses, getHousehold, getMembers } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = getHousehold(id);
  if (!household) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  return NextResponse.json({
    household,
    members: getMembers(id),
    expenses: getExpenses(id),
    balances: computeBalances(id),
  });
}
