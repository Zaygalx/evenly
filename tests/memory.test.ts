import { describe, expect, it } from "vitest";
import { dedupeKey, parseMemory, parseWeights, serializeMemory, weightsToString } from "../src/lib/memory/serialize";
import { proposeSplit, sharesToWeights, weightedShares } from "../src/lib/splitEngine";
import type { MemoryRecord } from "../src/lib/memory/serialize";

describe("memory serialisation", () => {
  it("round-trips a rule with spaces in names and notes", () => {
    const record: MemoryRecord = {
      kind: "rule",
      householdId: "hh-1",
      fields: { category: "groceries", weights: "Ada Lovelace:70,Ben:30", note: "Ada buys most food" },
    };
    const text = serializeMemory(record);
    expect(text.startsWith("EVENLY/1 ")).toBe(true);
    expect(parseMemory(text)).toEqual(record);
  });

  it("rejects foreign text", () => {
    expect(parseMemory("User prefers dark mode")).toBeNull();
    expect(parseMemory("EVENLY/1 kind=bogus household=x")).toBeNull();
    expect(parseMemory("EVENLY/1 kind=rule")).toBeNull();
  });

  it("dedupe key is stable regardless of field order", () => {
    const a: MemoryRecord = { kind: "rule", householdId: "h", fields: { category: "rent", weights: "Ada:50,Ben:50" } };
    const b: MemoryRecord = { kind: "rule", householdId: "h", fields: { weights: "Ada:50,Ben:50", category: "rent" } };
    expect(dedupeKey(a)).toBe(dedupeKey(b));
    const c: MemoryRecord = { kind: "rule", householdId: "h", fields: { category: "rent", weights: "Ada:60,Ben:40" } };
    expect(dedupeKey(c)).not.toBe(dedupeKey(a));
  });

  it("weights round-trip", () => {
    expect(weightsToString({ Ben: 30, Ada: 70 })).toBe("Ada:70,Ben:30");
    expect(parseWeights("Ada:70,Ben:30")).toEqual({ Ada: 70, Ben: 30 });
    expect(parseWeights("nonsense")).toBeNull();
    expect(parseWeights(undefined)).toBeNull();
  });
});

const members = [
  { id: "m-ada", name: "Ada" },
  { id: "m-ben", name: "Ben" },
];

function mem(kind: MemoryRecord["kind"], fields: Record<string, string>, blobId = "blob-1") {
  const record: MemoryRecord = { kind, householdId: "hh-1", fields };
  return { record, blobId, text: serializeMemory(record) };
}

describe("split engine", () => {
  it("memory off always gives an equal split with an honest explanation", () => {
    const p = proposeSplit({ amountMinor: 10000, category: "groceries", members, memories: [mem("rule", { category: "groceries", weights: "Ada:90,Ben:10" })], memoryEnabled: false });
    expect(p.memoryApplied).toBe(false);
    expect(p.shares).toEqual([
      { memberId: "m-ada", amountMinor: 5000 },
      { memberId: "m-ben", amountMinor: 5000 },
    ]);
    expect(p.explanation).toMatch(/OFF/);
  });

  it("no memory yet gives an equal split that invites learning", () => {
    const p = proposeSplit({ amountMinor: 9999, category: "groceries", members, memories: [], memoryEnabled: true });
    expect(p.memoryApplied).toBe(false);
    expect(p.shares.reduce((s, x) => s + x.amountMinor, 0)).toBe(9999);
    expect(p.explanation).toMatch(/No remembered rule/);
  });

  it("a category rule drives the split and is cited", () => {
    const p = proposeSplit({ amountMinor: 10000, category: "groceries", members, memories: [mem("rule", { category: "groceries", weights: "Ada:70,Ben:30" }, "blob-rule")], memoryEnabled: true });
    expect(p.memoryApplied).toBe(true);
    expect(p.shares).toEqual([
      { memberId: "m-ada", amountMinor: 7000 },
      { memberId: "m-ben", amountMinor: 3000 },
    ]);
    expect(p.usedMemories[0].blobId).toBe("blob-rule");
  });

  it("a correction outranks an older rule for the same category", () => {
    const memories = [
      mem("rule", { category: "groceries", weights: "Ada:70,Ben:30" }, "blob-old"),
      mem("correction", { category: "groceries", weights: "Ada:50,Ben:50" }, "blob-fix"),
    ];
    const p = proposeSplit({ amountMinor: 10000, category: "groceries", members, memories, memoryEnabled: true });
    expect(p.shares[0].amountMinor).toBe(5000);
    expect(p.usedMemories[0].blobId).toBe("blob-fix");
  });

  it("a general habit applies when no category rule exists", () => {
    const p = proposeSplit({ amountMinor: 8000, category: "dining", members, memories: [mem("settlement_habit", { category: "any", weights: "Ada:25,Ben:75" })], memoryEnabled: true });
    expect(p.memoryApplied).toBe(true);
    expect(p.shares).toEqual([
      { memberId: "m-ada", amountMinor: 2000 },
      { memberId: "m-ben", amountMinor: 6000 },
    ]);
  });

  it("rules for other categories are ignored", () => {
    const p = proposeSplit({ amountMinor: 8000, category: "dining", members, memories: [mem("rule", { category: "rent", weights: "Ada:25,Ben:75" })], memoryEnabled: true });
    expect(p.memoryApplied).toBe(false);
  });

  it("weighted shares always sum exactly (largest remainder)", () => {
    const shares = weightedShares(101, [
      { memberId: "a", weight: 1 },
      { memberId: "b", weight: 1 },
      { memberId: "c", weight: 1 },
    ]);
    expect(shares.reduce((s, x) => s + x.amountMinor, 0)).toBe(101);
  });

  it("sharesToWeights produces percentages", () => {
    const weights = sharesToWeights(
      [
        { memberId: "m-ada", amountMinor: 7000 },
        { memberId: "m-ben", amountMinor: 3000 },
      ],
      members,
    );
    expect(weights).toEqual({ Ada: 70, Ben: 30 });
  });
});
