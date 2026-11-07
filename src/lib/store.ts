import { randomUUID } from "crypto";
import type { Balance, DecisionEvent, Expense, ExpenseProposal, Household, Member, Settlement } from "./types";

/**
 * Phase 1 storage: in-memory store behind a small repository interface.
 *
 * IMPORTANT (by design, and labelled in the UI): this is a CACHE, not the
 * source of truth. Phase 2 replaces the backing implementation with Walrus
 * Memory (one namespace per household) without changing callers, and the
 * Phase 4 restart-proof rebuilds state from Walrus after wiping this store.
 */

export interface Store {
  households: Map<string, Household>;
  members: Map<string, Member>;
  expenses: Map<string, Expense>;
  decisions: Map<string, DecisionEvent>;
  settlements: Map<string, Settlement>;
}

const globalForStore = globalThis as unknown as { __evenlyStore?: Store };

export function getStore(): Store {
  if (!globalForStore.__evenlyStore) {
    globalForStore.__evenlyStore = {
      households: new Map(),
      members: new Map(),
      expenses: new Map(),
      decisions: new Map(),
      settlements: new Map(),
    };
  }
  return globalForStore.__evenlyStore;
}

/** Test / restart-proof helper: wipe every local record. */
export function wipeLocalState(): void {
  const s = getStore();
  s.households.clear();
  s.members.clear();
  s.expenses.clear();
  s.decisions.clear();
  s.settlements.clear();
}

export function isValidSuiAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(address.trim());
}

export function createHousehold(name: string, currency: string, creatorName: string, creatorSuiAddress: string): { household: Household; creator: Member } {
  const store = getStore();
  const household: Household = {
    id: randomUUID(),
    name: name.trim(),
    inviteToken: randomUUID().replace(/-/g, ""),
    createdAt: new Date().toISOString(),
    currency: currency || "NGN",
    memoryEnabled: true,
  };
  store.households.set(household.id, household);
  const creator = addMember(household.id, creatorName, creatorSuiAddress);
  return { household, creator };
}

export function getHousehold(id: string): Household | undefined {
  return getStore().households.get(id);
}

export function getHouseholdByInvite(token: string): Household | undefined {
  for (const h of getStore().households.values()) {
    if (h.inviteToken === token) return h;
  }
  return undefined;
}

export function addMember(householdId: string, name: string, suiAddress: string): Member {
  const member: Member = {
    id: randomUUID(),
    householdId,
    name: name.trim(),
    suiAddress: suiAddress.trim().toLowerCase(),
    joinedAt: new Date().toISOString(),
  };
  getStore().members.set(member.id, member);
  return member;
}

export function getMembers(householdId: string): Member[] {
  return [...getStore().members.values()]
    .filter((m) => m.householdId === householdId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

export function getExpenses(householdId: string): Expense[] {
  return [...getStore().expenses.values()]
    .filter((e) => e.householdId === householdId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addExpense(input: {
  householdId: string;
  rawText: string;
  description: string;
  category: string;
  amountMinor: number;
  paidByMemberId: string;
  shares: { memberId: string; amountMinor: number }[];
  proposal?: ExpenseProposal;
}): Expense {
  const expense: Expense = {
    id: randomUUID(),
    householdId: input.householdId,
    rawText: input.rawText,
    description: input.description,
    category: input.category,
    amountMinor: input.amountMinor,
    paidByMemberId: input.paidByMemberId,
    shares: input.shares,
    status: "proposed",
    proposal: input.proposal,
    createdAt: new Date().toISOString(),
  };
  getStore().expenses.set(expense.id, expense);
  return expense;
}

export function getExpense(id: string): Expense | undefined {
  return getStore().expenses.get(id);
}

export function setExpenseShares(id: string, shares: { memberId: string; amountMinor: number }[], status: Expense["status"]): Expense | undefined {
  const expense = getStore().expenses.get(id);
  if (!expense) return undefined;
  expense.shares = shares;
  expense.status = status;
  return expense;
}

export function setMemoryEnabled(householdId: string, enabled: boolean): Household | undefined {
  const household = getStore().households.get(householdId);
  if (!household) return undefined;
  household.memoryEnabled = enabled;
  return household;
}

export function setDisplayPerUsdc(householdId: string, displayPerUsdcMinor: number): Household | undefined {
  const household = getStore().households.get(householdId);
  if (!household) return undefined;
  household.displayPerUsdcMinor = displayPerUsdcMinor;
  return household;
}

/** ISO week key in UTC, e.g. "2026-W45". */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function recordDecision(householdId: string, expenseId: string, action: DecisionEvent["action"], edited: boolean): DecisionEvent {
  const now = new Date();
  const event: DecisionEvent = {
    id: randomUUID(),
    householdId,
    expenseId,
    action,
    edited,
    at: now.toISOString(),
    week: isoWeekKey(now),
  };
  getStore().decisions.set(event.id, event);
  return event;
}

export function getDecisions(householdId: string): DecisionEvent[] {
  return [...getStore().decisions.values()]
    .filter((d) => d.householdId === householdId)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/* ------------------------------ Settlements ------------------------------- */

export function addSettlement(input: {
  householdId: string;
  fromMemberId: string;
  toMemberId: string;
  amountUsdcMinor: number;
}): Settlement {
  const settlement: Settlement = {
    id: randomUUID(),
    householdId: input.householdId,
    fromMemberId: input.fromMemberId,
    toMemberId: input.toMemberId,
    amountUsdcMinor: input.amountUsdcMinor,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  getStore().settlements.set(settlement.id, settlement);
  return settlement;
}

export function getSettlements(householdId: string): Settlement[] {
  return [...getStore().settlements.values()]
    .filter((s) => s.householdId === householdId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPendingSettlements(householdId: string): Settlement[] {
  return getSettlements(householdId).filter((s) => s.status === "pending");
}

export function markSettlementSettled(id: string, digest: string): Settlement | undefined {
  const settlement = getStore().settlements.get(id);
  if (!settlement || settlement.status === "settled") return settlement;
  settlement.status = "settled";
  settlement.settledAt = new Date().toISOString();
  settlement.digest = digest;
  return settlement;
}

export function revokeMember(memberId: string): Member | undefined {
  const member = getStore().members.get(memberId);
  if (!member) return undefined;
  if (!member.revokedAt) member.revokedAt = new Date().toISOString();
  return member;
}

export function computeBalances(householdId: string): Balance[] {
  const members = getMembers(householdId);
  const net = new Map<string, number>(members.map((m) => [m.id, 0]));
  for (const e of getExpenses(householdId)) {
    net.set(e.paidByMemberId, (net.get(e.paidByMemberId) ?? 0) + e.amountMinor);
    for (const share of e.shares) {
      net.set(share.memberId, (net.get(share.memberId) ?? 0) - share.amountMinor);
    }
  }
  return members.map((m) => ({ memberId: m.id, netMinor: net.get(m.id) ?? 0 }));
}
