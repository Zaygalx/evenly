import { describe, expect, it } from "vitest";
import { parseExpenseLine, categorise } from "../src/lib/parser";
import { equalShares, formatMinor, parseAmountToMinor } from "../src/lib/money";
import { isValidSuiAddress } from "../src/lib/store";

const members = [
  { id: "m-ada", name: "Ada" },
  { id: "m-ben", name: "Ben" },
  { id: "m-adaeze", name: "Adaeze" },
];

describe("parseExpenseLine", () => {
  it("parses the canonical example", () => {
    const r = parseExpenseLine("groceries 12000 paid by Ada", members);
    expect(r.ok).toBe(true);
    expect(r.description).toBe("groceries");
    expect(r.category).toBe("groceries");
    expect(r.amountMinor).toBe(1_200_000);
    expect(r.paidByMemberId).toBe("m-ada");
  });

  it("parses name-first lines with commas and 'for'", () => {
    const r = parseExpenseLine("Ben paid 12,500 for rent", members);
    expect(r.ok).toBe(true);
    expect(r.description).toBe("rent");
    expect(r.category).toBe("rent");
    expect(r.amountMinor).toBe(1_250_000);
    expect(r.paidByMemberId).toBe("m-ben");
  });

  it("handles currency symbols and decimals", () => {
    const r = parseExpenseLine("toiletries ₦4,500.50 paid by Adaeze", members);
    expect(r.ok).toBe(true);
    expect(r.amountMinor).toBe(450_050);
    expect(r.paidByMemberId).toBe("m-adaeze");
    expect(r.category).toBe("household");
  });

  it("handles k shorthand", () => {
    const r = parseExpenseLine("internet 15k paid by Ben", members);
    expect(r.ok).toBe(true);
    expect(r.amountMinor).toBe(1_500_000);
    expect(r.category).toBe("utilities");
  });

  it("rejects lines without an amount", () => {
    const r = parseExpenseLine("groceries paid by Ada", members);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/amount/i);
  });

  it("rejects lines without a known payer", () => {
    const r = parseExpenseLine("groceries 12000 paid by Chidi", members);
    expect(r.ok).toBe(false);
    expect(r.paidByMemberId).toBeNull();
  });

  it("rejects empty lines with guidance", () => {
    const r = parseExpenseLine("   ", members);
    expect(r.ok).toBe(false);
  });

  it("prefers exact name match over prefix collisions", () => {
    const r = parseExpenseLine("groceries 100 paid by Ada", members);
    expect(r.paidByMemberId).toBe("m-ada"); // not Adaeze
  });
});

describe("money helpers", () => {
  it("parses amounts to minor units", () => {
    expect(parseAmountToMinor("12000")).toBe(1_200_000);
    expect(parseAmountToMinor("12,000.50")).toBe(1_200_050);
    expect(parseAmountToMinor("0")).toBeNull();
    expect(parseAmountToMinor("abc")).toBeNull();
  });

  it("formats minor units", () => {
    expect(formatMinor(1_200_000)).toBe("12,000");
    expect(formatMinor(1_200_050)).toBe("12,000.50");
    expect(formatMinor(-50_000)).toBe("-500");
  });

  it("equal shares always sum to the total", () => {
    const shares = equalShares(100, ["a", "b", "c"]);
    expect(shares.reduce((s, x) => s + x.amountMinor, 0)).toBe(100);
    expect(shares.map((s) => s.amountMinor)).toEqual([34, 33, 33]);
    expect(equalShares(1000, [])).toEqual([]);
  });
});

describe("sui address validation", () => {
  it("accepts 0x + 64 hex", () => {
    expect(isValidSuiAddress("0x" + "a".repeat(64))).toBe(true);
    expect(isValidSuiAddress("0x" + "A1".repeat(32))).toBe(true);
  });
  it("rejects malformed addresses", () => {
    expect(isValidSuiAddress("0x123")).toBe(false);
    expect(isValidSuiAddress("a".repeat(64))).toBe(false);
    expect(isValidSuiAddress("")).toBe(false);
  });
});

describe("categorise", () => {
  it("maps keywords to categories", () => {
    expect(categorise("weekly groceries run")).toBe("groceries");
    expect(categorise("NEPA bill")).toBe("utilities");
    expect(categorise("uber to the airport")).toBe("transport");
    expect(categorise("birthday gift")).toBe("general");
  });
});
