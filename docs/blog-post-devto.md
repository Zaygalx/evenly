# One correction and it learned: building Evenly, a money app with a memory

The argument is always the same. "I paid for groceries yesterday." "No, you did not." Nobody has proof, everybody is annoyed, and the split never gets settled.

So I built the proof.

Evenly is a shared money app for couples and roommates. You log a purchase in one line, the way you would type it to a friend: "groceries 4200 paid by Adaeze". Evenly works out the split, remembers how your household likes to split things, and when someone pays someone back, it watches the blockchain and marks the debt Settled by itself.

No spreadsheets. No screenshots of bank alerts. No "trust me bro" accounting.

## The memory is the product

Evenly stores its household memory on Walrus Memory, one namespace per household. Every purchase, every accepted split and every correction becomes a memory. Split decisions are proposed from recall of those memories, never from a hidden settings table, and every proposal carries a Why panel that cites the memories behind it, blob ids included.

Walrus is the only source of truth. The server keeps a local cache, nothing more. There is a restart proof page in the app that wipes the local state completely and rebuilds the household from Walrus alone. If the memories are not there, the household does not come back. That is the point of the proof, and it passes: wipe, rebuild, balances identical.

Money movement is detected with Tatum. When a household is ready to settle, Evenly computes who owes whom in USDC on Sui. The members pay from their own wallets. Evenly never holds keys and never moves money. A Tatum checkpoint stream plus a polling backfill watches for the transfers, matches them against the pending settlements, writes the match back to Walrus as a new memory, and the app flips the settlement to Settled with the transaction digest attached.

Ownership is handled with Walrus Memory delegate keys. Each member can hold a delegate key. The private key is shown exactly once and never stored. Revoking a member shows an honest "revoking" state for about 30 seconds, because verification caching means removal is not instant, and the app refuses to pretend otherwise.

## Then I let agents move in

I wanted to know whether the learning loop actually works, so I built agent test households. Automated agents played household members. Each agent had hidden split rules, for example groceries at 70 30 and rent at 50 50, and logged realistic purchases through the same public API a person would use. The app only ever saw the purchases and the agents' accepts and corrections. Nothing about the learning was scripted.

The results, all of it on Walrus mainnet:

- 150 memories written across four agent test households.
- 48 purchases logged. 42 proposals accepted as they were. 6 corrected.
- Every correction happened on the first day, in a category where the hidden rule differed from an equal split. No category ever needed a second correction.
- 6 settlements created from the learned balances, and 6 of 6 detected live through Tatum when the agents paid each other in real USDC on Sui mainnet. One of them: Chidi paid Adaeze 0.37 USDC, transaction B3eqxfhVy5STuvnKTYLfh3xkrpxHoZjMgsFnYFb5KkMo, flipped to Settled by the app with no human touching it.

Then I ran a follow up test in a fifth household, in its own namespace, with two twists. About ten percent of the time an agent would override a good proposal for one purchase, just because. And on day three the hidden groceries rule quietly drifted from 50 50 to 70 30. Acceptance dipped for exactly one purchase. The first groceries proposal after the drift was corrected, the next one landed within two points of the new rule and was accepted, and it held for the rest of the run. Relearning took one correction.

## The test suite I did not know I had

The agents earned their keep. Driving real traffic through the learning loop and the settlement flow caught five real production bugs, all fixed and deployed:

1. Memory listing silently missed records. One semantic recall does not return everything, so fresh servers rebuilt households with expenses missing. Listing now sweeps once per record kind.
2. Rebuilt households marked every expense as accepted with its original proposed shares, so undecided proposals became impossible to decide and balances were wrong. Decision memories now restore the true status and shares.
3. Household settings, the exchange rate and the memory switch, were never written to Walrus, so fresh servers lost them and refused settlements. Settings now persist as memories.
4. Pending settlements were never written to Walrus at all. Only the server that created one knew it existed, so detection had nothing to match. Creation now writes a pending record and detection writes the settled one.
5. The settlement backfill queried a Sui JSON RPC method that Sui has retired. The gateway answered HTTP 404 and the backfill silently returned nothing. Backfill now reads the public Sui GraphQL indexer, with the Tatum stream as the live layer.

Checking the ownership flow live before publishing this post caught a sixth one: delegate key state lived only in one server's memory, so activating a key on a different server claimed the member had no key. Delegate state is now persisted to Walrus too.

An app that learns is only trustworthy if you can watch it learn and catch it being wrong. The agents let me do both before any real household trusted it.

## Honest limits

Some things Evenly does not do yet, said plainly. The full list lives on the app's Honest limits page.

- One correction replaces a rule. That is what makes learning fast, and it means a one off purchase where someone generously covers everything could teach the wrong rule until the next correction fixes it.
- Results come from agent test households, not from a large human user study. Agents are tidy. People are not, and the parser will meet messier one liners than my agents ever typed.
- Real households, meaning households where a person logged purchases themselves: zero so far. The agent households are labelled in the app, in the report and in every chart, and their data is never merged with real households.

## Try it

The app is live at https://evenly-gamma-three.vercel.app and the code is public at https://github.com/Zaygalx/evenly. Start a household, log one line, correct one split, and watch the next proposal change its mind. Then open the restart proof page and try to kill it. It rebuilds. That rebuild is the whole pitch: your household's memory of money, kept where nobody can quietly rewrite it.
