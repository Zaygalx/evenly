import { NextResponse } from "next/server";
import { getHouseholdByInvite, getMembers } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const household = getHouseholdByInvite(token);
  if (!household) return NextResponse.json({ error: "This invite link is not valid." }, { status: 404 });
  return NextResponse.json({ household, members: getMembers(household.id) });
}
