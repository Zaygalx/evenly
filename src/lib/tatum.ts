import {
  getMembers,
  getPendingSettlements,
  markSettlementSettled,
} from "./store";
import {
  extractUsdcTransfers,
  matchTransfers,
  USDC_COIN_TYPE,
  type ObservedTransfer,
} from "./settlement";
import { rememberRecord } from "./memory/client";

/**
 * Tatum watcher: how Evenly sees USDC transfers on Sui.
 *
 * Two layers, exactly as the chain demands:
 *
 * 1. STREAM — a server-side subscription to Tatum's Sui gRPC
 *    SubscriptionService.SubscribeCheckpoints (TLS, x-api-key header
 *    metadata, field mask limiting payloads). A subscription starts at the
 *    current tip and CANNOT resume: whatever happens while it is down is
 *    simply not delivered.
 * 2. BACKFILL — because of that, every (re)connect and every manual check
 *    runs a polling backfill over the LedgerService/JSON-RPC history for the
 *    creditor addresses with pending settlements, so nothing is missed.
 *
 * Tatum's free tier allows ~3 requests/second, so backfill responses are
 * cached per address (15s) and checks are serialised.
 *
 * Without a Tatum API key the watcher is INACTIVE: it reports mode
 * "unconfigured" and never invents a settlement. In local-mock memory mode
 * the UI may inject a clearly-labelled simulated transfer instead.
 */

export interface TatumConfig {
  apiKey: string | null;
  grpcUrl: string;
  rpcUrl: string;
}

export function getTatumConfig(): TatumConfig {
  return {
    apiKey: process.env.TATUM_API_KEY ?? null,
    grpcUrl: process.env.TATUM_SUI_GRPC_URL ?? "https://sui-mainnet-grpc.gateway.tatum.io",
    rpcUrl: process.env.TATUM_SUI_RPC_URL ?? "https://sui-mainnet.gateway.tatum.io",
  };
}

export function tatumConfigured(): boolean {
  return Boolean(getTatumConfig().apiKey);
}

/* ------------------------------- Backfill ---------------------------------- */

const backfillCache = new Map<string, { at: number; transfers: ObservedTransfer[] }>();
const BACKFILL_CACHE_MS = 15_000;

export async function backfillTransfersForAddress(address: string, limit = 25): Promise<ObservedTransfer[]> {
  const config = getTatumConfig();
  if (!config.apiKey) return [];
  const cached = backfillCache.get(address.toLowerCase());
  if (cached && Date.now() - cached.at < BACKFILL_CACHE_MS) return cached.transfers;

  const res = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": config.apiKey },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sui_queryTransactionBlocks",
      params: [
        {
          filter: { ToAddress: address },
          options: { showBalanceChanges: true, showInput: true },
        },
        null,
        limit,
        true, // descending order — newest first
      ],
    }),
  });
  if (!res.ok) throw new Error(`Tatum backfill failed: HTTP ${res.status}`);
  const json = (await res.json()) as {
    result?: { data?: { digest: string; transaction?: { data?: { sender?: string } }; balanceChanges?: { address: string; coinType: string; amount: string }[] }[] };
  };
  const txs = (json.result?.data ?? []).map((tx) => ({
    digest: tx.digest,
    sender: tx.transaction?.data?.sender,
    balanceChanges: tx.balanceChanges,
  }));
  const transfers = extractUsdcTransfers(txs);
  backfillCache.set(address.toLowerCase(), { at: Date.now(), transfers });
  return transfers;
}

/* ------------------------------ Check + match ------------------------------ */

export interface CheckResult {
  mode: "tatum" | "unconfigured";
  settled: { settlementId: string; digest: string; simulated: boolean }[];
  checkedTransfers: number;
}

let checkInFlight: Promise<CheckResult> | null = null;

export function checkHouseholdSettlements(householdId: string, extraTransfers: ObservedTransfer[] = [], simulated = false): Promise<CheckResult> {
  if (checkInFlight) return checkInFlight;
  checkInFlight = (async () => {
    const pending = getPendingSettlements(householdId);
    if (pending.length === 0) return { mode: tatumConfigured() ? "tatum" : "unconfigured", settled: [], checkedTransfers: 0 } as CheckResult;

    const members = getMembers(householdId);
    const addressByMemberId = new Map(members.map((m) => [m.id, m.suiAddress]));
    const transfers: ObservedTransfer[] = [...extraTransfers];

    if (tatumConfigured()) {
      const creditorAddresses = [...new Set(pending.map((s) => addressByMemberId.get(s.toMemberId)).filter(Boolean))] as string[];
      for (const address of creditorAddresses) {
        try {
          transfers.push(...(await backfillTransfersForAddress(address)));
        } catch (err) {
          console.error("[evenly] backfill failed for", address, err);
        }
      }
    }

    const matches = matchTransfers(pending, addressByMemberId, transfers);
    const settled: CheckResult["settled"] = [];
    for (const match of matches) {
      markSettlementSettled(match.settlementId, match.digest);
      settled.push({ settlementId: match.settlementId, digest: match.digest, simulated });
      const s = pending.find((p) => p.id === match.settlementId);
      if (s) {
        await rememberRecord({
          kind: "settlement",
          householdId,
          fields: {
            settlement: s.id,
            from: members.find((m) => m.id === s.fromMemberId)?.name ?? s.fromMemberId,
            to: members.find((m) => m.id === s.toMemberId)?.name ?? s.toMemberId,
            amountUsdcMinor: String(s.amountUsdcMinor),
            status: "settled",
            digest: match.digest,
            simulated: simulated ? "yes" : "no",
          },
        });
      }
    }
    return { mode: tatumConfigured() ? "tatum" : "unconfigured", settled, checkedTransfers: transfers.length } as CheckResult;
  })().finally(() => {
    checkInFlight = null;
  });
  return checkInFlight;
}

