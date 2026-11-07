import { parseAmountToMinor } from "./money";

/**
 * Deterministic one-line expense parser. No LLM, no network.
 * Understands lines like:
 *   "groceries 12000 paid by Ada"
 *   "Ada paid 12,000 for groceries"
 *   "rent 50000 Ben"
 *   "toiletries ₦4,500 paid by Adaeze"
 */

export interface ParserMember {
  id: string;
  name: string;
}

export interface ParsedExpense {
  ok: boolean;
  description: string;
  category: string;
  amountMinor: number | null;
  paidByMemberId: string | null;
  payerName: string | null;
  errors: string[];
}

const CATEGORY_KEYWORDS: [string, string[]][] = [
  ["groceries", ["groceries", "grocery", "food", "market", "foodstuff", "provisions"]],
  ["rent", ["rent", "landlord"]],
  ["utilities", ["electricity", "light", "nepa", "phcn", "water", "internet", "wifi", "data", "airtime", "gas", "waste"]],
  ["transport", ["uber", "bolt", "taxi", "fuel", "petrol", "bus", "transport", "flight"]],
  ["dining", ["restaurant", "lunch", "dinner", "breakfast", "pizza", "takeaway", "coffee"]],
  ["household", ["toiletries", "cleaning", "detergent", "soap", "tissue", "household"]],
  ["health", ["pharmacy", "medicine", "hospital", "clinic", "doctor"]],
  ["fun", ["movie", "cinema", "netflix", "spotify", "game", "games", "outing"]],
];

export function categorise(description: string): string {
  const lower = description.toLowerCase();
  for (const [category, words] of CATEGORY_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return category;
  }
  return "general";
}

const AMOUNT_RE = /^(?:₦|\$|€|£)?(\d[\d,]*(?:\.\d{1,2})?k?)$/i;
const FILLER = new Set(["paid", "by", "for", "the", "a", "an"]);

export function parseExpenseLine(raw: string, members: ParserMember[]): ParsedExpense {
  const errors: string[] = [];
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) {
    return { ok: false, description: "", category: "general", amountMinor: null, paidByMemberId: null, payerName: null, errors: ["Type a line like: groceries 12000 paid by Ada"] };
  }

  const tokens = text.split(" ");

  // 1. Amount: first token that looks like money.
  let amountIdx = -1;
  let amountMinor: number | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const m = AMOUNT_RE.exec(tokens[i]);
    if (m) {
      const parsed = parseAmountToMinor(m[1]);
      if (parsed !== null) {
        amountIdx = i;
        amountMinor = parsed;
        break;
      }
    }
  }
  if (amountMinor === null) errors.push("No amount found. Add one, e.g. 12000.");

  // 2. Payer: "paid by <name>", "<name> paid ...", or any known member name in the line.
  let payer: ParserMember | null = null;
  let payerTokenIdx = -1;
  const lowerTokens = tokens.map((t) => t.toLowerCase().replace(/[^a-z'-]/g, ""));

  const matchMember = (nameToken: string): ParserMember | null => {
    const exact = members.filter((mb) => mb.name.toLowerCase() === nameToken);
    if (exact.length === 1) return exact[0];
    const partial = members.filter((mb) => mb.name.toLowerCase().startsWith(nameToken) && nameToken.length >= 3);
    return partial.length === 1 ? partial[0] : null;
  };

  const byIdx = lowerTokens.indexOf("by");
  if (byIdx >= 0 && byIdx + 1 < tokens.length) {
    payer = matchMember(lowerTokens[byIdx + 1]);
    if (payer) payerTokenIdx = byIdx + 1;
  }
  if (!payer) {
    for (let i = 0; i < lowerTokens.length; i++) {
      if (i === amountIdx) continue;
      const found = matchMember(lowerTokens[i]);
      if (found) {
        // Prefer a name next to "paid", otherwise the first known name.
        payer = found;
        payerTokenIdx = i;
        if (lowerTokens[i + 1] === "paid" || lowerTokens[i - 1] === "paid") break;
      }
    }
  }
  if (!payer && members.length > 0) {
    errors.push("Who paid? End the line with a member's name, e.g. \"paid by Ada\".");
  }

  // 3. Description: everything that is not the amount, the payer, or filler.
  const descTokens = tokens.filter((t, i) => {
    if (i === amountIdx || i === payerTokenIdx) return false;
    const clean = t.toLowerCase().replace(/[^a-z]/g, "");
    if (FILLER.has(clean)) return false;
    if (/^(?:₦|\$|€|£)$/.test(t)) return false;
    return true;
  });
  const description = descTokens.join(" ").replace(/\s+/g, " ").trim() || "Expense";

  return {
    ok: errors.length === 0,
    description,
    category: categorise(description),
    amountMinor,
    paidByMemberId: payer ? payer.id : null,
    payerName: payer ? payer.name : null,
    errors,
  };
}
