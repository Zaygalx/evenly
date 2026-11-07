# X post drafts, Evenly launch (Nov 2026)

X is not connected to Muse, so these are for manual posting.
Before posting: publish the blog first, then replace BLOG_URL below with the
final published dev.to link (the draft link has a temp slug that changes).

## Short version (single post)

The roommate money argument is over.

I built Evenly. Log one line, it learns how your household splits, and when a USDC payback lands it marks itself Settled.

Memory: @WalrusFoundation
Detection: @Tatum_io

Learned the split in one correction.

BLOG_URL

Video hook line, add when the demo video is attached:
Watch the argument die in five seconds. 👇

## Thread version (5 posts)

1/ The argument is dead.
"I paid yesterday." "No you did not."
I built Evenly so the receipts argue instead of the roommates. One line per purchase, and the app remembers how your household splits.
BLOG_URL

2/ How it remembers: every purchase, accept and correction becomes a memory on @WalrusFoundation, one namespace per household. Proposals come from recall, and the Why panel cites the exact memories behind a split, blob ids included. No black box.

3/ How it settles: Evenly works out who owes whom in USDC on Sui. Your flatmate pays from their own wallet. @Tatum_io watches the chain and flips the debt to Settled with the real transaction digest. The app never holds keys and never moves money.

4/ I tested it with agent households. Automated agents played the members. 48 purchases, 42 accepted, 6 corrected, and every correction taught it something. When the groceries rule quietly changed from 50 50 to 70 30, it relearned in one correction.

5/ Honest bits: the agents caught five real bugs before any human trusted the app. Real households so far: zero, and the test data is labelled everywhere.
Try it: https://evenly-gamma-three.vercel.app
Code: https://github.com/Zaygalx/evenly
