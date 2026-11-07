export default function LimitsPage() {
  return (
    <main>
      <h1>Honest limits</h1>
      <p className="lede">What Evenly really does today, and what it does not do yet. We label anything simulated, always.</p>

      <section className="card">
        <h2>Phase 1 (this build)</h2>
        <ul className="clean">
          <li><strong>Real:</strong> household creation, invite links, member Sui addresses, one-line logging with a deterministic parser (no AI), equal splits, balances.</li>
          <li><strong>Not yet:</strong> memory-driven splits (Phase 2), live on-chain settlement detection (Phase 3), delegate-key ownership and revoke (Phase 4).</li>
          <li><strong>Storage:</strong> Phase 1 state lives in server memory and is lost on restart. That is exactly the problem Phase 2 (Walrus Memory as source of truth) and the Phase 4 restart proof address. Do not treat Phase 1 as durable.</li>
          <li><strong>Identity:</strong> Phase 1 "joining" is name + Sui address, with no wallet signature check yet. Anyone with an invite link can join, so treat invite links as secrets.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Money safety</h2>
        <ul className="clean">
          <li>Evenly never asks for a private key or seed phrase, in the app or in chat.</li>
          <li>Settlement amounts in the demo are small mainnet USDC amounts only.</li>
          <li>The app detects settlements; it does not move your money for you in Phases 1–2.</li>
        </ul>
      </section>

      <p><a href="/">← Back to Evenly</a></p>
    </main>
  );
}
