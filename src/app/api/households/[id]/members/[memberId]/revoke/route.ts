import { NextResponse } from "next/server";
import { ensureHousehold, ensureMember } from "@/lib/hydrate";
import { DELEGATE_REVOKE_LAG_MS, getHousehold, getMember, revokeMember } from "@/lib/store";
import { rememberInBackground } from "@/lib/memory/background";

/**
 * Revoke a member: they stop splitting new expenses immediately in the app,
 * and their Walrus Memory delegate access is revoked.
 *
 * HONEST TIMING: due to verification caching on the memory side, delegate
 * removal can lag by ~30 seconds. The response and the UI both show this —
 * until the lag passes, the member's status reads "revoking", not "revoked".
 * (On-chain removal itself is an owner-signed removeDelegateKey call in the
 * Walrus Memory app; this endpoint records the revocation and its timing.)
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await ctx.params;
  if (!(await ensureHousehold(id))) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  let member = getMember(memberId);
  if (!member && (await ensureMember(id, memberId))) member = getMember(memberId);
  if (!member || member.householdId !== id) return NextResponse.json({ error: "Member not found." }, { status: 404 });
  const updated = revokeMember(memberId);
  rememberInBackground([
    {
      kind: "settlement_habit",
      householdId: id,
      fields: { category: "any", note: `Member ${member.name} was revoked at ${new Date().toISOString()}; delegate removal can lag ~30s (verification caching).` },
    },
    {
      // The revocation itself is state other instances must see: who was
      // revoked, when, and the delegate's public state at revocation.
      kind: "delegate",
      householdId: id,
      fields: {
        member: memberId,
        memberRevokedAt: updated?.revokedAt ?? new Date().toISOString(),
        ...(updated?.delegate
          ? { publicKey: updated.delegate.publicKey, delegateSui: updated.delegate.suiAddress, status: updated.delegate.status, generatedAt: updated.delegate.generatedAt, ...(updated.delegate.revokedAt ? { revokedAt: updated.delegate.revokedAt } : {}) }
          : {}),
      },
    },
  ]);
  return NextResponse.json({
    member: updated,
    delegateStatus: updated?.delegate ? "revoking" : "none",
    effectiveAfterMs: updated?.delegate ? DELEGATE_REVOKE_LAG_MS : 0,
    note: updated?.delegate
      ? "Revocation recorded. Because of verification caching, the member's memory access can take ~30 seconds to fully stop — the UI shows 'revoking' until then."
      : "Member revoked. They had no delegate key, so there is no memory access to wind down.",
  });
}

// Memory writes continue after the response via after(); give them room to land.
export const maxDuration = 60;
