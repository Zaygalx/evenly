"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Household, Member } from "@/lib/types";

export default function JoinPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [suiAddress, setSuiAddress] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const hint = new URLSearchParams(window.location.search).get("h");
        const res = await fetch(`/api/invite/${params.token}${hint ? `?h=${hint}` : ""}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "This invite link is not valid.");
        setHousehold(json.household);
        setMembers(json.members);
      } catch (err) {
        setError(err instanceof Error ? err.message : "This invite link is not valid.");
      }
    })();
  }, [params.token]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!household) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/households/${household.id}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, suiAddress }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not join.");
      try {
        localStorage.setItem(`evenly:member:${household.id}`, json.member.id);
      } catch { /* private mode */ }
      router.push(`/h/${household.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !household) {
    return (
      <main>
        <h1>Invite not found</h1>
        <div className="notice error" role="alert">{error}</div>
        <p><a href="/">Go to Evenly</a></p>
      </main>
    );
  }
  if (!household) return <main><p className="muted" aria-live="polite">Loading your invite…</p></main>;

  return (
    <main>
      <h1>Join {household.name}</h1>
      <p className="lede">
        {members.length > 0 ? `Already here: ${members.map((m) => m.name).join(", ")}. ` : ""}
        Add your name and Sui address to join the household.
      </p>
      <form className="card" onSubmit={join} aria-label="Join household">
        {error && <div className="notice error" role="alert">{error}</div>}
        <label htmlFor="j-name">Your name</label>
        <input id="j-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ben" autoComplete="name" required />
        <label htmlFor="j-sui">Your Sui address</label>
        <input id="j-sui" value={suiAddress} onChange={(e) => setSuiAddress(e.target.value)} placeholder="0x…" className="mono" required />
        <p className="muted small">Settlements are paid to this address in USDC on Sui. We never ask for a private key.</p>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Joining…" : "Join household"}</button>
      </form>
    </main>
  );
}
