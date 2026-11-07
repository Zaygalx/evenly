import {
  getHousehold,
  insertExpense,
  insertHousehold,
  insertMember,
  insertSettlement,
  recordDecision,
} from "./store";
import { getMemoryBackend, listAllRecords } from "./memory/client";
import { parseWeights } from "./memory/serialize";
import { weightedShares } from "./splitEngine";
import type { Expense, Household, Member, Settlement } from "./types";

/**
 * Cold-instance hydration.
 *
 * On serverless hosting each request can land on a fresh instance whose
 * local cache is empty. Walrus Memory is the source of truth, so when a
 * household is missing locally we rebuild its cache entry from the
 * memories in its namespace — the same code path the restart proof uses,
 * minus the wipe. In local-mock mode there is nothing to hydrate from
 * (the mock lives in one process only), so this is a no-op there.
 */
export async function ensureHousehold(householdId: string): Promise<boolean> {
  if (getHousehold(householdId)) return true;
  if (getMemoryBackend().mode !== "walrus") return false;

  const records = await listAllRecords(householdId);
  const byKind = (kind: string) => records.filter((r) => r.record.kind === kind);
  // Settings updates append a fresh household record; the latest one wins.
  const hhRecord = byKind("household").sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
  if (!hhRecord) return false;

  const household: Household = {
    id: householdId,
    name: hhRecord.record.fields.name ?? "Recovered household",
    inviteToken: hhRecord.record.fields.invite ?? "",
    createdAt: hhRecord.record.fields.createdAt ?? new Date().toISOString(),
    currency: hhRecord.record.fields.currency ?? "NGN",
    memoryEnabled: hhRecord.record.fields.memoryEnabled !== "false",
    ...(hhRecord.record.fields.rate ? { displayPerUsdcMinor: Number(hhRecord.record.fields.rate) } : {}),
  };
  insertHousehold(household);

  const members: Member[] = [];
  for (const rec of byKind("member")) {
    const f = rec.record.fields;
    if (!f.member || !f.sui) continue;
    const member: Member = {
      id: f.member,
      householdId,
      name: f.name ?? "Member",
      suiAddress: f.sui,
      joinedAt: new Date().toISOString(),
    };
    members.push(member);
    insertMember(member);
  }

  // Decisions are memories too. Index the latest acceptance or correction
  // per expense so a rebuilt expense carries its true status and shares:
  // an undecided proposal must stay decidable on a cold instance, and a
  // corrected split must keep the corrected shares.
  const decisionByExpense = new Map<string, { kind: string; weights?: string; createdAt?: string }>();
  for (const rec of [...byKind("acceptance"), ...byKind("correction")]) {
    const f = rec.record.fields;
    if (!f.expense) continue;
    const prev = decisionByExpense.get(f.expense);
    if (!prev || (rec.createdAt ?? "") >= (prev.createdAt ?? "")) {
      decisionByExpense.set(f.expense, { kind: rec.record.kind, weights: f.weights, createdAt: rec.createdAt });
    }
  }

  for (const rec of byKind("expense")) {
    const f = rec.record.fields;
    if (!f.expense || !f.amountMinor || !f.payerId) continue;
    const decision = decisionByExpense.get(f.expense);
    const effectiveWeights =
      decision?.kind === "correction" ? (parseWeights(decision.weights) ?? parseWeights(f.weights)) : parseWeights(f.weights);
    let shares: Expense["shares"] = [];
    if (effectiveWeights) {
      const resolved = members
        .map((m) => ({ memberId: m.id, weight: effectiveWeights[m.name] ?? 0 }))
        .filter((w) => w.weight > 0);
      if (resolved.length > 0) shares = weightedShares(Number(f.amountMinor), resolved);
    }
    if (shares.length === 0) continue;
    const status: Expense["status"] =
      decision?.kind === "correction" ? "corrected" : decision?.kind === "acceptance" ? "accepted" : "proposed";
    insertExpense({
      id: f.expense,
      householdId,
      rawText: f.raw ?? f.description ?? "",
      description: f.description ?? "",
      category: f.category ?? "general",
      amountMinor: Number(f.amountMinor),
      paidByMemberId: f.payerId,
      shares,
      status,
      createdAt: f.createdAt ?? new Date().toISOString(),
    });
    if (decision) {
      recordDecision(householdId, f.expense, status === "corrected" ? "corrected" : "accepted", status === "corrected");
    }
  }

  // Settlement records are appended at creation (pending) and again when
  // the transfer is detected (settled, with digest). The latest record per
  // settlement id is the truth.
  const settlementById = new Map<string, (typeof records)[number]>();
  for (const rec of byKind("settlement")) {
    const sid = rec.record.fields.settlement;
    if (!sid) continue;
    const prev = settlementById.get(sid);
    if (!prev || (rec.createdAt ?? "") >= (prev.createdAt ?? "")) settlementById.set(sid, rec);
  }
  for (const rec of settlementById.values()) {
    const f = rec.record.fields;
    if (!f.settlement || !f.amountUsdcMinor) continue;
    const from = members.find((m) => m.name === f.from);
    const to = members.find((m) => m.name === f.to);
    const settlement: Settlement = {
      id: f.settlement,
      householdId,
      fromMemberId: from?.id ?? f.from ?? "",
      toMemberId: to?.id ?? f.to ?? "",
      amountUsdcMinor: Number(f.amountUsdcMinor),
      status: f.status === "pending" && !f.digest ? "pending" : "settled",
      createdAt: new Date().toISOString(),
      digest: f.digest,
    };
    insertSettlement(settlement);
  }

  return true;
}
