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
  /** Memory switch (Phase 2). When false, splits are plain equal and nothing is learned. */
  memoryEnabled: boolean;
  /** Phase 3: display-currency minor units per 1 USDC, set by the household. Used to price settlements. */
  displayPerUsdcMinor?: number;
}

export type SplitStatus = "proposed" | "accepted" | "corrected";

export interface ExpenseShare {
  memberId: string;
  /** Amount this member owes for the expense, in minor units. */
  amountMinor: number;
}

export interface ExpenseProposal {
  explanation: string;
  usedMemories: { kind: string; text: string; blobId: string }[];
  memoryApplied: boolean;
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
  proposal?: ExpenseProposal;
  createdAt: string;
}

/** One accept/correct decision — the raw data for the learning chart (Phase 4). */
export interface DecisionEvent {
  id: string;
  householdId: string;
  expenseId: string;
  action: "accepted" | "corrected";
  /** True when the user changed the proposed shares before accepting the split. */
  edited: boolean;
  at: string;
  /** ISO week key, e.g. "2026-W45" (UTC). */
  week: string;
}

export type SettlementStatus = "pending" | "settled";

export interface Settlement {
  id: string;
  householdId: string;
  fromMemberId: string; // debtor — sends the USDC
  toMemberId: string; // creditor — receives the USDC
  /** Expected USDC amount in USDC minor units (6 decimals). */
  amountUsdcMinor: number;
  status: SettlementStatus;
  createdAt: string;
  settledAt?: string;
  /** Sui transaction digest that settled it, once detected on-chain. */
  digest?: string;
}

export interface Balance {
  memberId: string;
  /** Positive = the household owes this member; negative = they owe the household. Minor units. */
  netMinor: number;
}
