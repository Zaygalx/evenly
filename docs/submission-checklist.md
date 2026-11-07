# Evenly — submission checklist (Total Recall, Tatum × Walrus Memory)

Deadline: **Tue 10 Nov 2026, 17:00 UTC**. Target: fully submitted by **12:00 UTC**.

## Before deploying

- [ ] Tatum API key created (dashboard) — enter it via the secure entry Muse sent, or paste it directly into Vercel env (`TATUM_API_KEY`). Never in chat.
- [ ] Walrus Memory account created; delegate key generated for Evenly (`MEMWAL_ACCOUNT_ID`, `MEMWAL_DELEGATE_KEY` in env).
- [ ] Sui wallet funded with a little SUI + USDC (mainnet, small amounts only).
- [ ] 1–2 real testers with Sui addresses ready for the demo household.

## Deploy (GitHub → Vercel)

- [ ] GitHub device login done; `evenly` repo pushed.
- [ ] Vercel: import the repo, framework preset Next.js, no build changes needed.
- [ ] Env vars set in Vercel (Production): all rows from README's table.
- [ ] First deploy green; open the live URL on the phone and create the real household.

## Evidence to gather on the LIVE deployment

- [ ] Seed or teach the demo household: run the correction flow once for groceries
      (or `npx tsx scripts/seed-memories.ts <householdId>` with env set locally) —
      target **10+ confirmed mainnet memories**; list them via the household's
      memories API and save the blob ids here:
      - [ ] memories confirmed: ___ (count), mode shows "walrus"
- [ ] Learning loop proof: log a second groceries expense → proposal cites the
      correction memory in the Why panel (screenshot).
- [ ] Live settlement proof: create a settlement, send the real USDC, capture the
      ✅ Settled flip + transaction digest (screenshot + explorer link).
- [ ] Restart proof on live: run `/proof/<id>`, capture the report (counts + balances match).
- [ ] Learning chart has at least one real week of decisions.
- [ ] Memory switch screenshot pair: same category, memory on vs off.

## Submission pack

- [ ] README final (architecture diagram renders on GitHub).
- [ ] Blog post published (docs/blog-post.md) — link: ___
- [ ] 90-second demo recorded from docs/demo-script.md — link: ___
- [ ] X post published (docs/x-post.md) tagging @Tatum_io and @WalrusFoundation — link: ___
- [ ] Submission form filled: name Evenly, track Total Recall, special award
      **Best Walrus Memory**, repo link, live link, demo link.
- [ ] Final check: `/limits` page on the live site matches reality (modes shown are real).

## Judging map (for the form's "why" fields)

- Walrus & Tatum integration (30%): namespaced Walrus memories drive the core loop;
  Tatum gRPC stream + backfill drives live settlement.
- Technical quality (30%): TypeScript end-to-end, 37 unit tests, deterministic parser,
  paced/deduped memory writes, restart-proof architecture (memory = source of truth).
- Creativity (20%): split rules as inspectable, correctable memories; memory switch A/B
  on one screen; learning chart from real decisions.
- Presentation (20%): 90-second demo, blog post, honest-limits page, labelled simulation.
