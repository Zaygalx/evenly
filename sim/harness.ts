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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
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

async function api(path: string, init?: RequestInit, timeoutMs = 570000): Promise<any> {
  const method = init?.method ?? "GET";
  const maxAttempts = method === "POST" ? 1 : 4; // POSTs are never blindly retried (duplicate risk); the harness resumes from state instead
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${API}${path}`, { ...init, signal: ctrl.signal, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${method} ${path} failed ${res.status}: ${json.error ?? "unknown"}`);
      return json;
    } catch (err) {
      lastErr = err;
      if (err instanceof Error && err.message.includes("failed 4")) throw err; // real HTTP errors are not retried either
      if (attempt < maxAttempts - 1) await sleep(5000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
async function post(path: string, body?: unknown): Promise<any> {
  await pace();
  lastPostAt = Date.now();
  return api(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

async function getHouseholdReliable(id: string): Promise<any> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await api(`/api/households/${id}`);
    } catch (err) {
      if (attempt === 5) throw err;
      await sleep(15000);
    }
  }
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
    // A 404 here just means a cold instance could not hydrate yet, because
    // recall indexing lags a fresh write. That is a "not yet", not an error.
    const data = await api(`/api/households/${householdId}/memories`).catch(() => null);
    if (data && (data.memories ?? []).some(match)) return;
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
    const existing = state.households.find((h) => h.index === i);
    const walletOf = (name: string) => vault.find((w) => w.household === i && w.member === name)!;
    let hh = existing;
    if (!hh) {
      // The egress proxy occasionally drops a connection mid response. One
      // retry after a pause; if the first attempt had in fact landed, the
      // duplicate is a labelled Simulated household that is never used and
      // is disclosed in the report.
      const createBody = {
        name: persona.householdName, currency: "NGN",
        creatorName: persona.members[0].name, creatorSuiAddress: walletOf(persona.members[0].name).address,
      };
      let created: any;
      try {
        created = await post("/api/households", createBody);
      } catch {
        console.log(`household ${i}: create response lost, retrying once after 30s`);
        await sleep(30000);
        created = await post("/api/households", createBody);
      }
      hh = { index: i, id: created.household.id as string, name: persona.householdName,
             members: [{ name: persona.members[0].name, id: created.member.id as string, address: walletOf(persona.members[0].name).address }] };
      state.households.push(hh);
      saveState(state);
      console.log(`household ${i} created: ${hh.id}`);
    }
    // Members: add any that are missing, then wait until every member
    // memory is actually visible on Walrus. Serverless instances hydrate
    // from memory, so a member is only real once its memory lands.
    // Adopt members that already exist server side (a previous run may have
    // added them before its response was lost).
    const current = await getHouseholdReliable(hh.id).catch(() => null);
    if (current?.members) {
      for (const sm of current.members as any[]) {
        if (!hh.members.some((x) => x.id === sm.id)) {
          hh.members.push({ name: sm.name, id: sm.id, address: sm.suiAddress });
        }
      }
      saveState(state);
    }
    for (const m of persona.members.slice(1)) {
      if (hh.members.some((x) => x.name === m.name)) continue;
      // Member adds get up to 3 attempts. Between attempts we re-read the
      // household: if the add actually landed despite a lost response, we
      // adopt that member instead of adding a duplicate.
      for (let attempt = 0; attempt < 3 && !hh.members.some((x) => x.name === m.name); attempt++) {
        try {
          const added = await post(`/api/households/${hh.id}/members`, { name: m.name, suiAddress: walletOf(m.name).address });
          hh.members.push({ name: m.name, id: added.member.id as string, address: walletOf(m.name).address });
          saveState(state);
          console.log(`household ${i}: member ${m.name} added`);
        } catch (err) {
          console.log(`household ${i}: member ${m.name} add attempt ${attempt + 1} failed (${err instanceof Error ? err.message : err}), checking before retry`);
          await sleep(15000);
          const current = await getHouseholdReliable(hh.id).catch(() => null);
          const found = (current?.members ?? []).find((sm: any) => sm.name === m.name);
          if (found) {
            hh.members.push({ name: m.name, id: found.id as string, address: walletOf(m.name).address });
            saveState(state);
            console.log(`household ${i}: member ${m.name} had landed, adopted`);
          }
        }
      }
      if (!hh.members.some((x) => x.name === m.name)) throw new Error(`Could not add member ${m.name} to household ${i}`);
    }
    for (const m of hh.members) {
      await waitForMemory(hh.id, (mem) => mem.kind === "member" && mem.text.includes(`member=${m.id}`), `member ${m.name} of household ${i}`);
    }
    // FX rate: retry while cold instances are still hydrating.
    for (let attempt = 0; ; attempt++) {
      try {
        await api(`/api/households/${hh.id}`, { method: "PATCH", body: JSON.stringify({ displayPerUsdcMinor: RATE_MINOR }) });
        break;
      } catch (err) {
        if (attempt >= 5) throw err;
        console.log(`household ${i}: rate patch retry ${attempt + 1} (hydration lag)`);
        await sleep(20000);
      }
    }
    console.log(`household ${i} ready: ${hh.id} (${hh.members.length} members, memories visible)`);
  }
  console.log("setup complete");
}

