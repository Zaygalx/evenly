import { randomUUID } from "crypto";
import type { Balance, Expense, Household, Member } from "./types";
import { equalShares } from "./money";

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
}

const globalForStore = globalThis as unknown as { __evenlyStore?: Store };

export function getStore(): Store {
  if (!globalForStore.__evenlyStore) {
    globalForStore.__evenlyStore = {
      households: new Map(),
      members: new Map(),
      expenses: new Map(),
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
}): Expense {
  const members = getMembers(input.householdId).filter((m) => !m.revokedAt);
  const expense: Expense = {
    id: randomUUID(),
    householdId: input.householdId,
    rawText: input.rawText,
    description: input.description,
    category: input.category,
    amountMinor: input.amountMinor,
    paidByMemberId: input.paidByMemberId,
    // Phase 1 default: equal split. Phase 2 replaces this with the
    // memory-driven split engine proposal + accept/correct flow.
    shares: equalShares(input.amountMinor, members.map((m) => m.id)),
    status: "proposed",
    createdAt: new Date().toISOString(),
  };
  getStore().expenses.set(expense.id, expense);
  return expense;
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
