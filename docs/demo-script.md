# Evenly — 90-second demo script

Setup before recording: Walrus + Tatum keys configured in env; demo household seeded
(`npx tsx scripts/seed-memories.ts <householdId>`) or pre-taught with one groceries
correction; a second phone/wallet ready with a small USDC balance on Sui; household
rate set (1 USDC = 1500 NGN). Record on the phone — Evenly is mobile-first.

| Time | Screen | Say / do |
|---|---|---|
| 0:00–0:10 | Household page | "This is Evenly. Shared money for couples and roommates — and it remembers how your household splits things." |
| 0:10–0:25 | Log box | Type `groceries 12000 paid by Ada`, tap Log it. "One line. No forms. A deterministic parser reads the amount, who paid, and the category." |
| 0:25–0:40 | Proposal + Why panel | Open *Why this split?* "It didn't split equally — it proposed 70/30, because last time we corrected groceries to 70/30. Here's the exact Walrus memory it used, blob id and all. I corrected it once. It never asked again." Tap **Accept split**. |
| 0:40–0:50 | Memory switch | Flip memory OFF, log `dining 8000 paid by Ben` → plain 50/50 equal split. Flip ON, note the proposal explanation changes. "Memory off: equal split. Memory on: our rules. Same app, one toggle — that's the difference memory makes." |
| 0:50–1:05 | Settle up | Show balances, tap **Create settlements from balances**. "Ben owes 5 USDC. He sends it from his wallet…" (send from second wallet) "…and Evenly watches Sui through Tatum's checkpoint stream — there: **Settled**, with the real transaction digest." |
| 1:05–1:20 | Learning chart + restart proof | Show the learning chart: "Acceptance without edits, by week — computed from our real decisions." Open the proof page, tap **Wipe & rebuild**. "Now the strongest claim: I delete all local state… and the household rebuilds itself entirely from Walrus Memory." |
| 1:20–1:30 | Closing | "Evenly: log in one line, split by memory, settle on-chain. Built on Walrus Memory and Tatum for Total Recall." |

Fallback if the live transfer is slow: use **Check the chain now** on camera and narrate the
backfill ("streams can't resume, so Evenly backfills — that's what just caught it").
Never use the simulated-transfer button in the recorded demo without saying it's simulated.
