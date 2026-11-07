import { describe, expect, it } from "vitest";
import { displayToUsdcMinor, extractUsdcTransfers, formatUsdc, matchTransfers, suggestSettlements, USDC_COIN_TYPE } from "../src/lib/settlement";
import type { Settlement } from "../src/lib/types";

describe("suggestSettlements", () => {
  it("pairs debtors and creditors greedily", () => {
    const pairs = suggestSettlements([
      { memberId: "ada", netMinor: 5000 },
      { memberId: "ben", netMinor: -3000 },
      { memberId: "cy", netMinor: -2000 },
    ]);
    expect(pairs).toEqual([
      { fromMemberId: "ben", toMemberId: "ada", displayMinor: 3000 },
      { fromMemberId: "cy", toMemberId: "ada", displayMinor: 2000 },
    ]);
  });
  it("returns nothing when settled", () => {
    expect(suggestSettlements([{ memberId: "a", netMinor: 0 }])).toEqual([]);
  });
});

describe("currency conversion", () => {
  it("converts display minor to USDC minor at the household rate", () => {
    // 1 USDC = 1,500 NGN -> rate 150,000 kobo; 15,000 NGN owed = 1,500,000 kobo = 10 USDC
    expect(displayToUsdcMinor(1_500_000, 150_000)).toBe(10_000_000);
    expect(formatUsdc(10_000_000)).toBe("10");
    expect(formatUsdc(1_234_567)).toBe("1.234567");
  });
});

const settlement: Settlement = {
  id: "s1",
  householdId: "h1",
  fromMemberId: "ben",
  toMemberId: "ada",
  amountUsdcMinor: 10_000_000,
  status: "pending",
  createdAt: new Date().toISOString(),
};
const addresses = new Map([
  ["ada", "0xAAA"],
  ["ben", "0xBBB"],
]);

describe("matchTransfers", () => {
  it("settles on an exact USDC transfer from debtor to creditor", () => {
    const matches = matchTransfers([settlement], addresses, [
      { digest: "d1", sender: "0xbbb", recipient: "0xaaa", coinType: USDC_COIN_TYPE, amountMinor: 10_000_000 },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].digest).toBe("d1");
  });

  it("settles on overpayment and on 99% (tolerance)", () => {
    expect(matchTransfers([settlement], addresses, [
      { digest: "d2", sender: "0xBBB", recipient: "0xAAA", coinType: USDC_COIN_TYPE, amountMinor: 12_000_000 },
    ])).toHaveLength(1);
    expect(matchTransfers([settlement], addresses, [
      { digest: "d3", sender: "0xBBB", recipient: "0xAAA", coinType: USDC_COIN_TYPE, amountMinor: 9_900_000 },
    ])).toHaveLength(1);
  });

  it("does not settle on underpayment beyond tolerance, wrong coin, or wrong direction", () => {
    const base = { sender: "0xBBB", recipient: "0xAAA", coinType: USDC_COIN_TYPE, amountMinor: 10_000_000 };
    expect(matchTransfers([settlement], addresses, [{ ...base, digest: "x1", amountMinor: 9_000_000 }])).toHaveLength(0);
    expect(matchTransfers([settlement], addresses, [{ ...base, digest: "x2", coinType: "0x2::sui::SUI" }])).toHaveLength(0);
    expect(matchTransfers([settlement], addresses, [{ ...base, digest: "x3", sender: "0xAAA", recipient: "0xBBB" }])).toHaveLength(0);
    expect(matchTransfers([settlement], addresses, [{ ...base, digest: "x4", recipient: "0xCCC" }])).toHaveLength(0);
  });

  it("one transfer settles at most one settlement", () => {
    const second: Settlement = { ...settlement, id: "s2" };
    const matches = matchTransfers([settlement, second], addresses, [
      { digest: "d9", sender: "0xBBB", recipient: "0xAAA", coinType: USDC_COIN_TYPE, amountMinor: 10_000_000 },
    ]);
    expect(matches).toHaveLength(1);
  });
});

describe("extractUsdcTransfers", () => {
  it("keeps only positive USDC balance changes with digest and sender", () => {
    const transfers = extractUsdcTransfers([
      {
        digest: "d1",
        sender: "0xBBB",
        balanceChanges: [
          { address: "0xAAA", coinType: USDC_COIN_TYPE, amount: "10000000" },
          { address: "0xBBB", coinType: USDC_COIN_TYPE, amount: "-10000000" },
          { address: "0xAAA", coinType: "0x2::sui::SUI", amount: "500" },
        ],
      },
      { digest: "d2", balanceChanges: [{ address: "0xAAA", coinType: USDC_COIN_TYPE, amount: "5" }] },
    ]);
    expect(transfers).toEqual([
      { digest: "d1", sender: "0xBBB", recipient: "0xAAA", coinType: USDC_COIN_TYPE, amountMinor: 10_000_000 },
    ]);
  });
});
