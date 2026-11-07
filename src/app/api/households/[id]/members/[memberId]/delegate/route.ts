import { NextResponse } from "next/server";
import { ensureHousehold, ensureMember } from "@/lib/hydrate";
import { getHousehold, getMember, setMemberDelegate } from "@/lib/store";

/**
 * Generate a Walrus Memory delegate keypair for a member.
 *
 * Uses the SDK's own generateDelegateKey() (@mysten-incubation/memwal/account).
 * Evenly stores ONLY the public key + derived Sui address. The private key is
 * returned exactly once, in this response, for the member to keep — it is
 * never stored, logged, or written to memory.
 *
 * The key becomes useful once the memory account OWNER adds the public key
 * on-chain (Walrus Memory app or addDelegateKey with the owner's signer).
 * That owner step cannot be done by this server, and the UI says so.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await ctx.params;
  if (!(await ensureHousehold(id))) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  let member = getMember(memberId);
  if (!member && (await ensureMember(id, memberId))) member = getMember(memberId);
  if (!member || member.householdId !== id) return NextResponse.json({ error: "Member not found." }, { status: 404 });
  if (member.delegate && member.delegate.status === "active") {
    return NextResponse.json({ error: "This member already has an active delegate key." }, { status: 409 });
  }
  try {
    const { generateDelegateKey } = await import("@mysten-incubation/memwal/account");
    const key = await generateDelegateKey();
    const delegate = {
      publicKey: Buffer.from(key.publicKey).toString("hex"),
      suiAddress: key.suiAddress,
      status: "generated" as const,
      generatedAt: new Date().toISOString(),
    };
    setMemberDelegate(memberId, delegate);
    return NextResponse.json({
      delegate,
      // Shown once. The member must store this like a password.
      privateKeyOnce: key.privateKey,
      nextStep:
        "The household's Walrus Memory account owner must add this delegate public key on-chain (Walrus Memory app → account → delegate keys, max 20). Then mark it active here.",
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: `Could not generate a delegate key: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}

/** Mark a generated delegate key as added on-chain by the account owner. */
export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await ctx.params;
  if (!(await ensureHousehold(id))) return NextResponse.json({ error: "Household not found." }, { status: 404 });
  let member = getMember(memberId);
  if (!member && (await ensureMember(id, memberId))) member = getMember(memberId);
  if (!member || member.householdId !== id || !member.delegate) {
    return NextResponse.json({ error: "No delegate key to activate for this member." }, { status: 404 });
  }
  const updated = setMemberDelegate(memberId, { ...member.delegate, status: "active" });
  return NextResponse.json({ member: updated });
}
