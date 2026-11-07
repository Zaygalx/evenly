import { NextResponse } from "next/server";
import { ensureHousehold } from "@/lib/hydrate";
import { getExpense, getHousehold, getMembers, recordDecision, setExpenseShares } from "@/lib/store";
import { rememberInBackground } from "@/lib/memory/background";
import { sharesToWeights } from "@/lib/splitEngine";
import { weightsToString } from "@/lib/memory/serialize";

/**
 * Accept or correct a proposed split.
 *
 * Both outcomes are memories:
 * - accept  -> kind=acceptance (+ a kind=rule derived from the accepted shares,
 *   so the next proposal for this category can use it)
 * - correct -> kind=correction (+ a kind=rule with the corrected weights,
 *   which outranks older rules in the split engine)
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; expenseId: string }> }) {
  const { id, expenseId } = await ctx.params;
  await ensureHousehold(id);
  const household = getHousehold(id);
  if (!household) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  const expense = getExpense(expenseId);
  if (!expense || expense.householdId !== id) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
  if (expense.status !== "proposed") return NextResponse.json({ error: "This split was already decided." }, { status: 409 });

  let body: { action?: string; shares?: { memberId: string; amountMinor: number }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const members = getMembers(id).filter((m) => !m.revokedAt);

  if (body.action === "accept") {
    setExpenseShares(expenseId, expense.shares, "accepted");
    recordDecision(id, expenseId, "accepted", false);
    if (household.memoryEnabled) {
      const weights = weightsToString(sharesToWeights(expense.shares, members));
      rememberInBackground([
        { kind: "acceptance", householdId: id, fields: { expense: expenseId, category: expense.category, weights } },
        { kind: "rule", householdId: id, fields: { category: expense.category, weights, source: "acceptance" } },
      ]);
    }
    return NextResponse.json({ expense: getExpense(expenseId) });
  }

  if (body.action === "correct") {
    const shares = body.shares ?? [];
    const memberIds = new Set(members.map((m) => m.id));
    const total = shares.reduce((s, x) => s + x.amountMinor, 0);
    if (shares.length === 0 || shares.some((s) => !memberIds.has(s.memberId) || s.amountMinor < 0)) {
      return NextResponse.json({ error: "Shares must cover household members with non-negative amounts." }, { status: 400 });
    }
    if (total !== expense.amountMinor) {
      return NextResponse.json({ error: `Shares must add up to the expense total. They add up to ${total} but the expense is ${expense.amountMinor}.` }, { status: 400 });
    }
    setExpenseShares(expenseId, shares, "corrected");
    recordDecision(id, expenseId, "corrected", true);
    if (household.memoryEnabled) {
      const weights = weightsToString(sharesToWeights(shares, members));
      rememberInBackground([
        { kind: "correction", householdId: id, fields: { expense: expenseId, category: expense.category, weights } },
        { kind: "rule", householdId: id, fields: { category: expense.category, weights, source: "correction" } },
      ]);
    }
    return NextResponse.json({ expense: getExpense(expenseId) });
  }

  return NextResponse.json({ error: "Action must be \"accept\" or \"correct\"." }, { status: 400 });
}

// Memory writes continue after the response via after(); give them room to land.
export const maxDuration = 60;
