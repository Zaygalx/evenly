# Evenly: the shared-money app that never asks "how do we split this?" twice

*Blog post draft — Total Recall hackathon (Tatum × Walrus Memory)*

## The problem

Every shared household has the same recurring conversation. Someone buys groceries, and
someone else has to ask: *"How are we splitting this one?"* The answer is almost always the
same as last time — groceries are 70/30 because Ada buys most of the food; rent is 50/50;
eating out is 50/50 no matter who ordered the extra dessert. But apps don't remember that.
People re-explain, re-negotiate, or quietly default to equal splits that aren't fair.

Evenly is a shared money app where the split rules live in memory — real, inspectable,
user-owned memory on **Walrus** — and settling up happens in **USDC on Sui**, detected live
through **Tatum**.

## What Evenly does

**Log in one line.** `groceries 12000 paid by Ada`. A deterministic parser (no LLM, fully
unit-tested) extracts the amount, payer, description and category. One line is the whole
form — logging takes three seconds, so people actually do it.

**Proposals that explain themselves.** Before proposing a split, Evenly recalls the
household's memories from its Walrus Memory namespace and applies them: corrections you
made beat standing rules, rules beat general habits, and habits beat a blind equal split.
Every proposal carries a **Why panel**: the exact memories used, with blob ids and explorer
links. No black box.

**Every interaction teaches.** Accept a proposal and that acceptance becomes a memory, and
a rule is derived from it. Correct a proposal and the correction is stored — and corrections
outrank rules next time. Correct groceries to 70/30 once, and the next groceries proposal
arrives already at 70/30, citing your correction as its reason.

**You can see it learning.** The learning chart plots, per week, the share of proposals
accepted without an edit. It's computed only from real decision events — no hardcoded demo
numbers. And there's a **memory switch**: turn memory off and proposals immediately fall
back to plain equal splits. The difference between "the app remembers us" and "the app
doesn't" is one toggle and one screen.

**Settling is a chain event, not a promise.** When the household settles, Evenly creates
pending settlements from the balances and watches Sui through Tatum: a server-side gRPC
`SubscribeCheckpoints` stream for speed, plus a polling backfill on every reconnect —
because checkpoint streams start at the tip and cannot resume, the backfill is what makes
detection trustworthy. When the debtor's USDC lands in the creditor's wallet, the settlement
flips to Settled live, transaction digest attached — and the settlement is written back as
a memory, because how a household settles is also something worth remembering.

**Ownership is real, including the awkward parts.** Each member can hold a delegate key on
the household's memory account (maximum 20, as the account model allows). Private keys are
shown once, to the member, and never stored. Revoking a member works — and Evenly shows the
honest "~30 seconds, revoking…" state that verification caching creates, instead of lying
that removal is instant.

**And it can prove the memory is the product.** The restart proof page wipes *all* local
state — households, members, expenses, balances — and rebuilds everything from the Walrus
namespaces alone. If the household comes back (it does), the memory isn't a feature bolted
onto a database. The memory *is* the database.

## How it uses Walrus Memory

- One namespace per household: `evenly-hh-<householdId>`.
- Memories are structured, human-readable lines (`EVENLY/1 kind=correction category=groceries
  weights=Ada:70,Ben:30 …`) so any blob can be opened and audited by a human.
- Writes go through a paced, deduplicating queue: a remember costs 5 points against a
  60-points-per-minute account cap, so Evenly spaces writes 5.1 seconds apart and never pays
  twice for the same memory. Every write is `rememberAndWait` — nothing reads back before a
  write has completed.

## How it uses Tatum

- Sui mainnet gRPC `SubscriptionService.SubscribeCheckpoints` with `x-api-key` metadata and
  a field mask limited to digests, senders and balance changes — via the official Sui TS SDK
  pointed at Tatum's gateway.
- Polling backfill via `sui_queryTransactionBlocks` against creditor addresses, cached for
  15 seconds to respect the free tier's ~3 requests/second.
- One matcher serves both paths, so stream and backfill settle identically (and are covered
  by the same unit tests): Circle USDC coin type, debtor → creditor, ≥ 99% of the expected
  amount.

## How it learned over time (demo household)

- Week one: every proposal is an equal split; the household corrects groceries (70/30),
  dining (50/50 rule), and rent (50/50).
- Days later: groceries proposals arrive at 70/30 unprompted, citing the correction memory.
  The acceptance-without-edit rate climbs on the learning chart.
- Month end: the household settles in USDC; the settlement memory records who paid whom,
  how much, and the transaction digest.

## Honest limits

Evenly labels anything simulated (run it without keys and memory is a local stand-in,
clearly marked; settlement detection stays off rather than faking a flip). Exchange rates
for settlement are set by the household — the app never invents an FX rate. Delegate
revocation can lag ~30 seconds. Those limits are in the app, on the `/limits` page, not
buried in a footnote.

Evenly's bet is simple: the best shared-money app isn't the one with the cleverest split
calculator. It's the one that remembers what your household already decided.
