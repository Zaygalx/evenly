import { equalShares } from "./money";
import { parseWeights, type MemoryRecord } from "./memory/serialize";

/**
 * The split engine.
 *
 * Given a purchase and the household's recalled Walrus memories, propose a
 * split. The proposal is fully explainable: it returns the exact memories it
 * used (with blob ids) so the Why panel can show them.
 *
 * Precedence (newest wins within each tier):
 *   1. correction memories for the category (a human fixed a split — strongest signal)
 *   2. rule memories for the category
 *   3. settlement_habit / rule memories with category=any
 *   4. equal split (also the result whenever memory is off)
 */

export interface ProposalMember {
  id: string;
  name: string;
}

export interface UsedMemory {
  kind: string;
  text: string;
  blobId: string;
}

export interface SplitProposal {
  shares: { memberId: string; amountMinor: number }[];
  explanation: string;
  usedMemories: UsedMemory[];
  memoryApplied: boolean;
}

/** Allocate amountMinor by weights using largest-remainder so shares sum exactly. */
export function weightedShares(
  amountMinor: number,
  weights: { memberId: string; weight: number }[],
): { memberId: string; amountMinor: number }[] {
  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
  if (totalWeight <= 0) return equalShares(amountMinor, weights.map((w) => w.memberId));
  const raw = weights.map((w) => ({ memberId: w.memberId, exact: (amountMinor * w.weight) / totalWeight }));
  const floored = raw.map((r) => ({ memberId: r.memberId, amountMinor: Math.floor(r.exact), frac: r.exact - Math.floor(r.exact) }));
  let remainder = amountMinor - floored.reduce((s, x) => s + x.amountMinor, 0);
  const byFrac = [...floored].sort((a, b) => b.frac - a.frac);
  for (let i = 0; remainder > 0; i = (i + 1) % byFrac.length) {
    byFrac[i].amountMinor += 1;
    remainder -= 1;
  }
  const order = new Map(weights.map((w, i) => [w.memberId, i]));
  return floored
    .map((f) => ({ memberId: f.memberId, amountMinor: (byFrac.find((b) => b.memberId === f.memberId) as { amountMinor: number }).amountMinor }))
    .sort((a, b) => (order.get(a.memberId) ?? 0) - (order.get(b.memberId) ?? 0));
}

export function proposeSplit(input: {
  amountMinor: number;
  category: string;
  members: ProposalMember[];
  memories: { record: MemoryRecord; blobId: string; text: string }[];
  memoryEnabled: boolean;
}): SplitProposal {
  const { amountMinor, category, members, memories, memoryEnabled } = input;
  const memberIds = members.map((m) => m.id);

  if (!memoryEnabled) {
    return {
      shares: equalShares(amountMinor, memberIds),
      explanation: "Memory is OFF — plain equal split. Turn memory on to see what Evenly has learned.",
      usedMemories: [],
      memoryApplied: false,
    };
  }

  const byName = new Map(members.map((m) => [m.name.toLowerCase(), m]));

  const findRule = (kinds: string[], cat: string) => {
    // memories arrive in recall order; scan from the end so the newest wins.
    for (let i = memories.length - 1; i >= 0; i--) {
      const { record } = memories[i];
      if (!kinds.includes(record.kind)) continue;
      if ((record.fields.category ?? "").toLowerCase() !== cat.toLowerCase()) continue;
      const weights = parseWeights(record.fields.weights);
      if (!weights) continue;
      const resolved: { memberId: string; weight: number }[] = [];
      let ok = true;
      for (const [name, weight] of Object.entries(weights)) {
        const member = byName.get(name.toLowerCase());
        if (!member) { ok = false; break; }
        resolved.push({ memberId: member.id, weight });
      }
      if (ok && resolved.length > 0) return { memory: memories[i], resolved };
    }
    return null;
  };

  const tiers: { kinds: string[]; cat: string; label: string }[] = [
    { kinds: ["correction"], cat: category, label: `a correction you made for ${category}` },
    { kinds: ["rule"], cat: category, label: `your ${category} rule` },
    { kinds: ["settlement_habit", "rule"], cat: "any", label: "your general household habit" },
  ];

  for (const tier of tiers) {
    const found = findRule(tier.kinds, tier.cat);
    if (found) {
      // Members missing from the rule get weight 0 unless the rule covers nobody else.
      const weights = members.map((m) => {
        const hit = found.resolved.find((r) => r.memberId === m.id);
        return { memberId: m.id, weight: hit ? hit.weight : 0 };
      });
      const anyPositive = weights.some((w) => w.weight > 0);
      if (!anyPositive) continue;
      const weightText = weights
        .filter((w) => w.weight > 0)
        .map((w) => `${members.find((m) => m.id === w.memberId)?.name} ${w.weight}`)
        .join(" / ");
      return {
        shares: weightedShares(amountMinor, weights),
        explanation: `Split by ${tier.label} (${weightText}), remembered from your household's Walrus memories.`,
        usedMemories: [{ kind: found.memory.record.kind, text: found.memory.text, blobId: found.memory.blobId }],
        memoryApplied: true,
      };
    }
  }

  return {
    shares: equalShares(amountMinor, memberIds),
    explanation: `No remembered rule for ${category} yet — equal split. Accept or correct this and Evenly will remember it.`,
    usedMemories: [],
    memoryApplied: false,
  };
}

/** Build the weights record for a set of shares, as percentages of the total. */
export function sharesToWeights(
  shares: { memberId: string; amountMinor: number }[],
  members: ProposalMember[],
): Record<string, number> {
  const total = shares.reduce((s, x) => s + x.amountMinor, 0);
  const weights: Record<string, number> = {};
  if (total <= 0) return weights;
  for (const share of shares) {
    const member = members.find((m) => m.id === share.memberId);
    if (!member) continue;
    weights[member.name] = Math.round((share.amountMinor / total) * 100);
  }
  return weights;
}
