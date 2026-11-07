"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [creatorName, setCreatorName] = useState("");
  const [creatorSuiAddress, setCreatorSuiAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/households", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, currency, creatorName, creatorSuiAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      try {
        localStorage.setItem(`evenly:member:${data.household.id}`, data.member.id);
      } catch { /* private mode */ }
      router.push(`/h/${data.household.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Evenly</h1>
      <p className="lede">
        Shared money for couples and roommates. Log a purchase in one line — Evenly learns how
        your household splits things, so you never explain a split twice.
      </p>

      <form className="card" onSubmit={create} aria-label="Create a household">
        <h2>Create your household</h2>
        {error && <div className="notice error" role="alert">{error}</div>}
        <label htmlFor="hh-name">Household name</label>
        <input id="hh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada & Ben's flat" required />
        <label htmlFor="hh-currency">Currency you log in</label>
        <select id="hh-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="NGN">NGN — Nigerian naira</option>
          <option value="USD">USD — US dollar</option>
          <option value="EUR">EUR — Euro</option>
          <option value="GBP">GBP — British pound</option>
        </select>
        <label htmlFor="me-name">Your name</label>
        <input id="me-name" value={creatorName} onChange={(e) => setCreatorName(e.target.value)} placeholder="Ada" autoComplete="name" required />
        <label htmlFor="me-sui">Your Sui address</label>
        <input id="me-sui" value={creatorSuiAddress} onChange={(e) => setCreatorSuiAddress(e.target.value)} placeholder="0x…" className="mono" required />
        <p className="muted small">Settlements are paid to this address in USDC on Sui. We never ask for a private key.</p>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create household"}</button>
      </form>

      <div className="card">
        <h2>How it works</h2>
        <ul className="clean">
          <li><strong>1. Log in one line.</strong> <span className="muted">“groceries 12000 paid by Ada” — that's the whole form.</span></li>
          <li><strong>2. Evenly proposes the split</strong> <span className="muted">from what it remembers about your household, and shows its working.</span></li>
          <li><strong>3. Settle in USDC on Sui.</strong> <span className="muted">The app watches the chain and flips to Settled live.</span></li>
        </ul>
      </div>

      <p className="muted small">
        Hackathon build (Total Recall — Tatum × Walrus Memory). Memory, live settlement,
        delegate-key ownership and the restart proof are all built in; anything simulated
        is labelled. See <a href="/limits">honest limits</a>.
      </p>
    </main>
  );
}