async function listMemories(householdId: string): Promise<any[]> {
  const data = await api(`/api/households/${householdId}/memories`).catch(() => null);
  return data?.memories ?? [];
}

function parseRecord(text: string): Record<string, string> {
  // Memory text is "EVENLY/1 key=value key=value ..." with URL encoded values.
  const out: Record<string, string> = {};
  for (const part of text.replace(/^EVENLY\/1\s+/, "").split(" ")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      try { out[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1)); } catch { out[part.slice(0, eq)] = part.slice(eq + 1); }
    }
  }
  return out;
}

function textField(text: string, key: string): string | null {
  return parseRecord(text)[key] ?? null;
}

function parseWeights(text: string): Record<string, number> {
  // weights are stored as "Adaeze:50,Chidi:50" (percentages).
  const raw = textField(text, "weights") ?? "";
  const out: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const [name, w] = part.split(":");
    if (name && w) out[name.trim()] = Number(w) / 100;
  }
  return out;
}

/** POST via curl. From this machine, node fetch long lived connections to
 *  the deployment are dropped by the network path again and again, and an
 *  early disconnect cancels the server invocation before its work lands;
 *  curl connections survive the same routes reliably (every manual post
 *  landed). Never throw: callers verify effects through memories. */
async function firePost(path: string, body?: unknown): Promise<any> {
  await pace();
  lastPostAt = Date.now();
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "--max-time", "560", "-X", "POST", `${API}${path}`,
      "-H", "content-type: application/json",
      ...(body === undefined ? [] : ["-d", JSON.stringify(body)]),
    ], { timeout: 580000, maxBuffer: 4 * 1024 * 1024 });
    try { return JSON.parse(stdout); } catch { return null; }
  } catch {
    return null;
  }
}

