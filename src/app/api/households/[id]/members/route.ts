import { NextResponse } from "next/server";
import { addMember, getHousehold, getMembers, isValidSuiAddress } from "@/lib/store";
import { rememberRecord } from "@/lib/memory/client";

const MAX_MEMBERS = 20; // matches the Walrus Memory delegate-key cap designed for Phase 4

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getHousehold(id)) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  if (getMembers(id).length >= MAX_MEMBERS) {
    return NextResponse.json({ error: "This household is full (20 members max)." }, { status: 400 });
  }
  let body: { name?: string; suiAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const suiAddress = (body.suiAddress ?? "").trim();
  if (!name) return NextResponse.json({ error: "Add the member's name." }, { status: 400 });
  if (!isValidSuiAddress(suiAddress)) {
    return NextResponse.json({ error: "That Sui address looks wrong. It should be 0x followed by 64 hex characters." }, { status: 400 });
  }
  const member = addMember(id, name, suiAddress);
  void rememberRecord({ kind: "member", householdId: id, fields: { name: member.name, sui: member.suiAddress, member: member.id } });
  return NextResponse.json({ member }, { status: 201 });
}
