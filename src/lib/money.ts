/**
 * Money helpers. All amounts inside Evenly are stored as integer minor units
 * (kobo, cents) so splits never accumulate floating point error.
 */

/** Parse "12000", "12,000", "12000.50" or "12.5k" into minor units. Returns null when not a valid amount. */
export function parseAmountToMinor(token: string): number | null {
  const cleaned = token.replace(/,/g, "").trim();
  const kMatch = /^(\d+(?:\.\d+)?)k$/i.exec(cleaned);
  if (kMatch) {
    const major = Number(kMatch[1]) * 1000;
    return Number.isFinite(major) ? Math.round(major * 100) : null;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const major = Number(cleaned);
  if (!Number.isFinite(major) || major <= 0) return null;
  return Math.round(major * 100);
}

/** Format minor units as a plain grouped number, e.g. 1200050 -> "12,000.50". */
export function formatMinor(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return minor === 0 ? `${sign}${grouped}` : `${sign}${grouped}.${minor.toString().padStart(2, "0")}`;
}

/** Split an amount equally; remainder minor units go to the first members so shares always sum to the total. */
export function equalShares(amountMinor: number, memberIds: string[]): { memberId: string; amountMinor: number }[] {
  if (memberIds.length === 0) return [];
  const base = Math.floor(amountMinor / memberIds.length);
  let remainder = amountMinor - base * memberIds.length;
  return memberIds.map((memberId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { memberId, amountMinor: base + extra };
  });
}
