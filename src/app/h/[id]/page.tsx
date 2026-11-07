"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Balance, DecisionEvent, Expense, Household, Member, Settlement } from "@/lib/types";
import { formatMinor } from "@/lib/money";
import { explorerLinkForBlob, explorerLinkForTx } from "@/lib/explorer";
import { formatUsdc } from "@/lib/settlement";

export interface HouseholdData {
  household: Household;
  members: Member[];
  expenses: Expense[];
  balances: Balance[];
  decisions: DecisionEvent[];
  settlements: Settlement[];
  memoryMode: "walrus" | "local-mock";
}

export default function HouseholdPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<HouseholdData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [line, setLine] = useState("");
  const [logError, setLogError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberSui, setMemberSui] = useState("");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [settleMsg, setSettleMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/households/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load this household.");
      setData(json as HouseholdData);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this household.");
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Live settlement feed: reload whenever the server reports a flip.
  const hasPending = (data?.settlements ?? []).some((s) => s.status === "pending");
  useEffect(() => {
    if (!hasPending) return;
    const source = new EventSource(`/api/households/${id}/settlements/stream`);
    source.addEventListener("settled", () => { void load(); });
    return () => source.close();
  }, [hasPending, id, load]);

  async function logExpense(e: React.FormEvent) {
    e.preventDefault();
    setLogging(true);
    setLogError(null);
    try {
      const res = await fetch(`/api/households/${id}/expenses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: line }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not log that.");
      setLine("");
      await load();
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Could not log that.");
    } finally {
      setLogging(false);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberError(null);
    try {
      const res = await fetch(`/api/households/${id}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: memberName, suiAddress: memberSui }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not add that member.");
      setMemberName("");
      setMemberSui("");
      await load();
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Could not add that member.");
    }
  }

  async function saveRate(e: React.FormEvent) {
    e.preventDefault();
    const major = Number(rateInput);
    if (!Number.isFinite(major) || major <= 0) { setSettleMsg("Enter a valid rate first."); return; }
    await fetch(`/api/households/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayPerUsdcMinor: Math.round(major * 100) }),
    });
    setRateInput("");
    await load();
  }

  async function createSettlements() {
    setSettleMsg(null);
    const res = await fetch(`/api/households/${id}/settlements`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) { setSettleMsg(json.error ?? "Could not create settlements."); return; }
    setSettleMsg(json.note ?? `Created ${json.settlements?.length ?? 0} pending settlement(s). Send the USDC from the debtor's wallet — Evenly watches the chain and flips them to Settled.`);
    await load();
  }

  async function checkSettlements(simulate: boolean) {
    setChecking(true);
    setSettleMsg(null);
    try {
      const res = await fetch(`/api/households/${id}/settlements/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ simulate }),
      });
      const json = await res.json();
      if (!res.ok) { setSettleMsg(json.error ?? "Check failed."); return; }
      setSettleMsg(
        json.settled?.length
          ? `${json.settled.length} settlement(s) flipped to Settled${json.simulated ? " (SIMULATED transfer)" : ""}.`
          : json.note ?? `Checked ${json.checkedTransfers ?? 0} on-chain transfer(s) — no match yet. Watcher: ${json.watcher?.status ?? "n/a"}.`,
      );
      await load();
    } finally {
      setChecking(false);
    }
  }

  async function toggleMemory(enabled: boolean) {
    await fetch(`/api/households/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memoryEnabled: enabled }),
    });
    await load();
  }

  async function decide(expense: Expense, action: "accept" | "correct") {
    setDeciding(expense.id);
    setDecisionError(null);
    try {
      let shares: { memberId: string; amountMinor: number }[] | undefined;
      if (action === "correct") {
        shares = expense.shares.map((s) => {
          const raw = corrections[`${expense.id}:${s.memberId}`];
          const major = raw === undefined ? s.amountMinor / 100 : Number(raw);
          return { memberId: s.memberId, amountMinor: Math.round(major * 100) };
        });
      }
      const res = await fetch(`/api/households/${id}/expenses/${expense.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, shares }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save that decision.");
      setCorrectingId(null);
      await load();
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : "Could not save that decision.");
    } finally {
      setDeciding(null);
    }
  }

  if (loadError) {
    return (
      <main>
        <h1>Household not found</h1>
        <div className="notice error" role="alert">{loadError}</div>
        <p><a href="/">Create a new household</a></p>
      </main>
    );
  }
  if (!data) return <main><p className="muted" aria-live="polite">Loading your household…</p></main>;

  const { household, members, expenses, balances } = data;
  const activeMembers = members.filter((m) => !m.revokedAt);
  const memberNameById = new Map(members.map((m) => [m.id, m.name]));
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${household.inviteToken}` : `/join/${household.inviteToken}`;

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <main>
      <h1>{household.name}</h1>
      <p className="lede">{activeMembers.length} member{activeMembers.length === 1 ? "" : "s"} · logging in {household.currency}</p>

      <section className="card" aria-label="Memory switch">
        <div className="row">
          <h2 style={{ margin: 0 }}>Memory</h2>
          <button
            className="secondary"
            role="switch"
            aria-checked={household.memoryEnabled}
            onClick={() => void toggleMemory(!household.memoryEnabled)}
          >
            {household.memoryEnabled ? "ON — splits learn" : "OFF — plain equal splits"}
          </button>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          {household.memoryEnabled
            ? "Splits are proposed from your household's memories, and every accept/correct teaches Evenly."
            : "Memory is off: every new split is a plain equal split and nothing is learned. Flip it on and compare the proposals."}
          {" "}Storage: {data.memoryMode === "walrus" ? "Walrus Memory (Mainnet)" : "SIMULATED local memory — Walrus keys not configured yet"}.
        </p>
      </section>

      <form className="card" onSubmit={logExpense} aria-label="Log an expense in one line">
        <h2>Log a purchase</h2>
        {logError && <div className="notice error" role="alert">{logError}</div>}
        <label htmlFor="line">One line</label>
        <input id="line" value={line} onChange={(e) => setLine(e.target.value)} placeholder="groceries 12000 paid by Ada" autoComplete="off" />
        <button className="primary" type="submit" disabled={logging || !line.trim()}>{logging ? "Logging…" : "Log it"}</button>
      </form>

      <section className="card" aria-label="Balances">
        <h2>Balances</h2>
        {balances.length === 0 ? (
          <p className="muted">No members yet.</p>
        ) : (
          <ul className="clean">
            {balances.map((b) => (
              <li key={b.memberId} className="row">
                <span>{memberNameById.get(b.memberId) ?? "Member"}</span>
                <span className={`amount ${b.netMinor > 0 ? "positive" : ""}`}>
                  {b.netMinor === 0 ? "settled" : `${b.netMinor > 0 ? "is owed" : "owes"} ${household.currency} ${formatMinor(Math.abs(b.netMinor))}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-label="Settle up">
        <h2>Settle up in USDC</h2>
        {settleMsg && <div className="notice info" role="status">{settleMsg}</div>}
        {!household.displayPerUsdcMinor ? (
          <form onSubmit={saveRate}>
            <p className="muted small">Settlements are paid in USDC on Sui. Tell Evenly your rate so amounts are honest — it never invents an exchange rate.</p>
            <label htmlFor="rate">1 USDC = how many {household.currency}?</label>
            <input id="rate" inputMode="decimal" value={rateInput} onChange={(e) => setRateInput(e.target.value)} placeholder="1500" required />
            <button className="primary" type="submit">Save rate</button>
          </form>
        ) : (
          <>
            <p className="muted small">Rate: 1 USDC = {household.currency} {formatMinor(household.displayPerUsdcMinor)}.</p>
            <button className="primary" onClick={() => void createSettlements()}>Create settlements from balances</button>
          </>
        )}
        {data.settlements.length > 0 && (
          <ul className="clean" style={{ marginTop: 12 }}>
            {data.settlements.map((s) => (
              <li key={s.id}>
                <div className="row">
                  <span>{memberNameById.get(s.fromMemberId)} → {memberNameById.get(s.toMemberId)}</span>
                  <span className="amount">{formatUsdc(s.amountUsdcMinor)} USDC</span>
                </div>
                <div className="muted small">
                  {s.status === "settled" ? (
                    <>✅ Settled{s.settledAt ? ` ${new Date(s.settledAt).toLocaleString()}` : ""} · tx {s.digest ? <a href={explorerLinkForTx(s.digest)} target="_blank" rel="noreferrer" className="mono">{s.digest.slice(0, 18)}…</a> : "—"}</>
                  ) : (
                    <>⏳ Waiting for the transfer on Sui… send exactly this amount to {memberNameById.get(s.toMemberId)}'s address.</>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {data.settlements.some((s) => s.status === "pending") && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button className="secondary" disabled={checking} onClick={() => void checkSettlements(false)}>{checking ? "Checking…" : "Check the chain now"}</button>
            {data.memoryMode === "local-mock" && (
              <button className="secondary" disabled={checking} onClick={() => void checkSettlements(true)}>Simulate the transfer (local demo only)</button>
            )}
          </div>
        )}
      </section>

      <section className="card" aria-label="Expenses">
        <h2>Expenses</h2>
        {decisionError && <div className="notice error" role="alert">{decisionError}</div>}
        {expenses.length === 0 ? (
          <p className="muted">Nothing logged yet. Your first line above starts the household's memory.</p>
        ) : (
          <ul className="clean">
            {expenses.map((exp) => (
              <li key={exp.id}>
                <div className="row">
                  <span><strong>{exp.description}</strong> <span className="tag">{exp.category}</span> <span className="tag">{exp.status}</span></span>
                  <span className="amount">{household.currency} {formatMinor(exp.amountMinor)}</span>
                </div>
                <div className="muted small">
                  Paid by {memberNameById.get(exp.paidByMemberId) ?? "someone"} ·{" "}
                  {exp.shares.map((s) => `${memberNameById.get(s.memberId) ?? "?"} ${formatMinor(s.amountMinor)}`).join(" · ")}
                </div>
                {exp.proposal && (
                  <details style={{ marginTop: 6 }}>
                    <summary>Why this split?</summary>
                    <p className="small" style={{ margin: "6px 0" }}>{exp.proposal.explanation}</p>
                    {exp.proposal.usedMemories.length === 0 ? (
                      <p className="muted small">No memories were used for this proposal.</p>
                    ) : (
                      <ul className="clean">
                        {exp.proposal.usedMemories.map((m, i) => {
                          const link = explorerLinkForBlob(m.blobId);
                          return (
                            <li key={i} className="small">
                              <span className="tag">{m.kind}</span>{" "}
                              <span className="mono">{m.text}</span>
                              <br />
                              <span className="muted">blob: </span>
                              {link ? <a href={link} target="_blank" rel="noreferrer" className="mono">{m.blobId}</a> : <span className="mono">{m.blobId} (local, not on-chain)</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </details>
                )}
                {exp.status === "proposed" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button className="secondary" disabled={deciding === exp.id} onClick={() => void decide(exp, "accept")}>
                      {deciding === exp.id ? "Saving…" : "Accept split"}
                    </button>
                    <button className="secondary" disabled={deciding === exp.id} onClick={() => setCorrectingId(correctingId === exp.id ? null : exp.id)}>
                      Correct it
                    </button>
                  </div>
                )}
                {correctingId === exp.id && (
                  <div style={{ marginTop: 8 }}>
                    {exp.shares.map((s) => (
                      <div key={s.memberId}>
                        <label htmlFor={`corr-${exp.id}-${s.memberId}`}>{memberNameById.get(s.memberId)} pays ({household.currency})</label>
                        <input
                          id={`corr-${exp.id}-${s.memberId}`}
                          inputMode="decimal"
                          defaultValue={(s.amountMinor / 100).toString()}
                          onChange={(e) => setCorrections((c) => ({ ...c, [`${exp.id}:${s.memberId}`]: e.target.value }))}
                        />
                      </div>
                    ))}
                    <button className="primary" disabled={deciding === exp.id} onClick={() => void decide(exp, "correct")}>
                      {deciding === exp.id ? "Saving…" : "Save correction — Evenly will remember it"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-label="Members and invite">
        <h2>Members</h2>
        <ul className="clean">
          {members.map((m) => (
            <li key={m.id}>
              <div className="row"><span>{m.name}{m.revokedAt ? " (removed)" : ""}</span></div>
              <div className="mono muted">{m.suiAddress}</div>
            </li>
          ))}
        </ul>
        <label htmlFor="invite">Invite link — share it with your household</label>
        <input id="invite" readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
        <button className="secondary" type="button" onClick={copyInvite} style={{ marginTop: 10 }}>{copied ? "Copied ✓" : "Copy invite link"}</button>

        <form onSubmit={addMember} aria-label="Add a member directly" style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: "1rem" }}>Add a member directly</h2>
          {memberError && <div className="notice error" role="alert">{memberError}</div>}
          <label htmlFor="m-name">Name</label>
          <input id="m-name" value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Ben" required />
          <label htmlFor="m-sui">Their Sui address</label>
          <input id="m-sui" value={memberSui} onChange={(e) => setMemberSui(e.target.value)} placeholder="0x…" className="mono" required />
          <button className="primary" type="submit">Add member</button>
        </form>
      </section>

      <p className="muted small">
        Memory mode: {data.memoryMode === "walrus" ? "Walrus Memory on Mainnet — the source of truth." : "SIMULATED local memory (Walrus keys not configured). Local app state is a cache only."}{" "}
        <a href="/limits">Honest limits</a> · <a href={`/proof/${id}`}>Restart proof</a>
      </p>
    </main>
  );
}
