/**
 * Seed a demo household with 10+ memories.
 *
 * Usage:
 *   npx tsx scripts/seed-memories.ts <householdId>
 *
 * With MEMWAL_ACCOUNT_ID + MEMWAL_DELEGATE_KEY set, these are REAL Walrus
 * Memory writes on Mainnet (paced by the production write queue: remember
 * costs 5 points against a 60 points/minute account cap, so expect ~1 minute
 * for the full set). Without keys it runs against the local mock and the
 * output says SIMULATED — it never pretends to be mainnet.
 *
 * The seed tells one learning story: an equal-split household that corrects
 * groceries to 70/30, dining to 50/50 with a note, sets a general habit, and
 * records acceptances — enough for the split engine, Why panel, learning
 * chart and restart proof to all show real behaviour.
 */
import { getMemoryBackend, getMemoryQueue, householdNamespace } from "../src/lib/memory/client";
import { serializeMemory, type MemoryRecord } from "../src/lib/memory/serialize";

async function main() {
  const householdId = process.argv[2];
  if (!householdId) {
    console.error("Usage: npx tsx scripts/seed-memories.ts <householdId>");
    process.exit(1);
  }
  const backend = getMemoryBackend();
  console.log(`Backend: ${backend.mode}${backend.mode === "local-mock" ? " (SIMULATED — no Walrus keys configured)" : " (Walrus Memory, Mainnet)"}`);
  console.log(`Namespace: ${householdNamespace(householdId)}`);

  const records: MemoryRecord[] = [
    { kind: "household", householdId, fields: { name: "Demo Household", currency: "NGN", note: "seeded demo household" } },
    { kind: "member", householdId, fields: { name: "Ada", member: "seed-ada", sui: "0x" + "a".repeat(64) } },
    { kind: "member", householdId, fields: { name: "Ben", member: "seed-ben", sui: "0x" + "b".repeat(64) } },
    { kind: "correction", householdId, fields: { category: "groceries", weights: "Ada:70,Ben:30", expense: "seed-e1", note: "Ada buys most of the food, so groceries are 70/30" } },
    { kind: "rule", householdId, fields: { category: "groceries", weights: "Ada:70,Ben:30", source: "correction" } },
    { kind: "acceptance", householdId, fields: { category: "groceries", weights: "Ada:70,Ben:30", expense: "seed-e2" } },
    { kind: "acceptance", householdId, fields: { category: "groceries", weights: "Ada:70,Ben:30", expense: "seed-e3" } },
    { kind: "rule", householdId, fields: { category: "rent", weights: "Ada:50,Ben:50", source: "acceptance" } },
    { kind: "settlement_habit", householdId, fields: { category: "any", weights: "Ada:50,Ben:50", note: "default habit: split everything else evenly" } },
    { kind: "correction", householdId, fields: { category: "dining", weights: "Ada:50,Ben:50", expense: "seed-e4", note: "eating out is always 50/50 even though Ada orders more" } },
    { kind: "expense", householdId, fields: { expense: "seed-e5", description: "groceries", category: "groceries", amountMinor: "1200000", payer: "Ada", payerId: "seed-ada", weights: "Ada:70,Ben:30" } },
    { kind: "settlement_habit", householdId, fields: { category: "any", note: "household settles up at month end in USDC on Sui" } },
  ];

  const queue = getMemoryQueue();
  const results: { blobId: string }[] = [];
  for (const record of records) {
    const result = await queue.enqueue(record);
    results.push(result);
    console.log(`  ✓ ${record.kind.padEnd(16)} ${result.blobId}`);
  }
  await queue.drain();
  console.log(`Done: ${results.length} memories written for household ${householdId}.`);
  console.log(`Verify: open the household, log "groceries 12000 paid by Ada" — the proposal must come back 70/30 citing the correction memory (${serializeMemory(records[3]).slice(0, 60)}…).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
