"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";

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
    <div className="landing">
      <div className="lp-container">
        <header className="lp-header">
          <Logo size={42} />
          <nav className="lp-nav" aria-label="Landing page">
            <a href="#how">How it works</a>
            <a href="#built">Built on</a>
            <a href="/limits">Honest limits</a>
          </nav>
          <a className="btn-join" href="#create">Join with invite link</a>
        </header>

        <section className="hero">
          <div className="rise">
            <h1>Shared money that <span className="hl">remembers</span> how you split it.</h1>
            <p className="sub">
              Evenly is the shared money app for couples and roommates. Log a purchase in one line,
              and Evenly proposes the split from what your household has taught it. No spreadsheets,
              no awkward maths, no explaining the same split twice.
            </p>
            <div className="trust-chips">
              <span className="trust-chip"><span className="dot" />Memory on Walrus Mainnet</span>
              <span className="trust-chip"><span className="dot apricot" />Settles in USDC on Sui</span>
              <span className="trust-chip"><span className="dot" />Live chain watching via Tatum</span>
            </div>
            <div className="hero-cta">
              <a className="btn-primary-lg" href="#create">Create your household</a>
              <a className="btn-secondary-lg" href="#how">See how it works</a>
            </div>
          </div>

          <div className="preview-wrap" aria-label="Example of the Evenly app">
            <div className="preview-card">
              <span className="example-tag">Example</span>
              <div className="row" style={{ alignItems: "center" }}>
                <strong>Ada and Ben</strong>
                <span className="avatars">
                  <span className="avatar" style={{ background: "#0e7a5f" }}>A</span>
                  <span className="avatar" style={{ background: "#c96f2e" }}>B</span>
                </span>
              </div>
              <div className="typed-line">groceries 12000 paid by Ada<span className="cursor" aria-hidden /></div>
              <div className="row">
                <span><strong>Groceries</strong> <span className="tag apricot">proposed split</span></span>
                <span className="big-amount">NGN 12,000</span>
              </div>
              <ul className="clean">
                <li className="row"><span>Ada</span><span className="amount">NGN 9,600</span></li>
                <li className="row"><span>Ben</span><span className="amount">NGN 2,400</span></li>
              </ul>
              <details open>
                <summary>Why this split</summary>
                <ul className="clean">
                  <li className="small"><span className="tag green">rule</span> <span className="mono">Groceries split 80 and 20 in favour of Ada, who does the food shopping.</span></li>
                  <li className="small"><span className="tag amber">correction</span> <span className="mono">Rent stays 50 and 50, corrected by Ben on 2 November.</span></li>
                </ul>
              </details>
              <p style={{ marginBottom: 0, marginTop: 12 }}>
                <span className="settled-badge"><span className="tick" aria-hidden>✓</span>Rent settled in USDC</span>{" "}
                <span className="muted small mono">tx 9f3k…e21a</span>
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section" id="create" aria-label="Create your household">
          <div className="create-grid">
            <div>
              <h2 className="lp-h">Start your household in a minute.</h2>
              <p className="lp-sub">
                Name it, add yourself, and share the invite link with your people. Your first logged
                purchase starts the memory, and every split after that gets easier.
              </p>
              <p className="muted">
                Joining a household instead? Your invite link takes you straight in.
                There is no form to fill when someone invites you.
              </p>
              <div className="lock-note">
                <span className="lock" aria-hidden>🔒</span>
                <span>Settlements are paid to your Sui address in USDC. We never ask for a private key or a seed phrase, ever.</span>
              </div>
            </div>

            <form className="card" onSubmit={create} aria-label="Create a household">
              <h2>Create your household</h2>
              {error && <div className="notice error" role="alert">{error}</div>}
              <label htmlFor="hh-name">Household name</label>
              <input id="hh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada and Ben, flat 4" required />
              <label htmlFor="hh-currency">Currency you log in</label>
              <select id="hh-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="NGN">NGN, Nigerian naira</option>
                <option value="USD">USD, US dollar</option>
                <option value="EUR">EUR, Euro</option>
                <option value="GBP">GBP, British pound</option>
              </select>
              <label htmlFor="me-name">Your name</label>
              <input id="me-name" value={creatorName} onChange={(e) => setCreatorName(e.target.value)} placeholder="Ada" autoComplete="name" required />
              <label htmlFor="me-sui">Your Sui address</label>
              <input id="me-sui" value={creatorSuiAddress} onChange={(e) => setCreatorSuiAddress(e.target.value)} placeholder="0x…" className="mono" required />
              <button className="primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create household"}</button>
            </form>
          </div>
        </section>

        <section className="lp-section" id="how" aria-label="How it works">
          <h2 className="lp-h">How it works</h2>
          <p className="lp-sub">Three steps, and the second one gets smarter every time you use it.</p>
          <div className="steps">
            <div className="step-card">
              <span className="step-ico" aria-hidden>✍️</span>
              <p className="step-num">Step 1</p>
              <h3>Log in one line</h3>
              <p>Type what happened, the way you would text it. “Groceries 12000 paid by Ada” is the whole form, no categories to hunt for.</p>
            </div>
            <div className="step-card">
              <span className="step-ico" aria-hidden>🧠</span>
              <p className="step-num">Step 2</p>
              <h3>Evenly remembers and proposes</h3>
              <p>Every accept and every correction becomes a memory. The next similar purchase arrives with the split already proposed, and the reasons shown.</p>
            </div>
            <div className="step-card">
              <span className="step-ico" aria-hidden>💸</span>
              <p className="step-num">Step 3</p>
              <h3>Settle in USDC, watch it flip</h3>
              <p>Whoever owes sends USDC on Sui. Evenly watches the chain live and flips the settlement to Settled the moment the transfer lands.</p>
            </div>
          </div>
        </section>

        <section className="lp-section" aria-label="Memory on and off compared">
          <h2 className="lp-h">Memory changes the maths</h2>
          <p className="lp-sub">The same purchase, split two ways. Memory off splits down the middle. Memory on remembers your house rules.</p>
          <div className="ba-grid">
            <div className="ba-card">
              <div className="row">
                <strong>Groceries, NGN 12,000</strong>
                <span className="tag amber">Memory off</span>
              </div>
              <ul className="clean">
                <li className="row"><span>Ada</span><span className="amount">NGN 6,000</span></li>
                <li className="row"><span>Ben</span><span className="amount">NGN 6,000</span></li>
              </ul>
              <p className="muted small" style={{ marginBottom: 0 }}>A plain equal split, every time, whatever the purchase.</p>
            </div>
            <div className="ba-card on">
              <div className="row">
                <strong>Groceries, NGN 12,000</strong>
                <span className="tag green">Memory on</span>
              </div>
              <ul className="clean">
                <li className="row"><span>Ada</span><span className="amount">NGN 9,600</span></li>
                <li className="row"><span>Ben</span><span className="amount">NGN 2,400</span></li>
              </ul>
              <p className="muted small" style={{ marginBottom: 0 }}>Split 80 and 20, because that is what your household taught Evenly about groceries.</p>
            </div>
          </div>
        </section>

        <section className="lp-section" id="built" aria-label="Built on">
          <h2 className="lp-h">Built on</h2>
          <p className="lp-sub">Real infrastructure, doing the parts it is best at.</p>
          <div className="built">
            <div className="built-card">
              <span className="built-badge">W</span>
              <div>
                <h3>Walrus Memory</h3>
                <p>Your split rules live as memories in a namespace only your household owns, on Mainnet.</p>
              </div>
            </div>
            <div className="built-card">
              <span className="built-badge apricot">S</span>
              <div>
                <h3>Sui</h3>
                <p>Settlements land as USDC transfers on Sui, quick to send and cheap to receive.</p>
              </div>
            </div>
            <div className="built-card">
              <span className="built-badge deep">T</span>
              <div>
                <h3>Tatum</h3>
                <p>A live checkpoint stream watches the chain, so payments are spotted the moment they land.</p>
              </div>
            </div>
          </div>
        </section>

        <footer className="lp-footer">
          <div className="foot-row">
            <Logo size={30} />
            <a href="/limits">Honest limits</a>
            <span className="muted small">A hackathon build for Total Recall, by Tatum and Walrus Memory.</span>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            The preview on this page is example data, labelled as such. Inside the app, anything simulated is labelled too, always.
          </p>
        </footer>
      </div>
    </div>
  );
}
