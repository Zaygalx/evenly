export interface Member {
  id: string;
  householdId: string;
  name: string;
  /** Sui address (0x + 64 hex chars) that receives settlements for this member. */
  suiAddress: string;
  joinedAt: string;
  /** Set when the member's memory delegate access has been revoked (Phase 4). */
  revokedAt?: string;
}

export interface Household {
  id: string;
  name: string;
  inviteToken: string;
  createdAt: string;
  currency: string; // display currency code for logged amounts, e.g. "NGN" | "USD"
}

export type SplitStatus = "proposed" | "accepted" | "corrected";

export interface ExpenseShare {
  memberId: string;
  /** Amount this member owes for the expense, in minor units. */
  amountMinor: number;
}

export interface Expense {
  id: string;
  householdId: string;
  rawText: string;
  description: string;
  category: string;
  /** Total amount in minor units (e.g. kobo/cents). */
  amountMinor: number;
  paidByMemberId: string;
  shares: ExpenseShare[];
  status: SplitStatus;
  createdAt: string;
}

export interface Balance {
  memberId: string;
  /** Positive = the household owes this member; negative = they owe the household. Minor units. */
  netMinor: number;
}
