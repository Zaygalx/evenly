# X post drafts, Evenly launch (Nov 2026)

X is not connected to Muse, so these are for manual posting.
Format follows the user's own long form posts: title line, problem,
mechanics, measured numbers with arrows, the honest failure list,
credits, then the Team and Project footer block.
Blog is published: https://dev.to/zaygalx/one-correction-and-it-learned-building-evenly-a-money-app-with-a-memory-150i

## Main post (long form)

Evenly: the money app that remembers how your household splits, so the argument never starts.

Every flat has the same fight. "I paid for groceries yesterday." "No you did not." Nobody kept receipts, nobody can prove anything, and the person who paid quietly stops paying. So nothing gets split and everyone resents everyone.

You log a purchase in one line. Groceries 4200 paid by Adaeze. Evenly proposes the split from your household's own memory on @WalrusFoundation, cites the exact memories behind the proposal, and learns when you correct it. When it is time to settle, it works out who owes whom in USDC on Sui, and @Tatum_io watches the chain and flips the debt to Settled with the real transaction digest. It never holds keys. It never moves money.

Measured live on mainnet, with automated agents playing the household members:

memories written to Walrus -> 150
purchases logged -> 48
proposals accepted as they were -> 42
corrections -> 6, every one on day one
settlements detected live -> 6 of 6

Then I changed a rule behind its back, groceries from 50 50 to 70 30. It dipped for exactly one purchase and relearned in one correction.

The part I care about most is what the test caught before any human trusted it.

pending settlements were never written to Walrus, so only one server knew they existed

the settlement backfill was calling an API Sui had retired, and it answered 404 in silence

rebuilt households marked every expense as accepted, so open proposals could never be decided

All five bugs are fixed, and the fixes are why the numbers above mean anything. A demo that has never failed in public is a demo that has not been tested.

Real households so far: zero. The agents are labelled as agents everywhere, and their data is never merged with real households. I would rather submit a true zero than a decorated one.

Built with @WalrusFoundation for memory and @Tatum_io for settlement detection.

Team: Team Zay
Project: Evenly
Repo: github.com/Zaygalx/evenly
Demo: evenly-gamma-three.vercel.app
Blog: dev.to/zaygalx/one-correction-and-it-learned-building-evenly-a-money-app-with-a-memory-150i

## Short version (single post, if not posting long form)

The roommate money argument is over.

I built Evenly. Log one line, it learns how your household splits, and when a USDC payback lands it marks itself Settled.

Memory: @WalrusFoundation
Detection: @Tatum_io

Learned the split in one correction.

https://dev.to/zaygalx/one-correction-and-it-learned-building-evenly-a-money-app-with-a-memory-150i

Video hook line, add when the demo video is attached:
Watch the argument die in five seconds. 👇
