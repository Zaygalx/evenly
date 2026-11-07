import { NextResponse } from "next/server";
import { addExpense, getHousehold, getMembers } from "@/lib/store";
import { parseExpenseLine } from "@/lib/parser";
import { recallRecords, rememberRecord } from "@/lib/memory/client";
import { serializeMemory, type MemoryRecord } from "@/lib/memory/serialize";
import { proposeSplit, sharesToWeights } from "@/lib/splitEngine";
import { weightsToString } from "@/lib/memory/serialize";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const household = getHousehold(id);
  if (!household) return NextResponse.json({ error: "Household not found." }, { status: 404 });
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

  // Phase 2: recall the household's memories and let the split engine propose.
  let memories: { record: MemoryRecord; blobId: string; text: string }[] = [];
  if (household.memoryEnabled) {
    try {
      const recalled = await recallRecords(id, `split rule correction ${parsed.category} ${parsed.description}`, 25);
      memories = recalled.map((r) => ({
        record: r.record,
        blobId: r.blobId,
        text: serializeMemory(r.record),
      }));
    } catch (err) {
      console.error("[evenly] recall failed, falling back to equal split:", err);
    }
  }

  const proposal = proposeSplit({
    amountMinor: parsed.amountMinor,
    category: parsed.category,
    members,
    memories,
    memoryEnabled: household.memoryEnabled,
  });

  const expense = addExpense({
    householdId: id,
    rawText: text,
    description: parsed.description,
    category: parsed.category,
    amountMinor: parsed.amountMinor,
    paidByMemberId: parsed.paidByMemberId,
    shares: proposal.shares,
    proposal: {
      explanation: proposal.explanation,
      usedMemories: proposal.usedMemories,
      memoryApplied: proposal.memoryApplied,
    },
  });

  // The expense itself becomes a memory (write-through for the restart proof).
  const payer = members.find((m) => m.id === parsed.paidByMemberId);
  void rememberRecord({
    kind: "expense",
    householdId: id,
    fields: {
      expense: expense.id,
      description: parsed.description,
      category: parsed.category,
      amountMinor: String(parsed.amountMinor),
      payer: payer?.name ?? "",
      payerId: parsed.paidByMemberId,
      weights: weightsToString(sharesToWeights(proposal.shares, members)),
      createdAt: expense.createdAt,
      raw: text,
    },
  });

  return NextResponse.json({ expense, parsed }, { status: 201 });
}
