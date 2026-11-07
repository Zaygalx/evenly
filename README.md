# Evenly

Shared money for couples and roommates. Log a purchase in **one line** — Evenly learns your
household's split rules from **Walrus Memory**, so a split never has to be explained twice.
Settling up is a **USDC transfer on Sui**, and the app flips to *Settled* live by watching the
chain through **Tatum**.

Built for the **Total Recall** hackathon (Tatum × Walrus Memory).

## Status

- **Phase 1 (done):** Next.js + TypeScript app, households with invite links, member Sui
  addresses, one-line expense logging with a deterministic parser (no LLM), equal splits,
  balances, honest-limits page, unit tests.
- Phase 2: Walrus Memory loop (recall → propose → accept/correct → remember), Why panel, memory switch.
- Phase 3: live settlement via Tatum Sui gRPC checkpoint stream + polling backfill.
- Phase 4: delegate keys, revoke, restart proof, learning chart.
- Phase 5: polish, README/blog/demo/submission pack.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests (parser, money, address validation)
npm run build   # production build
```

## How Phase 1 works

1. **Create a household** on the home page (your name + your Sui address). You get an
   invite link like `/join/<token>`.
2. **Household page** (`/h/<id>`): log expenses in one line — try
   `groceries 12000 paid by Ada`. The parser is deterministic and tested; it finds the
   amount, the payer (a household member), the description, and a category.
3. **Balances** update instantly with an equal split (Phase 1 default, labelled in the UI).

## Architecture (target)

```
Phone browser (Next.js UI)
        │  API routes (this repo)
        ├── Walrus Memory (MemWal SDK, one namespace per household) — source of truth
        ├── Split engine — proposals from recalled memories; accepts/corrections become memories
        └── Tatum — Sui gRPC SubscribeCheckpoints stream + polling backfill
                → matches USDC transfers to pending settlements → live "Settled" flip
Local state is a cache only. Wiping it and rebuilding from Walrus is the Phase 4 restart proof.
```

## Environment variables

See `.env.example`. Set real values in **Vercel → Project → Settings → Environment
Variables**. Secrets are never committed, and Evenly never asks for a private key.

## Honest limits

See the in-app `/limits` page — it is kept current per phase and labels anything simulated.
