import { Logo } from "@/components/Logo";

export default function LimitsPage() {
  return (
    <main>
      <div className="brandbar"><Logo /><a href="/" className="muted small">Home</a></div>
      <h1>Honest limits</h1>
      <p className="lede">What Evenly really does, and what it does not do. Anything simulated is labelled, in the app and here.</p>

      <section className="card">
        <h2>Memory (Walrus)</h2>
        <ul className="clean">
          <li><strong>Real when configured:</strong> with a Walrus Memory an account id and a delegate key in the environment, all memories are written to Walrus Memory on Mainnet via the MemWal SDK (one namespace per household), paced to respect the relayer rate limits. The app local state is only a cache, and the restart proof rebuilds from memory alone.</li>
          <li><strong>Demo mode otherwise:</strong> without keys, Evenly runs on a local in-process memory that is labelled "DEMO" everywhere it matters. It demonstrates the learning loop; it is not Walrus and its blob ids are not on-chain.</li>
          <li><strong>Recall is semantic:</strong> the split engine reads structured memories back from recall results. Very new memories can take a moment to become recallable on the real relayer; Evenly always waits for a write to complete before reading back.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Settlement (Tatum + Sui)</h2>
        <ul className="clean">
          <li><strong>Real when configured:</strong> with a Tatum API key, a server-side gRPC checkpoint stream watches Sui, with a polling backfill on every reconnect (streams start at the tip and cannot resume, so the backfill is what makes detection reliable).</li>
          <li><strong>Inactive without a key:</strong> settlement checks plainly report that on-chain detection is off. Nothing is ever marked settled without an observed transfer (or an explicitly simulated one in local demo mode, labelled as simulated).</li>
          <li><strong>FX:</strong> converting household balances (e.g. NGN) into USDC uses a rate the household sets itself. Evenly never fetches or invents an exchange rate.</li>
          <li><strong>Matching tolerance:</strong> a transfer settles a settlement when it is Circle USDC, from the debtor to the creditor, and at least 99% of the expected amount.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Ownership</h2>
        <ul className="clean">
          <li>Delegate keys are generated with the real SDK, and only public keys are stored. A member private key is shown once, to them, and never persisted.</li>
          <li>Adding or removing delegate keys on chain is an owner signed action in the Walrus Memory account. Evenly records the state and shows it, but cannot sign as the owner.</li>
          <li>Revocation can lag ~30 seconds due to verification caching. The UI shows "revoking" until the lag passes. We do not pretend removal is instant.</li>
          <li>Phase-1 identity still applies: joining is a name and a Sui address with no wallet signature check, so treat invite links as secrets.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Agent test households</h2>
        <ul className="clean">
          <li>Four households in this app are agent test households, marked in their name and with an "Agent test household" badge. Automated agents played household members: agents with hidden split rules logged purchases and judged proposals, so we can measure whether Evenly learns.</li>
          <li>Agent test households are real households in every technical sense. Their memories are on Walrus Mainnet and their proposals come from the same recall as yours. Only the people are agents.</li>
          <li>Every settlement in the agent test households was a real USDC transfer on Sui mainnet detected live through Tatum, using throwaway wallets and tiny amounts.</li>
          <li>Learning results come from agent test households, not from a large human user study.</li>
          <li>Results are reported separately in the agent test report and are never merged with real household data, in the report or in any chart. The provenance marker stays on every household and every record.</li>
          <li>Real households (a person logging their own purchases): 0 so far. Agent test households: 4. When a person starts their own household, it counts only in the real number.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Money safety</h2>
        <ul className="clean">
          <li>Evenly never asks for a private key or seed phrase, in the app or in chat.</li>
          <li>Evenly detects settlements; it never moves your money.</li>
          <li>Demo amounts should stay small, because these are real mainnet transfers when you settle for real.</li>
        </ul>
      </section>

      <p><a href="/">← Back to Evenly</a></p>
    </main>
  );
}
