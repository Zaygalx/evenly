"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";
import { useParams } from "next/navigation";

interface Report {
  mode: string;
  before: { households: number; members: number; expenses: number; settlements: number; decisions: number };
  memoriesFound: number;
  after: { households: number; members: number; expenses: number; settlements: number };
  balancesMatch: boolean;
  notes: string[];
}

export default function ProofPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/households/${params.id}/proof/rebuild`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Rebuild failed.");
      setReport(json.report as Report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebuild failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <div className="brandbar"><Logo /><a href="/" className="muted small">Home</a></div>
      <h1>Restart proof</h1>
      <p className="lede">
        Walrus Memory is the source of truth. This app local state is only a cache.
        This page proves it: it drains every queued memory write, <strong>wipes all local state</strong>,
        then rebuilds the household purely from its memories.
      </p>

      <div className="card">
        <h2>Run the proof</h2>
        <p className="muted small">
          Warning: this really does delete the local cache first. If the memories are not there,
          the household does not come back. That is the point of the proof.
        </p>
        {error && <div className="notice error" role="alert">{error}</div>}
        <button className="primary" onClick={() => void run()} disabled={running}>
          {running ? "Wiping and rebuilding…" : "Wipe local state & rebuild from memory"}
        </button>
      </div>

      {report && (
        <div className="card" aria-label="Rebuild report">
          <h2>Result, storage mode: {report.mode === "walrus" ? "Walrus Memory (Mainnet)" : "SIMULATED local memory"}</h2>
          <ul className="clean">
            <li className="row"><span>Memories found in namespace</span><span className="amount">{report.memoriesFound}</span></li>
            <li className="row"><span>Members before → after</span><span className="amount">{report.before.members} → {report.after.members}</span></li>
            <li className="row"><span>Expenses before → after</span><span className="amount">{report.before.expenses} → {report.after.expenses}</span></li>
            <li className="row"><span>Settlements before → after</span><span className="amount">{report.before.settlements} → {report.after.settlements}</span></li>
            <li className="row"><span>Balances identical after rebuild</span><span className="amount">{report.balancesMatch ? "Yes ✓" : "See notes"}</span></li>
          </ul>
          <ul className="clean">
            {report.notes.map((n, i) => <li key={i} className="small muted">{n}</li>)}
          </ul>
          <p><a href={`/h/${params.id}`}>← Back to the rebuilt household</a></p>
        </div>
      )}

      <p><a href={`/h/${params.id}`}>← Back to household</a></p>
    </main>
  );
}
