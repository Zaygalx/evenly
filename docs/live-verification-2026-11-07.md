# Live verification, 7 Nov 2026 (production)

Verified against the live production deployment at
https://evenly-gamma-three.vercel.app through its public API and in a real
browser session on the live URL. Nothing here was run against a local copy.

## Delegate key revoke, with the honest lag

Test household: Ownership Test Flat
(5cb089b5-46a1-4030-ad3f-6949d8407d6f), members Amara and Ben (test member).

1. Delegate key generated for Ben: status "generated", public state written
   to Walrus as a delegate record (the private key was shown once in the
   response and discarded; it is never stored).
2. Marked active through the delegate endpoint: status "active", again
   persisted to Walrus.
3. Revoked: the API returned delegateStatus "revoking",
   effectiveAfterMs 30000, and the note: "Revocation recorded. Because of
   verification caching, the member's memory access can take ~30 seconds
   to fully stop — the UI shows 'revoking' until then."
4. Fresh reads after the revocation show Ben with revokedAt
   2026-11-07T19:29:37.730Z and delegate status "revoking" with the same
   timestamp, which the Members UI renders as "delegate, revoked" once the
   30 second lag has passed. A browser session on the live URL confirmed
   Ben listed as removed with the "delegate, revoked" badge, and the page
   carries the explanation that removal can lag about 30 seconds because
   verification is cached.

Two real bugs were found and fixed during this verification:

- A member added through one serverless instance was invisible to another
  instance that had already cached the household, so member endpoints
  answered "Member not found" while the member record was on Walrus.
  Member scoped routes now refresh members from Walrus on a local miss.
- Delegate and revocation state lived only in the generating instance's
  cache, so activation on another instance claimed the member had no key.
  Delegate public state and revocations are now appended to Walrus as
  delegate records and restored by hydration and the restart proof.

## Restart proof

Run live on agent test household 1, Night Owls,
113aa5c1-53e2-4834-855e-243aa7d25d58), in the browser and through the API:

- Storage mode: Walrus Memory (Mainnet)
- Memories found in namespace: 40
- Members before to after: 2 to 2
- Expenses before to after: 12 to 12
- Settlements before to after: 1 to 1
- Balances identical after rebuild: yes

Local state was wiped first, exactly as the proof page describes. The
household came back from Walrus alone.

Known display quirk: a household page served by an instance that has not
hydrated its memory summary can briefly show "0 memories stored" in the
summary card while the Memories timeline and the proof read the real
records from Walrus. The counts above come from the proof and the API.
