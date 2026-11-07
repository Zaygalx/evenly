import { NextResponse } from "next/server";
import { createHousehold, isValidSuiAddress } from "@/lib/store";
import { rememberInBackground } from "@/lib/memory/background";

export async function POST(req: Request) {
  let body: { name?: string; currency?: string; creatorName?: string; creatorSuiAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const creatorName = (body.creatorName ?? "").trim();
  const creatorSuiAddress = (body.creatorSuiAddress ?? "").trim();
  if (!name) return NextResponse.json({ error: "Give your household a name." }, { status: 400 });
  if (!creatorName) return NextResponse.json({ error: "Add your name." }, { status: 400 });
  if (!isValidSuiAddress(creatorSuiAddress)) {
    return NextResponse.json({ error: "That Sui address looks wrong. It should be 0x followed by 64 hex characters." }, { status: 400 });
  }
  const { household, creator } = createHousehold(name, (body.currency ?? "NGN").toUpperCase(), creatorName, creatorSuiAddress);
  // Write-through to memory: the household and its first member become
  // memories immediately, so a restart can rebuild from memory alone.
  rememberInBackground([
    { kind: "household", householdId: household.id, fields: { name: household.name, currency: household.currency, invite: household.inviteToken, createdAt: household.createdAt } },
    { kind: "member", householdId: household.id, fields: { name: creator.name, sui: creator.suiAddress, member: creator.id } },
  ]);
  return NextResponse.json({ household, member: creator }, { status: 201 });
}

// Memory writes continue after the response via after(); give them room to land.
export const maxDuration = 60;
