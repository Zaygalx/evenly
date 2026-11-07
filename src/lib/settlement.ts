import type { Balance, Settlement } from "./types";

/**
 * Settlement maths and on-chain matching.
 *
 * A settlement is a promise: member A (debtor) will send member B (creditor)
 * a specific amount of USDC on Sui. Evenly never moves the money — it watches
 * the chain and flips the settlement to "settled" when a matching transfer
 * is observed.
 */

export const USDC_COIN_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
export const USDC_DECIMALS = 6;

export interface SettlementPair {
  fromMemberId: string;
  toMemberId: string;
  displayMinor: number;
}

/** Greedy debtor/creditor pairing that minimises the number of transfers. */
export function suggestSettlements(balances: Balance[]): SettlementPair[] {
  const debtors = balances.filter((b) => b.netMinor < 0).map((b) => ({ id: b.memberId, amt: -b.netMinor }));
  const creditors = balances.filter((b) => b.netMinor > 0).map((b) => ({ id: b.memberId, amt: b.netMinor }));
  const pairs: SettlementPair[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) pairs.push({ fromMemberId: debtors[i].id, toMemberId: creditors[j].id, displayMinor: pay });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return pairs;
}

/** Convert a display-currency amount (minor units) into USDC minor units (6dp). */
export function displayToUsdcMinor(displayMinor: number, displayPerUsdcMinor: number): number {
  if (displayPerUsdcMinor <= 0) throw new Error("displayPerUsdcMinor must be positive");
  return Math.round((displayMinor / displayPerUsdcMinor) * 10 ** USDC_DECIMALS);
}

export function formatUsdc(usdcMinor: number): string {
  const whole = Math.floor(usdcMinor / 10 ** USDC_DECIMALS);
  const frac = usdcMinor % 10 ** USDC_DECIMALS;
  return frac === 0 ? `${whole}` : `${whole}.${String(frac).padStart(USDC_DECIMALS, "0").replace(/0+$/, "")}`;
}

/** A USDC movement observed on-chain, normalised from any source (stream or backfill). */
export interface ObservedTransfer {
  digest: string;
  sender: string;
  recipient: string;
  coinType: string;
  /** Amount received by `recipient`, in USDC minor units (6dp). */
  amountMinor: number;
}

export interface SettlementMatch {
  settlementId: string;
  digest: string;
  transfer: ObservedTransfer;
}

/**
 * Match observed transfers to pending settlements.
 *
 * A transfer settles a settlement when ALL of these hold:
 * - the coin is Circle USDC on Sui mainnet (exact coin type)
 * - recipient is the creditor's Sui address, sender is the debtor's
 * - amount is at least 99% of the expected amount (1% tolerance covers
 *   rounding and small transfer fees; overpayment also settles)
 * Each transfer settles at most one settlement; first match wins.
 */
export function matchTransfers(
  pending: Settlement[],
  addressByMemberId: Map<string, string>,
  transfers: ObservedTransfer[],
): SettlementMatch[] {
  const matches: SettlementMatch[] = [];
  const usedDigests = new Set<string>();
  const remaining = [...pending];
  for (const transfer of transfers) {
    if (usedDigests.has(transfer.digest)) continue;
    if (transfer.coinType !== USDC_COIN_TYPE) continue;
    const idx = remaining.findIndex((s) => {
      const from = addressByMemberId.get(s.fromMemberId)?.toLowerCase();
      const to = addressByMemberId.get(s.toMemberId)?.toLowerCase();
      return (
        from === transfer.sender.toLowerCase() &&
        to === transfer.recipient.toLowerCase() &&
        transfer.amountMinor >= Math.floor(s.amountUsdcMinor * 0.99)
      );
    });
    if (idx >= 0) {
      const [settlement] = remaining.splice(idx, 1);
      usedDigests.add(transfer.digest);
      matches.push({ settlementId: settlement.id, digest: transfer.digest, transfer });
    }
  }
  return matches;
}

interface RawBalanceChange {
  address?: string;
  coinType?: string;
  amount?: string;
}

interface RawTx {
  digest?: string;
  sender?: string;
  balanceChanges?: RawBalanceChange[];
}

/**
 * Normalise raw transactions (JSON-RPC shape: digest + sender + balance
 * changes) into observed USDC transfers. Positive balance changes for the
 * USDC coin type are receipts.
 */
export function extractUsdcTransfers(txs: RawTx[]): ObservedTransfer[] {
  const out: ObservedTransfer[] = [];
  for (const tx of txs) {
    if (!tx.digest || !tx.sender) continue;
    for (const change of tx.balanceChanges ?? []) {
      if (change.coinType !== USDC_COIN_TYPE || !change.address || !change.amount) continue;
      const amount = Number(change.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      out.push({
        digest: tx.digest,
        sender: tx.sender,
        recipient: change.address,
        coinType: change.coinType,
        amountMinor: amount,
      });
    }
  }
  return out;
}
