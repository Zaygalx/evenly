"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Balance, DecisionEvent, Expense, Household, Member, Settlement } from "@/lib/types";
import { formatMinor } from "@/lib/money";
import { explorerLinkForBlob, explorerLinkForTx } from "@/lib/explorer";
import { formatUsdc } from "@/lib/settlement";
import { learningByWeek } from "@/lib/learning";
import { Logo } from "@/components/Logo";
import { parseExpenseLine } from "@/lib/parser";

type View = "overview" | "log" | "memory" | "settle" | "members";

interface MemoryItem { blobId: string; kind: string; text: string }

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
  const [delegateOnce, setDelegateOnce] = useState<{ memberId: string; privateKey: string; note: string } | null>(null);
  const [ownershipMsg, setOwnershipMsg] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [memories, setMemories] = useState<MemoryItem[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/households/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load this household.");
      setData(json as HouseholdData);
      try {
        const mres = await fetch(`/api/households/${id}/memories`);
        if (mres.ok) {
          const mjson = await mres.json();
          setMemories((mjson.memories ?? []) as MemoryItem[]);
        }
      } catch { /* memory list is decorative here; the timeline shows its own empty state */ }
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
    setSettleMsg(json.note ?? `Created ${json.settlements?.length ?? 0} pending settlement(s). Send the USDC from the wallet of whoever owes. Evenly watches the chain and flips them to Settled.`);
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
          : json.note ?? `Checked ${json.checkedTransfers ?? 0} on-chain transfers, no match yet. Watcher, ${json.watcher?.status ?? "n/a"}.`,
      );
      await load();
    } finally {
      setChecking(false);
    }
  }

  async function generateDelegate(member: Member) {
    setOwnershipMsg(null);
    const res = await fetch(`/api/households/${id}/members/${member.id}/delegate`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) { setOwnershipMsg(json.error ?? "Could not generate a delegate key."); return; }
    setDelegateOnce({ memberId: member.id, privateKey: json.privateKeyOnce, note: json.nextStep });
    await load();
  }

  async function activateDelegate(member: Member) {
    await fetch(`/api/households/${id}/members/${member.id}/delegate`, { method: "PATCH" });
    setOwnershipMsg("Marked active. (The owner still has to add the public key on chain in the Walrus Memory account. This toggle records that it was done.)");
    await load();
  }

  async function revokeMemberUi(member: Member) {
    setOwnershipMsg(null);
    const res = await fetch(`/api/households/${id}/members/${member.id}/revoke`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) { setOwnershipMsg(json.error ?? "Could not revoke that member."); return; }
    setOwnershipMsg(json.note);
    await load();
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
        <div className="brandbar"><Logo /></div>
        <h1>Household not found</h1>
        <div className="notice error" role="alert">{loadError}</div>
        <p><a href="/">Create a new household</a></p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="wide" aria-live="polite" aria-label="Loading your household">
        <div className="brandbar"><Logo /></div>
        <div className="skeleton" style={{ height: 34, width: "55%", marginBottom: 18 }} />
        <div className="grid">
          <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>
          <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>
          <div className="card span2"><div className="skeleton" style={{ height: 90 }} /></div>
        </div>
      </main>
    );
  }

  const { household, members, expenses, balances } = data;
  const activeMembers = members.filter((m) => !m.revokedAt);
  const memberNameById = new Map(members.map((m) => [m.id, m.name]));
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${household.inviteToken}?h=${household.id}` : `/join/${household.inviteToken}?h=${household.id}`;

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  const AVATAR_COLORS = ["#0e7a5f", "#c96f2e", "#3e6fb0", "#7a4b9e", "#b0526b", "#4d7c0f"];
  const avatarColor = (name: string) => AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const CAT_ICONS: Record<string, string> = { groceries: "🛒", food: "🍽️", dining: "🍽️", transport: "🚕", rent: "🏠", utilities: "💡", bills: "🧾", fun: "🎬", entertainment: "🎬", health: "💊", general: "🧺" };
  const catIcon = (category: string) => CAT_ICONS[category.toLowerCase()] ?? "🧺";

  const latestProposed = expenses.find((e) => e.status === "proposed") ?? null;
  const latestSettlement = data.settlements.length > 0 ? data.settlements[data.settlements.length - 1] : null;
  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  };
  const recentByDay: { label: string; items: Expense[] }[] = [];
  for (const exp of [...expenses].slice(0, 8)) {
    const label = dayLabel(exp.createdAt);
    const group = recentByDay.find((g) => g.label === label);
    if (group) group.items.push(exp); else recentByDay.push({ label, items: [exp] });
  }

  let preview: ReturnType<typeof parseExpenseLine> | null = null;
  if (line.trim() && activeMembers.length > 0) {
    try {
      const parsed = parseExpenseLine(line, activeMembers.map((m) => ({ id: m.id, name: m.name })));
      if (parsed.ok && parsed.amountMinor !== null) preview = parsed;
    } catch { preview = null; }
  }

  const timelineMemories = memories.filter((m) => ["rule", "correction", "acceptance", "settlement_habit"].includes(m.kind));
  const navItems: { key: View; label: string; icon: string }[] = [
    { key: "overview", label: "Overview", icon: "🏠" },
    { key: "log", label: "Log purchase", icon: "✍️" },
    { key: "memory", label: "Memory", icon: "🧠" },
    { key: "settle", label: "Settle up", icon: "💸" },
    { key: "members", label: "Members", icon: "👥" },
  ];

  return (
    <div>
      <header className="topbar">
        <a href="/" aria-label="Evenly home"><Logo /></a>
        <span className="hh-name">{household.name}</span>
        {(household.name.toLowerCase().includes("simulated") || household.name.toLowerCase().includes("agent test")) && <span className="tag amber">Agent test household</span>}
        <span className="avatars" aria-label={`${activeMembers.length} members`}>
          {activeMembers.slice(0, 5).map((m) => (
            <span key={m.id} className="avatar" style={{ background: avatarColor(m.name) }} title={m.name}>{initials(m.name)}</span>
          ))}
        </span>
        <span className="topbar-spacer" />
        <span className={`pill ${data.memoryMode === "walrus" ? "" : "sim"}`}>
          <span className="dot" />
          {data.memoryMode === "walrus" ? "Walrus Memory (Mainnet)" : "Demo memory"}
        </span>
        <button
          className="switch"
          role="switch"
          aria-checked={household.memoryEnabled}
          onClick={() => void toggleMemory(!household.memoryEnabled)}
        >
          Memory
          <span className="track" />
          <span className="muted small">{household.memoryEnabled ? "Learning" : "Off"}</span>
        </button>
      </header>

      <main className="wide">
        <div className="shell">
          <nav className="sidenav" aria-label="Household sections">
            {navItems.map((item) => (
              <button key={item.key} className={view === item.key ? "active" : ""} onClick={() => setView(item.key)} aria-current={view === item.key ? "page" : undefined}>
                <span className="nav-ico" aria-hidden>{item.icon}</span>{item.label}
              </button>
            ))}
            <a href="/limits"><span className="nav-ico" aria-hidden>📖</span>Honest limits</a>
            <a href={`/proof/${id}`}><span className="nav-ico" aria-hidden>♻️</span>Restart proof</a>
          </nav>

          <div className="content">
            {view === "overview" && (
              <div className="rise">
                <form className="card" onSubmit={logExpense} aria-label="Log an expense in one line">
                  <h2>Log a purchase</h2>
                  {logError && <div className="notice error" role="alert">{logError}</div>}
                  <div className="logbar">
                    <input id="line-top" value={line} onChange={(e) => setLine(e.target.value)} placeholder="groceries 12000 paid by Ada" autoComplete="off" aria-label="One line expense" />
                    <button className="primary" type="submit" disabled={logging || !line.trim()}>{logging ? "Logging…" : "Log it"}</button>
                  </div>
                  {preview && (
                    <div className="chip" role="status">
                      <span aria-hidden>{catIcon(preview.category)}</span>
                      <span>{preview.description}</span>
                      <span className="amount">{household.currency} {formatMinor(preview.amountMinor ?? 0)}</span>
                      <span className="muted">paid by {preview.payerName ?? "you"}</span>
                    </div>
                  )}
                  <p className="muted small" style={{ marginBottom: 0 }}>One line is the whole form. Evenly reads the item, the amount and who paid.</p>
                </form>

                <div className="grid">
                  <section className="card" aria-label="Balances">
                    <h2>Balances</h2>
                    {balances.length === 0 ? (
                      <div className="empty"><span className="empty-ico" aria-hidden>🤝</span><strong>No balances yet</strong>Add a member, then log your first purchase.</div>
                    ) : (
                      <ul className="clean">
                        {balances.map((b) => (
                          <li key={b.memberId} className="row">
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                              <span className="avatar sm" style={{ background: avatarColor(memberNameById.get(b.memberId) ?? "M") }}>{initials(memberNameById.get(b.memberId) ?? "M")}</span>
                              {memberNameById.get(b.memberId) ?? "Member"}
                            </span>
                            <span className={b.netMinor === 0 ? "muted" : b.netMinor > 0 ? "amount positive" : "amount negative"}>
                              {b.netMinor === 0 ? "all settled" : `${b.netMinor > 0 ? "is owed" : "owes"} ${household.currency} ${formatMinor(Math.abs(b.netMinor))}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button className="primary" onClick={() => setView("settle")}>Settle up</button>
                  </section>

                  <section className="card" aria-label="Proposed split">
                    <h2>Proposed split</h2>
                    {!latestProposed ? (
                      <div className="empty"><span className="empty-ico" aria-hidden>⚖️</span><strong>Nothing waiting</strong>Log a purchase and Evenly will propose how to split it.</div>
                    ) : (
                      <>
                        <div className="row">
                          <span><strong>{latestProposed.description}</strong> <span className="tag apricot">{latestProposed.category}</span></span>
                          <span className="big-amount">{household.currency} {formatMinor(latestProposed.amountMinor)}</span>
                        </div>
                        <ul className="clean">
                          {latestProposed.shares.map((s) => (
                            <li key={s.memberId} className="row">
                              <span>{memberNameById.get(s.memberId) ?? "Member"}</span>
                              <span className="amount">{household.currency} {formatMinor(s.amountMinor)}</span>
                            </li>
                          ))}
                        </ul>
                        {latestProposed.proposal && (
                          <details style={{ marginTop: 8 }}>
                            <summary>Why this split</summary>
                            <p className="small" style={{ margin: "6px 0" }}>{latestProposed.proposal.explanation}</p>
                            {latestProposed.proposal.usedMemories.length === 0 ? (
                              <p className="muted small">No memories were used for this proposal.</p>
                            ) : (
                              <ul className="clean">
                                {latestProposed.proposal.usedMemories.map((m, i) => {
                                  const link = explorerLinkForBlob(m.blobId);
                                  return (
                                    <li key={i} className="small">
                                      <span className="tag green">{m.kind}</span>{" "}
                                      <span className="mono">{m.text}</span>
                                      <br />
                                      {link ? <a className="blob-chip" href={link} target="_blank" rel="noreferrer">blob {m.blobId.slice(0, 16)}…</a> : <span className="blob-chip">{m.blobId} (local only)</span>}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </details>
                        )}
                        <button className="secondary" style={{ marginTop: 10 }} onClick={() => setView("log")}>Review and decide</button>
                      </>
                    )}
                  </section>

                  <section className="card" aria-label="Settlement status">
                    <h2>Settlement status</h2>
                    {!latestSettlement ? (
                      <div className="empty"><span className="empty-ico" aria-hidden>💸</span><strong>No settlements yet</strong>When someone owes, create a settlement and Evenly watches Sui for the payment.</div>
                    ) : (
                      <>
                        <div className="row">
                          <span>{memberNameById.get(latestSettlement.fromMemberId)} pays {memberNameById.get(latestSettlement.toMemberId)}</span>
                          <span className="big-amount">{formatUsdc(latestSettlement.amountUsdcMinor)} USDC</span>
                        </div>
                        <p style={{ marginBottom: 0 }}>
                          {latestSettlement.status === "settled" ? (
                            <span className="settled-badge"><span className="tick" aria-hidden>✓</span>Settled{latestSettlement.settledAt ? `, ${new Date(latestSettlement.settledAt).toLocaleString()}` : ""}</span>
                          ) : (
                            <span><span className="watching-dot" aria-hidden /> <strong>Pending.</strong> <span className="muted">Watching the chain for the transfer.</span></span>
                          )}
                        </p>
                        {latestSettlement.digest && (
                          <p className="small muted" style={{ marginBottom: 0 }}>Transaction{" "}
                            <a href={explorerLinkForTx(latestSettlement.digest)} target="_blank" rel="noreferrer" className="mono">{latestSettlement.digest.slice(0, 20)}…</a>
                          </p>
                        )}
                        <button className="secondary" style={{ marginTop: 12 }} onClick={() => setView("settle")}>Open settle up</button>
                      </>
                    )}
                  </section>

                  <section className="card" aria-label="Memory summary">
                    <h2>Memory</h2>
                    <p style={{ margin: "0 0 6px" }}>
                      <span className="big-amount">{memories.length}</span>{" "}
                      <span className="muted">{memories.length === 1 ? "memory" : "memories"} stored {data.memoryMode === "walrus" ? "on Walrus" : "locally (simulated)"}</span>
                    </p>
                    {memories.length > 0 ? (
                      <p className="muted small">Latest, <span className="mono">{memories[0].text.slice(0, 90)}</span></p>
                    ) : (
                      <p className="muted small">Nothing remembered yet. Accept or correct a split and Evenly starts learning.</p>
                    )}
                    <p className="muted small">
                      {household.memoryEnabled
                        ? "Splits are proposed from these memories, and every decision teaches Evenly."
                        : "Memory is off, so new splits are plain equal splits and nothing is learned."}
                    </p>
                    <button className="secondary" onClick={() => setView("memory")}>Open memory</button>
                  </section>

                  {(() => {
                    const weeks = learningByWeek(data.decisions);
                    return (
                      <section className="card" aria-label="Learning chart">
                        <h2>Is Evenly learning?</h2>
                        {weeks.length === 0 ? (
                          <div className="empty"><span className="empty-ico" aria-hidden>📈</span><strong>No decisions yet</strong>Accept or correct a proposed split and this chart starts. It is computed only from your real decisions, never hardcoded.</div>
                        ) : (
                          <ul className="clean">
                            {weeks.map((w) => (
                              <li key={w.week}>
                                <div className="row">
                                  <span>Week of {w.week}</span>
                                  <span className="amount">{w.unedited} of {w.total} accepted without an edit{w.pctUnedited !== null ? `, ${Math.round(w.pctUnedited * 100)}%` : ""}</span>
                                </div>
                                <div className="bar" role="img" aria-label={`${Math.round((w.pctUnedited ?? 0) * 100)} percent accepted without an edit in week of ${w.week}`}>
                                  <div style={{ width: `${Math.round((w.pctUnedited ?? 0) * 100)}%` }} />
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    );
                  })()}

                  <section className="card span2" aria-label="Recent purchases">
                    <h2>Recent purchases</h2>
                    {expenses.length === 0 ? (
                      <div className="empty"><span className="empty-ico" aria-hidden>🧾</span><strong>Nothing logged yet</strong>Use the log bar above. Your first line starts the household memory.</div>
                    ) : (
                      recentByDay.map((group) => (
                        <div key={group.label}>
                          <p className="day-label">{group.label}</p>
                          <ul className="clean">
                            {group.items.map((exp) => (
                              <li key={exp.id} className="purchase">
                                <span className="cat-ico" aria-hidden>{catIcon(exp.category)}</span>
                                <span className="grow">
                                  <span className="row">
                                    <span><strong>{exp.description}</strong> <span className="tag">{exp.category}</span> {exp.status === "proposed" ? <span className="tag amber">proposed</span> : <span className="tag green">accepted</span>}</span>
                                    <span className="amount">{household.currency} {formatMinor(exp.amountMinor)}</span>
                                  </span>
                                  <span className="muted small" style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
                                    <span className="avatar sm" style={{ background: avatarColor(memberNameById.get(exp.paidByMemberId) ?? "M") }}>{initials(memberNameById.get(exp.paidByMemberId) ?? "M")}</span>
                                    Paid by {memberNameById.get(exp.paidByMemberId) ?? "someone"}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    )}
                  </section>
                </div>
              </div>
            )}

            {view === "log" && (
              <div className="rise">
                <form className="card" onSubmit={logExpense} aria-label="Log an expense in one line">
                  <h2>Log a purchase</h2>
                  {logError && <div className="notice error" role="alert">{logError}</div>}
                  <label htmlFor="line">One line</label>
                  <input id="line" value={line} onChange={(e) => setLine(e.target.value)} placeholder="groceries 12000 paid by Ada" autoComplete="off" />
                  {preview && (
                    <div className="chip" role="status">
                      <span aria-hidden>{catIcon(preview.category)}</span>
                      <span>{preview.description}</span>
                      <span className="amount">{household.currency} {formatMinor(preview.amountMinor ?? 0)}</span>
                      <span className="muted">paid by {preview.payerName ?? "you"}</span>
                    </div>
                  )}
                  <button className="primary" type="submit" disabled={logging || !line.trim()}>{logging ? "Logging…" : "Log it"}</button>
                </form>

                <section className="card" aria-label="Expenses">
                  <h2>Purchases and proposals</h2>
                  {decisionError && <div className="notice error" role="alert">{decisionError}</div>}
                  {expenses.length === 0 ? (
                    <div className="empty"><span className="empty-ico" aria-hidden>🧾</span><strong>Nothing logged yet</strong>Your first line above starts the household memory.</div>
                  ) : (
                    <ul className="clean">
                      {expenses.map((exp) => (
                        <li key={exp.id}>
                          <div className="row">
                            <span><strong>{exp.description}</strong> <span className="tag">{exp.category}</span> {exp.status === "proposed" ? <span className="tag amber">proposed</span> : <span className="tag green">{exp.status}</span>}</span>
                            <span className="amount">{household.currency} {formatMinor(exp.amountMinor)}</span>
                          </div>
                          <div className="muted small">
                            Paid by {memberNameById.get(exp.paidByMemberId) ?? "someone"},{" "}
                            {exp.shares.map((s) => `${memberNameById.get(s.memberId) ?? "?"} ${formatMinor(s.amountMinor)}`).join(", ")}
                          </div>
                          {exp.proposal && (
                            <details style={{ marginTop: 6 }}>
                              <summary>Why this split</summary>
                              <p className="small" style={{ margin: "6px 0" }}>{exp.proposal.explanation}</p>
                              {exp.proposal.usedMemories.length === 0 ? (
                                <p className="muted small">No memories were used for this proposal.</p>
                              ) : (
                                <ul className="clean">
                                  {exp.proposal.usedMemories.map((m, i) => {
                                    const link = explorerLinkForBlob(m.blobId);
                                    return (
                                      <li key={i} className="small">
                                        <span className="tag green">{m.kind}</span>{" "}
                                        <span className="mono">{m.text}</span>
                                        <br />
                                        {link ? <a className="blob-chip" href={link} target="_blank" rel="noreferrer">blob {m.blobId}</a> : <span className="blob-chip">{m.blobId} (local only, not on chain)</span>}
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
                                {deciding === exp.id ? "Saving…" : "Save correction. Evenly will remember it"}
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}

            {view === "memory" && (
              <div className="rise">
                <section className="card" aria-label="Memory timeline">
                  <h2>Memory timeline</h2>
                  <p className="muted small">
                    {household.memoryEnabled
                      ? "Splits are proposed from your household memories, and every accept or correction teaches Evenly."
                      : "Memory is off, so every new split is a plain equal split and nothing is learned. Flip the switch in the top bar and compare the proposals."}{" "}
                    Storage is {data.memoryMode === "walrus" ? "Walrus Memory on Mainnet, the source of truth" : "simulated local memory, because Walrus keys are not configured yet"}.
                  </p>
                  {memories.length === 0 ? (
                    <div className="empty"><span className="empty-ico" aria-hidden>🧠</span><strong>No memories yet</strong>Log a purchase, then accept or correct its split. That first decision becomes the first memory.</div>
                  ) : (
                    <div className="timeline">
                      {memories.map((m) => {
                        const link = explorerLinkForBlob(m.blobId);
                        const tagClass = m.kind === "correction" ? "tag amber" : m.kind === "rule" || m.kind === "acceptance" || m.kind === "settlement" ? "tag green" : m.kind === "settlement_habit" ? "tag apricot" : "tag";
                        return (
                          <div key={m.blobId} className={`t-item kind-${m.kind}`}>
                            <span className={tagClass}>{m.kind.replace("_", " ")}</span>
                            <p className="small" style={{ margin: "5px 0 0" }}>{m.text}</p>
                            {link ? <a className="blob-chip" href={link} target="_blank" rel="noreferrer">blob {m.blobId}</a> : <span className="blob-chip">{m.blobId} (local only)</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {timelineMemories.length > 0 && (
                    <p className="muted small">Showing every memory, including the {timelineMemories.length} rules, corrections and acceptances that shape new proposals.</p>
                  )}
                  <p className="muted small">Want proof this is real? The <a href={`/proof/${id}`}>restart proof</a> wipes the app and rebuilds this household from these memories alone.</p>
                </section>
              </div>
            )}

            {view === "settle" && (
              <div className="rise">
                <section className="card" aria-label="Settle up">
                  <h2>Settle up in USDC</h2>
                  {settleMsg && <div className="notice info" role="status">{settleMsg}</div>}
                  {!household.displayPerUsdcMinor ? (
                    <form onSubmit={saveRate}>
                      <p className="muted small">Settlements are paid in USDC on Sui. Tell Evenly your rate so the amounts stay honest. It never invents an exchange rate.</p>
                      <label htmlFor="rate">1 USDC is how many {household.currency}?</label>
                      <input id="rate" inputMode="decimal" value={rateInput} onChange={(e) => setRateInput(e.target.value)} placeholder="1500" required />
                      <button className="primary" type="submit">Save rate</button>
                    </form>
                  ) : (
                    <>
                      <p className="muted small">Rate, 1 USDC = {household.currency} {formatMinor(household.displayPerUsdcMinor)}.</p>
                      <button className="primary" onClick={() => void createSettlements()}>Create settlements from balances</button>
                    </>
                  )}
                  {data.settlements.length > 0 && (
                    <ul className="clean" style={{ marginTop: 12 }}>
                      {data.settlements.map((s) => (
                        <li key={s.id}>
                          <div className="row">
                            <span>{memberNameById.get(s.fromMemberId)} pays {memberNameById.get(s.toMemberId)}</span>
                            <span className="amount">{formatUsdc(s.amountUsdcMinor)} USDC</span>
                          </div>
                          <div className="muted small">
                            {s.status === "settled" ? (
                              <span className="settled-badge"><span className="tick" aria-hidden>✓</span>Settled{s.settledAt ? `, ${new Date(s.settledAt).toLocaleString()}` : ""}{s.digest ? <> · transaction <a href={explorerLinkForTx(s.digest)} target="_blank" rel="noreferrer" className="mono">{s.digest.slice(0, 18)}…</a></> : ""}</span>
                            ) : (
                              <span><span className="watching-dot" aria-hidden /> Waiting for the transfer on Sui. Send exactly this amount to {memberNameById.get(s.toMemberId)}.</span>
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
                  <section aria-label="Balances for settling" style={{ marginTop: 18 }}>
                    <h2>Who owes what</h2>
                    <ul className="clean">
                      {balances.map((b) => (
                        <li key={b.memberId} className="row">
                          <span>{memberNameById.get(b.memberId) ?? "Member"}</span>
                          <span className={b.netMinor === 0 ? "muted" : b.netMinor > 0 ? "amount positive" : "amount negative"}>
                            {b.netMinor === 0 ? "all settled" : `${b.netMinor > 0 ? "is owed" : "owes"} ${household.currency} ${formatMinor(Math.abs(b.netMinor))}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </section>
              </div>
            )}

            {view === "members" && (
              <div className="rise">
                <section className="card" aria-label="Members, ownership and invite">
                  <h2>Members and ownership</h2>
                  <p className="muted small">
                    Every member can hold a delegate key on the household Walrus Memory account, up to 20 keys.
                    The account owner adds public keys on chain. Revoking a member stops their memory access, and removal
                    can lag about 30 seconds because verification is cached. The countdown below is honest about that lag.
                  </p>
                  {ownershipMsg && <div className="notice info" role="status">{ownershipMsg}</div>}
                  {delegateOnce && (
                    <div className="notice warn" role="alert">
                      <strong>Delegate private key for {memberNameById.get(delegateOnce.memberId)}, shown once. Evenly does not store it:</strong>
                      <div className="mono" style={{ margin: "6px 0" }}>{delegateOnce.privateKey}</div>
                      {delegateOnce.note} Save the key somewhere safe now. This box disappears on reload.
                    </div>
                  )}
                  <ul className="clean">
                    {members.map((m) => {
                      const revoking = m.delegate?.status === "revoking" && m.delegate.revokedAt;
                      const lagLeft = revoking ? Math.max(0, 30 - Math.floor((Date.now() - new Date(m.delegate!.revokedAt as string).getTime()) / 1000)) : 0;
                      const shownDelegateStatus = revoking && lagLeft === 0 ? "revoked" : m.delegate?.status;
                      return (
                        <li key={m.id}>
                          <div className="row">
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                              <span className="avatar sm" style={{ background: avatarColor(m.name) }}>{initials(m.name)}</span>
                              {m.name}{m.revokedAt ? " (removed)" : ""}
                            </span>
                            {m.delegate && <span className="tag green">delegate, {shownDelegateStatus}</span>}
                          </div>
                          <div className="mono muted">{m.suiAddress}</div>
                          {m.delegate && <div className="mono muted small">delegate key, {m.delegate.suiAddress}</div>}
                          {revoking && lagLeft > 0 && <div className="notice warn small">Revoking. Memory access can lag about 30 seconds while verification caches clear. About {lagLeft} seconds remaining. Reload to check again.</div>}
                          {!m.revokedAt && (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                              {!m.delegate && <button className="secondary" onClick={() => void generateDelegate(m)}>Generate delegate key</button>}
                              {m.delegate?.status === "generated" && <button className="secondary" onClick={() => void activateDelegate(m)}>Owner added it. Mark active</button>}
                              <button className="secondary" onClick={() => void revokeMemberUi(m)}>Revoke member</button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <label htmlFor="invite">Invite link. Share it with your household</label>
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
              </div>
            )}
          </div>
        </div>

        <p className="muted small" style={{ marginTop: 22 }}>
          Memory mode, {data.memoryMode === "walrus" ? "Walrus Memory on Mainnet is the source of truth, and local app state is only a cache" : "simulated local memory, because Walrus keys are not configured. Local app state is only a cache"}.
        </p>
      </main>

      <nav className="bottomtabs" aria-label="Household sections">
        {navItems.map((item) => (
          <button key={item.key} className={view === item.key ? "active" : ""} onClick={() => setView(item.key)} aria-current={view === item.key ? "page" : undefined}>
            <span className="nav-ico" aria-hidden>{item.icon}</span>{item.label.replace(" purchase", "")}
          </button>
        ))}
        <a href="/limits"><span className="nav-ico" aria-hidden>📖</span>Limits</a>
      </nav>
    </div>
  );
}
