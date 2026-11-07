/**
 * Evenly simulation harness.
 *
 * Drives the REAL app over its public API on production. Four simulated
 * households, agent members with hidden split rules, realistic purchases,
 * accepts and corrections decided only from what the app proposes (which
 * comes only from Walrus Memory recall). Nothing here writes to Walrus or
 * the app's store directly.
 *
 * Relayer budget: a remember costs 5 points, the account cap is 60 points
 * per minute. This harness runs one household at a time, waits for each
 * memory write to become visible before the next step, and keeps at least
 * 8 seconds between mutating calls, staying far under the cap.
 *
 * Resume safety: state lives in sim/state.json and is saved after every
 * single action. Re-running any command skips work already recorded.
 * Wallet secrets live OUTSIDE the repo in ~/workspace/evenly-sim-vault/
 * (never committed, never printed) and are mirrored into Vercel env vars.
 *
 * Usage:
 *   npx tsx sim/harness.ts setup
 *   npx tsx sim/harness.ts cycle <householdIndex 0-3> <dayIndex 0-1>
 *   npx tsx sim/harness.ts settle-prep
 *   npx tsx sim/harness.ts settle-send
 *   npx tsx sim/harness.ts report
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { PERSONAS, ACCEPT_TOLERANCE, NOISE } from "./personas";

const API = process.env.EVENLY_API ?? "https://evenly-gamma-three.vercel.app";
const STATE_PATH = join(process.cwd(), "sim", "state.json");
const VAULT_DIR = join(homedir(), "workspace", "evenly-sim-vault");
const VAULT_PATH = join(VAULT_DIR, "secrets.json");
const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const RATE_MINOR = 150000; // 1 USDC = NGN 1,500.00 (household set rate, like a real household would)

interface WalletRec { household: number; member: string; address: string; secret: string }
interface ActionRec { key: string; household: number; day: number; line: string; category: string; action: "accept" | "correct"; deviation: number }
interface SettlementRec { household: number; settlementId: string; from: string; to: string; fromAddress: string; toAddress: string; amountUsdcMinor: number; status: string; digest?: string }
interface State {
  households: { index: number; id: string; name: string; members: { name: string; id: string; address: string }[] }[];
  actions: ActionRec[];
  settlements: SettlementRec[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastPostAt = 0;
async function pace() {
  const wait = 8000 - (Date.now() - lastPostAt);
  if (wait > 0) await sleep(wait);
}

async function api(path: string, init?: RequestInit, timeoutMs = 90000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, { ...init, signal: ctrl.signal, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed ${res.status}: ${json.error ?? "unknown"}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}
async function post(path: string, body?: unknown): Promise<any> {
  await pace();
  lastPostAt = Date.now();
  return api(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

function loadState(): State {
  if (!existsSync(STATE_PATH)) return { households: [], actions: [], settlements: [] };
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
}
function saveState(state: State) {
  writeFileSync(STATE_PATH + ".tmp", JSON.stringify(state, null, 2));
  renameSync(STATE_PATH + ".tmp", STATE_PATH);
}
function loadVault(): WalletRec[] {
  if (!existsSync(VAULT_PATH)) return [];
  return JSON.parse(readFileSync(VAULT_PATH, "utf8")) as WalletRec[];
}
function saveVault(wallets: WalletRec[]) {
  mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(VAULT_PATH, JSON.stringify(wallets, null, 2), { mode: 0o600 });
}

async function waitForMemory(householdId: string, match: (m: { kind: string; text: string }) => boolean, label: string, timeoutMs = 240000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const data = await api(`/api/households/${householdId}/memories`);
    if ((data.memories ?? []).some(match)) return;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for memory: ${label}`);
    await sleep(9000);
  }
}

function jitterWeights(base: Record<string, number>, names: string[]): Record<string, number> {
  const raw: Record<string, number> = {};
  let total = 0;
  for (const n of names) {
    raw[n] = Math.max(0.01, (base[n] ?? 0) + (Math.random() * 2 - 1) * NOISE);
    total += raw[n];
  }
  for (const n of names) raw[n] = raw[n] / total;
  return raw;
}
function sharesFromWeights(amountMinor: number, weights: Record<string, number>, memberIdByName: Map<string, string>) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const floors = entries.map(([name, w]) => ({ name, exact: amountMinor * w, floor: Math.floor(amountMinor * w) }));
  let remainder = amountMinor - floors.reduce((a, f) => a + f.floor, 0);
  floors.sort((a, b) => b.exact - b.floor - (a.exact - a.floor));
  const shares = floors.map((f) => ({ memberId: memberIdByName.get(f.name)!, amountMinor: f.floor }));
  for (let i = 0; remainder > 0; i = (i + 1) % shares.length, remainder--) shares[i].amountMinor += 1;
  return shares;
}

async function setup() {
  const state = loadState();
  const vault = loadVault();
  for (let i = 0; i < PERSONAS.length; i++) {
    const persona = PERSONAS[i];
    // wallets (throwaway, generated locally, secrets only in the vault)
    for (const m of persona.members) {
      if (!vault.some((w) => w.household === i && w.member === m.name)) {
        const kp = Ed25519Keypair.generate();
        vault.push({ household: i, member: m.name, address: kp.getPublicKey().toSuiAddress(), secret: kp.getSecretKey() });
        saveVault(vault);
      }
    }
    if (state.households.some((h) => h.index === i)) { console.log(`household ${i} exists, skipping`); continue; }
    const walletOf = (name: string) => vault.find((w) => w.household === i && w.member === name)!;
    const created = await post("/api/households", {
      name: persona.householdName, currency: "NGN",
      creatorName: persona.members[0].name, creatorSuiAddress: walletOf(persona.members[0].name).address,
    });
    const householdId: string = created.household.id;
    const members = [{ name: persona.members[0].name, id: created.member.id as string, address: walletOf(persona.members[0].name).address }];
    for (const m of persona.members.slice(1)) {
      const added = await post(`/api/households/${householdId}/members`, { name: m.name, suiAddress: walletOf(m.name).address });
      members.push({ name: m.name, id: added.member.id as string, address: walletOf(m.name).address });
    }
    await api(`/api/households/${householdId}`, { method: "PATCH", body: JSON.stringify({ displayPerUsdcMinor: RATE_MINOR }) });
    state.households.push({ index: i, id: householdId, name: persona.householdName, members });
    saveState(state);
    console.log(`household ${i} created: ${householdId} (${members.length} members)`);
  }
  console.log("setup complete");
}

async function cycle(hhIndex: number, dayIndex: number) {
  const state = loadState();
  const hh = state.households.find((h) => h.index === hhIndex);
  if (!hh) throw new Error("Run setup first");
  const persona = PERSONAS[hhIndex];
  const lines = persona.days[dayIndex];
  if (!lines) throw new Error(`No day ${dayIndex} for household ${hhIndex}`);
  const rules = persona.members[0].rules; // the household's shared hidden rulebook
  const memberIdByName = new Map(hh.members.map((m) => [m.name, m.id]));
  const memberNameById = new Map(hh.members.map((m) => [m.id, m.name]));

  for (let i = 0; i < lines.length; i++) {
    const key = `${hhIndex}:${dayIndex}:${i}`;
    if (state.actions.some((a) => a.key === key)) { console.log(`skip ${key} (done)`); continue; }
    const line = lines[i];
    const posted = await post(`/api/households/${hh.id}/expenses`, { text: line });
    const expenseId: string = posted.expense.id;
    const category: string = posted.expense.category;
    console.log(`${key} logged "${line}" [${category}], waiting for its memory…`);
    await waitForMemory(hh.id, (m) => m.kind === "expense" && m.text.includes(`expense=${expenseId}`), `expense ${expenseId}`);

    const data = await api(`/api/households/${hh.id}`);
    const expense = (data.expenses ?? []).find((e: any) => e.id === expenseId);
    if (!expense) throw new Error(`Expense ${expenseId} not visible after its memory landed`);
    const amount: number = expense.amountMinor;
    const proposed: Record<string, number> = {};
    for (const s of expense.shares) proposed[memberNameById.get(s.memberId) ?? "?"] = s.amountMinor / amount;
    const names = hh.members.map((m) => m.name);
    const hiddenRaw = rules[category] ?? Object.fromEntries(names.map((n) => [n, 1 / names.length]));
    const hiddenTotal = names.reduce((a, n) => a + (hiddenRaw[n] ?? 0), 0);
    const hidden: Record<string, number> = Object.fromEntries(names.map((n) => [n, (hiddenRaw[n] ?? 0) / hiddenTotal]));
    const deviation = Math.max(...names.map((n) => Math.abs((proposed[n] ?? 0) - hidden[n])));

    let action: "accept" | "correct";
    let body: unknown;
    if (deviation <= ACCEPT_TOLERANCE + Math.random() * NOISE) {
      action = "accept";
      body = { action };
    } else {
      action = "correct";
      body = { action, shares: sharesFromWeights(amount, jitterWeights(hidden, names), memberIdByName) };
    }
    await post(`/api/households/${hh.id}/expenses/${expenseId}/decision`, body);
    await waitForMemory(hh.id, (m) => (m.kind === "acceptance" || m.kind === "correction") && m.text.includes(`expense=${expenseId}`), `decision ${expenseId}`);
    state.actions.push({ key, household: hhIndex, day: dayIndex, line, category, action, deviation: Math.round(deviation * 1000) / 1000 });
    saveState(state);
    console.log(`${key} ${action} (deviation ${deviation.toFixed(3)})`);
  }
  console.log(`cycle complete: household ${hhIndex} day ${dayIndex}`);
}

async function settlePrep() {
  const state = loadState();
  for (const hh of state.households) {
    if (state.settlements.some((s) => s.household === hh.index)) { console.log(`household ${hh.index} settlements exist, skipping`); continue; }
    const res = await post(`/api/households/${hh.id}/settlements`);
    const data = await api(`/api/households/${hh.id}`);
    const nameById = new Map(hh.members.map((m) => [m.id, m.name]));
    const addrByName = new Map(hh.members.map((m) => [m.name, m.address]));
    for (const s of data.settlements ?? []) {
      state.settlements.push({
        household: hh.index, settlementId: s.id,
        from: nameById.get(s.fromMemberId) ?? "?", to: nameById.get(s.toMemberId) ?? "?",
        fromAddress: addrByName.get(nameById.get(s.fromMemberId) ?? "") ?? "",
        toAddress: addrByName.get(nameById.get(s.toMemberId) ?? "") ?? "",
        amountUsdcMinor: s.amountUsdcMinor, status: s.status,
      });
    }
    saveState(state);
    console.log(`household ${hh.index}: ${res.settlements?.length ?? 0} settlement(s) created`);
  }
}

async function settleSend() {
  const state = loadState();
  const vault = loadVault();
  const sui = new SuiGrpcClient({ baseUrl: "https://fullnode.mainnet.sui.io", network: "mainnet" });
  for (const s of state.settlements) {
    if (s.status === "settled") continue;
    const wallet = vault.find((w) => w.address === s.fromAddress);
    if (!wallet) { console.log(`no wallet for ${s.fromAddress}, skipping`); continue; }
    const kp = Ed25519Keypair.fromSecretKey(wallet.secret);
    const coinsRes: any = await sui.core.listCoins({ owner: s.fromAddress, coinType: USDC_TYPE });
    const coinObjects: any[] = coinsRes.objects ?? coinsRes.data ?? [];
    const total = coinObjects.reduce((a: bigint, c: any) => a + BigInt(c.balance ?? 0), 0n);
    const need = BigInt(s.amountUsdcMinor);
    if (total < need) {
      console.log(`household ${s.household}: debtor ${s.from} has ${Number(total) / 1e6} USDC, needs ${s.amountUsdcMinor / 1e6}. FUNDING NEEDED at ${s.fromAddress}`);
      continue;
    }
    const tx = new Transaction();
    const firstCoinId = coinObjects[0].objectId ?? coinObjects[0].coinObjectId;
    const coin = tx.splitCoins(tx.object(firstCoinId), [tx.pure.u64(need)]);
    tx.transferObjects([coin], tx.pure.address(s.toAddress));
    const result: any = await sui.core.signAndExecuteTransaction({ signer: kp, transaction: tx });
    s.digest = result?.Transaction?.digest ?? result?.digest;
    if (!s.digest) throw new Error(`Transfer failed for household ${s.household}: ${JSON.stringify(result).slice(0, 200)}`);
    saveState(state);
    console.log(`household ${s.household}: sent ${s.amountUsdcMinor / 1e6} USDC, digest ${result.digest}. Polling the app for detection…`);
    for (let attempt = 0; attempt < 15; attempt++) {
      await sleep(20000);
      await post(`/api/households/${state.households[s.household].id}/settlements/check`, { simulate: false });
      const data = await api(`/api/households/${state.households[s.household].id}`);
      const current = (data.settlements ?? []).find((x: any) => x.id === s.settlementId);
      if (current?.status === "settled") { s.status = "settled"; saveState(state); console.log(`household ${s.household}: DETECTED and settled by the app`); break; }
      if (attempt === 14) console.log(`household ${s.household}: not detected yet after polling. Digest ${s.digest}`);
    }
  }
}

async function report() {
  const state = loadState();
  const lines: string[] = [];
  lines.push("# Evenly simulation report");
  lines.push("");
  lines.push("Simulated data only. These four households are labelled Simulated in the app,");
  lines.push("and nothing here is merged with any real household. Every proposal the agents");
  lines.push("judged came from the app, which builds proposals only from Walrus Memory recall.");
  lines.push("");
  let totalMemories = 0;
  for (const hh of state.households) {
    const data = await api(`/api/households/${hh.id}`);
    const mem = await api(`/api/households/${hh.id}/memories`);
    const memories = mem.memories ?? [];
    totalMemories += memories.length;
    const hhActions = state.actions.filter((a) => a.household === hh.index);
    lines.push(`## ${hh.name}`);
    lines.push("");
    lines.push(`Household id: ${hh.id}`);
    lines.push(`Members: ${hh.members.map((m) => m.name).join(", ")}`);
    lines.push(`Memories on Walrus: ${memories.length}`);
    lines.push("");
    const days = [...new Set(hhActions.map((a) => a.day))].sort();
    for (const d of days) {
      const dayActions = hhActions.filter((a) => a.day === d);
      const accepted = dayActions.filter((a) => a.action === "accept").length;
      lines.push(`Simulated day ${d + 1}: ${dayActions.length} purchases, ${accepted} accepted without correction, acceptance rate ${dayActions.length ? Math.round((accepted / dayActions.length) * 100) : 0}%`);
    }
    lines.push("");
    lines.push("Blob ids:");
    for (const m of memories) lines.push(`- ${m.kind}: ${m.blobId}`);
    lines.push("");
    const settlements = state.settlements.filter((s) => s.household === hh.index);
    if (settlements.length) {
      lines.push("Settlements:");
      for (const s of settlements) lines.push(`- ${s.from} pays ${s.to}: ${s.amountUsdcMinor / 1e6} USDC, status ${s.status}${s.digest ? `, tx ${s.digest}` : ""}`);
      lines.push("");
    }
    void data;
  }
  lines.push(`Total memories written across simulated households: ${totalMemories}`);
  writeFileSync(join(process.cwd(), "sim", "REPORT.md"), lines.join("\n") + "\n");
  console.log(`report written: ${totalMemories} memories across ${state.households.length} simulated households`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "setup") await setup();
else if (cmd === "cycle") await cycle(Number(a), Number(b));
else if (cmd === "settle-prep") await settlePrep();
else if (cmd === "settle-send") await settleSend();
else if (cmd === "report") await report();
else console.log("usage: setup | cycle <hh> <day> | settle-prep | settle-send | report");
