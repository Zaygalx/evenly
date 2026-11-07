"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Balance, Expense, Household, Member } from "@/lib/types";
import { formatMinor } from "@/lib/money";

interface HouseholdData {
  household: Household;
  members: Member[];
  expenses: Expense[];
  balances: Balance[];
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

  if (loadError) {
    return (
      <main>
        <h1>Household not found</h1>
        <div className="notice error" role="alert">{loadError}</div>
        <p><a href="/">Create a new household</a></p>
      </main>
    );
  }
  if (!data) {
    return <main><p className="muted" aria-live="polite">Loading your household…</p></main>;
  }

  const { household, members, expenses, balances } = data;
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
      <p className="lede">{members.length} member{members.length === 1 ? "" : "s"} · logging in {household.currency}</p>

      <form className="card" onSubmit={logExpense} aria-label="Log an expense in one line">
        <h2>Log a purchase</h2>
        {logError && <div className="notice error" role="alert">{logError}</div>}
        <label htmlFor="line">One line</label>
        <input id="line" value={line} onChange={(e) => setLine(e.target.value)} placeholder="groceries 12000 paid by Ada" autoComplete="off" />
        <button className="primary" type="submit" disabled={logging || !line.trim()}>{logging ? "Logging…" : "Log it"}</button>
        <p className="muted small">Phase 1 splits equally. From Phase 2, Evenly proposes splits from Walrus Memory and shows why.</p>
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

      <section className="card" aria-label="Expenses">
        <h2>Expenses</h2>
        {expenses.length === 0 ? (
          <p className="muted">Nothing logged yet. Your first line above starts the household's memory.</p>
        ) : (
          <ul className="clean">
            {expenses.map((exp) => (
              <li key={exp.id}>
                <div className="row">
                  <span><strong>{exp.description}</strong> <span className="tag">{exp.category}</span></span>
                  <span className="amount">{household.currency} {formatMinor(exp.amountMinor)}</span>
                </div>
                <div className="muted small">
                  Paid by {memberNameById.get(exp.paidByMemberId) ?? "someone"} · split {exp.shares.length} ways · {new Date(exp.createdAt).toLocaleString()}
                </div>
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

      <p className="muted small">Phase 1 build. Local state is a cache only — from Phase 2, Walrus Memory is the source of truth. <a href="/limits">Honest limits</a>.</p>
    </main>
  );
}
