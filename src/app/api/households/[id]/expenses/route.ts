import { NextResponse } from "next/server";
import { addExpense, getHousehold, getMembers } from "@/lib/store";
import { parseExpenseLine } from "@/lib/parser";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getHousehold(id)) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Type an expense line first." }, { status: 400 });

  const members = getMembers(id).filter((m) => !m.revokedAt);
  if (members.length === 0) return NextResponse.json({ error: "This household has no active members yet." }, { status: 400 });

  const parsed = parseExpenseLine(text, members);
  if (!parsed.ok || parsed.amountMinor === null || !parsed.paidByMemberId) {
    return NextResponse.json({ error: parsed.errors.join(" ") || "Could not read that line.", parsed }, { status: 422 });
  }
  const expense = addExpense({
    householdId: id,
    rawText: text,
    description: parsed.description,
    category: parsed.category,
    amountMinor: parsed.amountMinor,
    paidByMemberId: parsed.paidByMemberId,
  });
  return NextResponse.json({ expense, parsed }, { status: 201 });
}
