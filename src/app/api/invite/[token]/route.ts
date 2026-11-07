import { NextResponse } from "next/server";
import { getHouseholdByInvite, getMembers } from "@/lib/store";
import { ensureHousehold } from "@/lib/hydrate";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  // Invite links carry ?h=<householdId> so a cold serverless instance can
  // hydrate the household from Walrus Memory before resolving the token.
  const hint = new URL(req.url).searchParams.get("h");
  if (hint) await ensureHousehold(hint);
  const household = getHouseholdByInvite(token);
  if (!household) return NextResponse.json({ error: "This invite link is not valid." }, { status: 404 });
  return NextResponse.json({ household, members: getMembers(household.id) });
}
