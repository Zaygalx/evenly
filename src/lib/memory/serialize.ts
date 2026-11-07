import { createHash } from "crypto";

/**
 * Structured memory serialisation for Evenly.
 *
 * Every memory stored in Walrus Memory is a single line of text:
 *
 *   EVENLY/1 kind=rule household=<id> category=groceries weights=Ada:70,Ben:30 note=...
 *
 * Values are URI-encoded so names and notes may contain spaces. The format is
 * deliberately human-readable: a judge (or a user) can open any blob and see
 * exactly what Evenly remembered, with no decoding tool.
 */

export type MemoryKind =
  | "household"
  | "member"
  | "expense"
  | "rule"
  | "correction"
  | "acceptance"
  | "settlement_habit"
  | "settlement"
  | "delegate";

export interface MemoryRecord {
  kind: MemoryKind;
  householdId: string;
  fields: Record<string, string>;
}

const PREFIX = "EVENLY/1";
const KINDS = new Set<string>([
  "household",
  "member",
  "expense",
  "rule",
  "correction",
  "acceptance",
  "settlement_habit",
  "settlement",
  "delegate",
]);

export function serializeMemory(record: MemoryRecord): string {
  const parts = [`${PREFIX}`, `kind=${record.kind}`, `household=${encodeURIComponent(record.householdId)}`];
  const keys = Object.keys(record.fields).sort();
  for (const key of keys) {
    parts.push(`${key}=${encodeURIComponent(record.fields[key])}`);
  }
  return parts.join(" ");
}

export function parseMemory(text: string): MemoryRecord | null {
  if (!text.startsWith(PREFIX + " ")) return null;
  const fields: Record<string, string> = {};
  let kind: string | undefined;
  let householdId: string | undefined;
  for (const part of text.slice(PREFIX.length).trim().split(" ")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    let value = part.slice(eq + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw value */
    }
    if (key === "kind") kind = value;
    else if (key === "household") householdId = value;
    else fields[key] = value;
  }
  if (!kind || !KINDS.has(kind) || !householdId) return null;
  return { kind: kind as MemoryKind, householdId, fields };
}

/** Canonical dedupe key: identical kind + fields in one household are the same memory. */
export function dedupeKey(record: MemoryRecord): string {
  const canonical = serializeMemory({
    kind: record.kind,
    householdId: record.householdId,
    fields: { ...record.fields },
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 24);
}

/** "Ada:70,Ben:30" <-> { Ada: 70, Ben: 30 } */
export function weightsToString(weights: Record<string, number>): string {
  return Object.entries(weights)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, w]) => `${name}:${w}`)
    .join(",");
}

export function parseWeights(value: string | undefined): Record<string, number> | null {
  if (!value) return null;
  const out: Record<string, number> = {};
  for (const part of value.split(",")) {
    const idx = part.lastIndexOf(":");
    if (idx <= 0) return null;
    const name = part.slice(0, idx).trim();
    const weight = Number(part.slice(idx + 1));
    if (!name || !Number.isFinite(weight) || weight < 0) return null;
    out[name] = weight;
  }
  return Object.keys(out).length > 0 ? out : null;
}