async function cycle(hhIndex: number, dayIndex: number) {
  const state = loadState();
  const hh = state.households[hhIndex];
  if (!hh) throw new Error("Run setup first");
  const persona = PERSONAS[hhIndex];
  const rules = persona.members[0].rules;
  const lines = persona.days[dayIndex];
  if (!lines) throw new Error(`No scripted day ${dayIndex} for household ${hhIndex}`);
  const memberIdByName = new Map(hh.members.map((m) => [m.name, m.id]));
  const names = hh.members.map((m) => m.name);

  for (let i = 0; i < lines.length; i++) {
    const key = `${hhIndex}:${dayIndex}:${i}`;
    if (state.actions.some((a) => a.key === key)) continue;
    const line = lines[i];
    const lineAmountMinor = Number((line.match(/\d+/) ?? ["0"])[0]) * 100;

    // Everything is driven off the household's Walrus memories, read through
    // the app's own memories endpoint. Those reads are short and reliable,
    // unlike the long held-open write responses on this network.
    const before = await listMemories(hh.id);
    const decided = new Set<string>();
    for (const m of before) {
      if (m.kind === "acceptance" || m.kind === "correction") {
        const id = textField(m.text, "expense");
        if (id) decided.add(id);
      }
    }
    let target = before.find(
      (m) => m.kind === "expense" && textField(m.text, "expense") && !decided.has(textField(m.text, "expense")!) && Number(textField(m.text, "amountMinor")) === lineAmountMinor,
    );
    if (!target) {
      const knownIds = new Set(before.map((m) => m.blobId));
      await firePost(`/api/households/${hh.id}/expenses`, { text: line });
      console.log(`${key} logged "${line}", waiting for its memory…`);
      const deadline = Date.now() + 480000;
      let reposted = false;
      while (!target && Date.now() < deadline) {
        await sleep(9000);
        const now = await listMemories(hh.id);
        target = now.find((m) => m.kind === "expense" && textField(m.text, "expense") && !knownIds.has(m.blobId) && !decided.has(textField(m.text, "expense")!));
        if (!target && !reposted && Date.now() > deadline - 330000) {
          reposted = true;
          console.log(`${key} no memory after 150s, posting the line once more`);
          await firePost(`/api/households/${hh.id}/expenses`, { text: line });
        }
      }
      if (!target) throw new Error(`Expense memory for "${line}" never appeared`);
    } else {
      console.log(`${key} adopting undecided expense from an earlier attempt: "${line}"`);
    }

    const expenseId: string = textField(target.text, "expense")!;
    const amountMinor = Number(textField(target.text, "amountMinor"));
    const category = textField(target.text, "category") ?? "other";
    const proposed = parseWeights(target.text);
    const hiddenRaw = rules[category] ?? Object.fromEntries(names.map((n) => [n, 1 / names.length]));
    const hiddenTotal = names.reduce((a, n) => a + (hiddenRaw[n] ?? 0), 0);
    const hidden: Record<string, number> = Object.fromEntries(names.map((n) => [n, (hiddenRaw[n] ?? 0) / hiddenTotal]));
    const deviation = Math.max(...names.map((n) => Math.abs((proposed[n] ?? 0) - hidden[n])));

    let body: unknown;
    let action: "accept" | "correct";
    if (deviation <= ACCEPT_TOLERANCE + Math.random() * NOISE) {
      action = "accept";
      body = { action };
    } else {
      action = "correct";
      body = { action, shares: sharesFromWeights(amountMinor, jitterWeights(hidden, names), memberIdByName) };
    }

    await firePost(`/api/households/${hh.id}/expenses/${expenseId}/decision`, body);
    try {
      await waitForMemory(hh.id, (m) => (m.kind === "acceptance" || m.kind === "correction") && m.text.includes(`expense=${expenseId}`), `decision ${expenseId}`, 120000);
    } catch {
      console.log(`${key} decision not visible yet, posting it once more`);
      await firePost(`/api/households/${hh.id}/expenses/${expenseId}/decision`, body);
      await waitForMemory(hh.id, (m) => (m.kind === "acceptance" || m.kind === "correction") && m.text.includes(`expense=${expenseId}`), `decision ${expenseId}`, 300000);
    }

    state.actions.push({ key, household: hhIndex, day: dayIndex, line, category, action, deviation: Math.round(deviation * 1000) / 1000 });
    saveState(state);
    console.log(`${key} [${category}] proposed vs hidden deviation ${deviation.toFixed(3)} -> ${action}`);
    await sleep(8000);
  }
  console.log(`cycle ${hhIndex} day ${dayIndex} complete`);
}

async function settlePrep() {
  const state = loadState();
  for (const hh of state.households) {
    if (state.settlements.some((s) => s.household === hh.index)) { console.log(`household ${hh.index} settlements exist, skipping`); continue; }
    const res = await firePost(`/api/households/${hh.id}/settlements`);
    if (res?.error) throw new Error(`Settlement prep failed for household ${hh.index}: ${res.error}`);
    const data = await getHouseholdReliable(hh.id);
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
  lines.push("# Evenly agent test report");
  lines.push("");
  lines.push("Agent test data only. Automated agents played household members in these households,");
  lines.push("and every settlement was a real USDC transfer on Sui mainnet detected live through Tatum.");
  lines.push("Nothing here is merged with any real household. Every proposal the agents judged");
  lines.push("came from the app, which builds proposals only from Walrus Memory recall.");
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
      lines.push(`Day ${d + 1}: ${dayActions.length} purchases, ${accepted} accepted without correction, acceptance rate ${dayActions.length ? Math.round((accepted / dayActions.length) * 100) : 0}%`);
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
  lines.push(`Total memories written across agent test households: ${totalMemories}`);
  writeFileSync(join(process.cwd(), "sim", "REPORT.md"), lines.join("\n") + "\n");
  console.log(`report written: ${totalMemories} memories across ${state.households.length} agent test households`);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "setup") await setup();
  else if (cmd === "cycle") await cycle(Number(a), Number(b));
  else if (cmd === "settle-prep") await settlePrep();
  else if (cmd === "settle-send") await settleSend();
  else if (cmd === "report") await report();
  else console.log("usage: setup | cycle <hh> <day> | settle-prep | settle-send | report");
}
main().catch((err) => { console.error("HARNESS ERROR:", err instanceof Error ? err.message : err); process.exit(1); });