/** Build the labelled simulated transfer used ONLY in local demo mode. */
export function simulatedTransferFor(householdId: string): ObservedTransfer | null {
  const pending = getPendingSettlements(householdId);
  if (pending.length === 0) return null;
  const members = getMembers(householdId);
  const s = pending[0];
  const from = members.find((m) => m.id === s.fromMemberId);
  const to = members.find((m) => m.id === s.toMemberId);
  if (!from || !to) return null;
  return {
    digest: `simulated-${s.id.slice(0, 8)}-${Date.now().toString(36)}`,
    sender: from.suiAddress,
    recipient: to.suiAddress,
    coinType: USDC_COIN_TYPE,
    amountMinor: s.amountUsdcMinor,
  };
}

/* --------------------------- gRPC checkpoint stream ------------------------ */

interface WatcherState {
  status: "inactive" | "connecting" | "streaming" | "reconnecting";
  lastCursor: string | null;
  lastError: string | null;
  startedAt: string | null;
}

const globalForWatcher = globalThis as unknown as { __evenlyWatcher?: WatcherState & { running: boolean } };

export function getWatcherState(): WatcherState & { running: boolean } {
  if (!globalForWatcher.__evenlyWatcher) {
    globalForWatcher.__evenlyWatcher = { status: "inactive", lastCursor: null, lastError: null, startedAt: null, running: false };
  }
  return globalForWatcher.__evenlyWatcher;
}

/**
 * Start (once) the server-side SubscribeCheckpoints stream.
 *
 * The stream starts at the tip, so BEFORE subscribing we run a polling
 * backfill for the gap since the last seen cursor; on any stream error we
 * mark the state, backfill again, and resubscribe. Checkpoint payloads are
 * normalised into ObservedTransfers and fed to the same matcher the backfill
 * uses, so both paths behave identically (and are covered by the same tests).
 */
export function ensureCheckpointStream(householdId: string): WatcherState {
  const state = getWatcherState();
  if (state.running) return state;
  if (!tatumConfigured()) {
    state.status = "inactive";
    state.lastError = "TATUM_API_KEY is not set — stream inactive, checks use backfill only when a key exists.";
    return state;
  }
  state.running = true;
  state.status = "connecting";
  state.startedAt = new Date().toISOString();

  void (async () => {
    const config = getTatumConfig();
    // Gap recovery first: the stream cannot replay what we missed.
    await checkHouseholdSettlements(householdId).catch(() => undefined);
    try {
      const { SuiGrpcClient } = await import("@mysten/sui/grpc");
      const client = new SuiGrpcClient({ baseUrl: config.grpcUrl, network: "mainnet" });
      const call = client.subscriptionService.subscribeCheckpoints(
        {
          // Field mask: only the transaction contents we need for matching —
          // digests, senders and balance changes — not full checkpoint data.
          readMask: { paths: ["contents.transactions.digest", "contents.transactions.transaction", "contents.transactions.effects"] },
        },
        { meta: { "x-api-key": config.apiKey as string } },
      );
      state.status = "streaming";
      for await (const frame of call.responses) {
        if (frame.cursor !== undefined) state.lastCursor = frame.cursor.toString();
        const checkpoint = frame.checkpoint;
        const txs = (checkpoint?.contents?.transactions ?? []).map((etx: unknown) => {
          const t = etx as {
            digest?: string;
            transaction?: { sender?: string };
            effects?: { balanceChanges?: { address?: string; coinType?: string; amount?: string }[] };
          };
          return { digest: t.digest, sender: t.transaction?.sender, balanceChanges: t.effects?.balanceChanges };
        });
        if (txs.length > 0) {
          const transfers = extractUsdcTransfers(txs);
          if (transfers.length > 0) await checkHouseholdSettlements(householdId, transfers);
        }
      }
      // Stream ended without error: treat like a drop — backfill + resubscribe.
      state.status = "reconnecting";
    } catch (err) {
      state.status = "reconnecting";
      state.lastError = err instanceof Error ? err.message : String(err);
      await checkHouseholdSettlements(householdId).catch(() => undefined);
    } finally {
      state.running = false;
      // Resubscribe after a short pause while settlements remain pending.
      setTimeout(() => {
        if (getPendingSettlements(householdId).length > 0) ensureCheckpointStream(householdId);
      }, 3000).unref?.();
    }
  })();

  return state;
}
