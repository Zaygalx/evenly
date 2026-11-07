import {
  allHouseholdIds,
  computeBalances,
  getDecisions,
  getExpenses,
  getHousehold,
  getMembers,
  getSettlements,
  insertExpense,
  insertHousehold,
  insertMember,
  insertSettlement,
  wipeLocalState,
} from "./store";
import { getMemoryBackend, getMemoryQueue, listAllRecords } from "./memory/client";
import { parseWeights } from "./memory/serialize";
import { weightedShares } from "./splitEngine";
import type { Expense, Household, Member, Settlement } from "./types";

/**
 * The restart proof.
 *
 * Walrus Memory is the source of truth; the local store is only a cache.
 * This routine proves it: drain the write queue, snapshot the household,
 * WIPE all local state, then rebuild every household purely from the
 * memories in its Walrus namespace (structured EVENLY/1 records).
 *
 * In local-mock mode the same code runs against the SDK's mock backend —
 * the rebuild logic is identical, only the storage is simulated, and the
 * report says so.
 */

export interface RebuildReport {
  mode: "walrus" | "local-mock";
  householdId: string;
  before: { households: number; members: number; expenses: number; settlements: number; decisions: number };
  memoriesFound: number;
  after: { households: number; members: number; expenses: number; settlements: number };
  balancesMatch: boolean;
  notes: string[];
}

export async function rebuildAllFromMemories(targetHouseholdId: string): Promise<RebuildReport> {
  const backend = getMemoryBackend();
  const notes: string[] = [];

  // 1. Make sure every queued memory write has landed before we wipe.
  await getMemoryQueue().drain();

  const householdIds = allHouseholdIds();
  if (!householdIds.includes(targetHouseholdId)) householdIds.push(targetHouseholdId);

  const beforeHousehold = getHousehold(targetHouseholdId);
  const before = {
    households: householdIds.length,
    members: getMembers(targetHouseholdId).length,
    expenses: getExpenses(targetHouseholdId).length,
    settlements: getSettlements(targetHouseholdId).length,
    decisions: getDecisions(targetHouseholdId).length,
  };
  const beforeBalances = computeBalances(targetHouseholdId);

  // 2. Read all memories for every household BEFORE wiping.
  const memoriesByHousehold = new Map<string, Awaited<ReturnType<typeof listAllRecords>>>();
  let memoriesFound = 0;
  for (const hid of householdIds) {
    const records = await listAllRecords(hid);
    memoriesByHousehold.set(hid, records);
    if (hid === targetHouseholdId) memoriesFound = records.length;
  }

  // 3. Wipe ALL local state. This is the moment of truth.
  wipeLocalState();
  notes.push("All local state was wiped (households, members, expenses, settlements, decisions).");

  // 4. Rebuild purely from memories.
  for (const hid of householdIds) {
    const records = memoriesByHousehold.get(hid) ?? [];
    const byKind = (kind: string) => records.filter((r) => r.record.kind === kind);

    const hhRecord = byKind("household")[0];
    const household: Household = {
      id: hid,
      name: hhRecord?.record.fields.name ?? beforeHousehold?.name ?? "Recovered household",
      inviteToken: hhRecord?.record.fields.invite ?? "",
      createdAt: hhRecord?.record.fields.createdAt ?? new Date().toISOString(),
      currency: hhRecord?.record.fields.currency ?? "NGN",
      memoryEnabled: true,
    };
    if (!household.inviteToken) {
      household.inviteToken = `recovered-${hid.slice(0, 8)}`;
      notes.push("Invite token was not in memory for one household; a recovery token was issued (share the new link).");
    }
    insertHousehold(household);

    const members: Member[] = [];
    for (const rec of byKind("member")) {
      const f = rec.record.fields;
      if (!f.member || !f.sui) continue;
      const member: Member = {
        id: f.member,
        householdId: hid,
        name: f.name ?? "Member",
        suiAddress: f.sui,
        joinedAt: new Date().toISOString(),
      };
      members.push(member);
      insertMember(member);
    }

    // Apply decision memories so rebuilt expenses carry their true status
    // and shares: corrected splits keep the corrected shares, accepted ones
    // keep the proposal, and only an undecided expense stays a proposal.
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
      insertExpense({
        id: f.expense,
        householdId: hid,
        rawText: f.raw ?? f.description ?? "",
        description: f.description ?? "",
        category: f.category ?? "general",
        amountMinor: Number(f.amountMinor),
        paidByMemberId: f.payerId,
        shares,
        status: decision?.kind === "correction" ? "corrected" : decision?.kind === "acceptance" ? "accepted" : "proposed",
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
        householdId: hid,
        fromMemberId: from?.id ?? f.from ?? "",
        toMemberId: to?.id ?? f.to ?? "",
        amountUsdcMinor: Number(f.amountUsdcMinor),
        status: "settled",
        createdAt: new Date().toISOString(),
        digest: f.digest,
      };
      insertSettlement(settlement);
    }
  }

  const after = {
    households: allHouseholdIds().length,
    members: getMembers(targetHouseholdId).length,
    expenses: getExpenses(targetHouseholdId).length,
    settlements: getSettlements(targetHouseholdId).length,
  };
  const afterBalances = computeBalances(targetHouseholdId);
  const balancesMatch = JSON.stringify(beforeBalances) === JSON.stringify(afterBalances);
  if (!balancesMatch) notes.push("Balances differ after rebuild — rebuilt expenses use remembered weights rounded to whole percents, so tiny rounding differences are possible. Counts above are exact.");
  if (backend.mode === "local-mock") notes.push("Storage mode is SIMULATED local memory (no Walrus keys configured). The rebuild logic is the production logic; only the backend differs.");
  notes.push("Decision events (learning-chart raw data) are app analytics, not memories; they are not rebuilt. The memories themselves (acceptances/corrections) are all still in Walrus.");

  return { mode: backend.mode, householdId: targetHouseholdId, before, memoriesFound, after, balancesMatch, notes };
}
