import { NextResponse } from "next/server";
import { getHousehold } from "@/lib/store";
import { getMemoryBackend, listAllRecords } from "@/lib/memory/client";
import { serializeMemory } from "@/lib/memory/serialize";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getHousehold(id)) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  const backend = getMemoryBackend();
  const records = await listAllRecords(id);
  return NextResponse.json({
    mode: backend.mode, // "walrus" (real) or "local-mock" (SIMULATED — labelled in the UI)
    memories: records.map((r) => ({
      kind: r.record.kind,
      text: serializeMemory(r.record),
      blobId: r.blobId,
      createdAt: r.createdAt ?? null,
    })),
  });
}
