import { NextResponse } from "next/server";
import { getHousehold } from "@/lib/store";
import { rebuildAllFromMemories } from "@/lib/rebuild";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getHousehold(id)) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  try {
    const report = await rebuildAllFromMemories(id);
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: `Rebuild failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
