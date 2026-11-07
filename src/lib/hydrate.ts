import {
  getHousehold,
  insertExpense,
  insertHousehold,
  insertMember,
  insertSettlement,
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
  const hhRecord = byKind("household")[0];
  if (!hhRecord) return false;

  const household: Household = {
    id: householdId,
    name: hhRecord.record.fields.name ?? "Recovered household",
    inviteToken: hhRecord.record.fields.invite ?? "",
    createdAt: hhRecord.record.fields.createdAt ?? new Date().toISOString(),
    currency: hhRecord.record.fields.currency ?? "NGN",
    memoryEnabled: true,
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

  for (const rec of byKind("expense")) {
    const f = rec.record.fields;
    if (!f.expense || !f.amountMinor || !f.payerId) continue;
    const weights = parseWeights(f.weights);
    let shares: Expense["shares"] = [];
    if (weights) {
      const resolved = members
        .map((m) => ({ memberId: m.id, weight: weights[m.name] ?? 0 }))
        .filter((w) => w.weight > 0);
      if (resolved.length > 0) shares = weightedShares(Number(f.amountMinor), resolved);
    }
    if (shares.length === 0) continue;
    insertExpense({
      id: f.expense,
      householdId,
      rawText: f.raw ?? f.description ?? "",
      description: f.description ?? "",
      category: f.category ?? "general",
      amountMinor: Number(f.amountMinor),
      paidByMemberId: f.payerId,
      shares,
      status: "accepted",
      createdAt: f.createdAt ?? new Date().toISOString(),
    });
  }

  for (const rec of byKind("settlement")) {
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
      status: "settled",
      createdAt: new Date().toISOString(),
      digest: f.digest,
    };
    insertSettlement(settlement);
  }

  return true;
}
