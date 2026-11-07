import { createHash } from "crypto";
import type { MemoryRecord } from "./serialize";
import { dedupeKey, serializeMemory } from "./serialize";

/**
 * Memory backends for Evenly.
 *
 * - "walrus": the real thing. MemWal SDK against the Walrus Memory relayer on
 *   Mainnet (https://relayer.memory.walrus.xyz), one namespace per household,
 *   authenticated with the household account's delegate key from env vars.
 * - "local-mock": the SDK's official MemWalMock, in-process. Used when no
 *   Walrus credentials are configured (local dev, tests, offline demo).
 *   ALWAYS labelled "SIMULATED / LOCAL" in the UI — it is not Walrus and its
 *   blob ids are local identifiers, not Walrus blobs.
 *
 * Walrus is the only source of truth in walrus mode. The app's local store is
 * a cache in both modes.
 */

export interface MemoryHit {
  text: string;
  blobId: string;
  createdAt?: string;
}

export interface MemoryBackend {
  mode: "walrus" | "local-mock";
  rememberAndWait(text: string, namespace: string): Promise<{ blobId: string }>;
  recall(query: string, namespace: string, topK: number, maxDistance?: number): Promise<MemoryHit[]>;
  listAll(namespace: string): Promise<MemoryHit[]>;
}

export function householdNamespace(householdId: string): string {
  return `evenly-hh-${householdId}`;
}

export function walrusConfigured(): boolean {
  return Boolean(
    (process.env.MEMWAL_DELEGATE_KEY || process.env.MEMWAL_PRIVATE_KEY) && process.env.MEMWAL_ACCOUNT_ID,
  );
}

/* ---------------------------------- Walrus --------------------------------- */

const walrusClients = new Map<string, unknown>();

async function getWalrusClient(namespace: string): Promise<{
  rememberAndWait: (text: string) => Promise<{ blob_id: string }>;
  recall: (args: { query: string; topK: number; maxDistance: number }) => Promise<{ results: { text: string; blob_id: string; created_at?: string }[] }>;
}> {
  const cached = walrusClients.get(namespace);
  if (cached) return cached as never;
  const { MemWal } = await import("@mysten-incubation/memwal");
  const client = MemWal.create({
    key: (process.env.MEMWAL_DELEGATE_KEY || process.env.MEMWAL_PRIVATE_KEY) as string,
    accountId: process.env.MEMWAL_ACCOUNT_ID as string,
    serverUrl:
      process.env.MEMWAL_SERVER_URL ?? process.env.MEMWAL_RELAYER_URL ?? "https://relayer.memory.walrus.xyz",
    namespace,
  });
  walrusClients.set(namespace, client);
  return client as never;
}

const walrusBackend: MemoryBackend = {
  mode: "walrus",
  async rememberAndWait(text, namespace) {
    const client = await getWalrusClient(namespace);
    // rememberAndWait blocks until the relayer confirms the write — callers
    // must never read back before this resolves (memory spec, Phase 2).
    const result = await client.rememberAndWait(text);
    return { blobId: result.blob_id };
  },
  async recall(query, namespace, topK, maxDistance = 0.85) {
    const client = await getWalrusClient(namespace);
    const res = await client.recall({ query, topK, maxDistance });
    return res.results.map((r) => ({ text: r.text, blobId: r.blob_id, createdAt: r.created_at }));
  },
  async listAll(namespace) {
    // Recall is semantic, so a single broad query can silently miss records
    // whose embeddings sit far from it, and the miss differs from call to
    // call. A listing that feeds hydration and the restart proof must be
    // complete, so we sweep once per record kind with the kind's own literal
    // vocabulary (every record we write contains "kind=<kind>") at a wide
    // distance, plus the broad query, and merge by blob id.
    const queries = [
      "EVENLY kind household member expense rule correction acceptance settlement delegate",
      "EVENLY/1 kind=household",
      "EVENLY/1 kind=member",
      "EVENLY/1 kind=expense",
      "EVENLY/1 kind=rule",
      "EVENLY/1 kind=correction",
      "EVENLY/1 kind=acceptance",
      "EVENLY/1 kind=settlement",
      "EVENLY/1 kind=delegate",
    ];
    const seen = new Map<string, MemoryHit>();
    for (const query of queries) {
      const hits = await this.recall(query, namespace, 100, 0.99);
      for (const hit of hits) if (!seen.has(hit.blobId)) seen.set(hit.blobId, hit);
    }
    return [...seen.values()];
  },
};

/* -------------------------------- Local mock ------------------------------- */

interface MockEntry {
  text: string;
  blobId: string;
  createdAt: string;
}

const mockStores = new Map<string, MockEntry[]>();

function mockStore(namespace: string): MockEntry[] {
  if (!mockStores.has(namespace)) mockStores.set(namespace, []);
  return mockStores.get(namespace) as MockEntry[];
}

function tokenOverlapScore(query: string, text: string): number {
  const q = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const t = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  let hits = 0;
  for (const token of q) if (t.has(token)) hits++;
  return hits;
}

const localMockBackend: MemoryBackend = {
  mode: "local-mock",
  async rememberAndWait(text, namespace) {
    const store = mockStore(namespace);
    const blobId = `local-${createHash("sha256").update(namespace + "|" + text).digest("hex").slice(0, 20)}`;
    if (!store.some((e) => e.text === text)) {
      store.push({ text, blobId, createdAt: new Date().toISOString() });
    }
    return { blobId };
  },
  async recall(query, namespace, topK) {
    const store = mockStore(namespace);
    return store
      .map((entry) => ({ entry, score: tokenOverlapScore(query, entry.text) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.createdAt.localeCompare(b.entry.createdAt))
      .slice(0, topK)
      .map(({ entry }) => ({ text: entry.text, blobId: entry.blobId, createdAt: entry.createdAt }));
  },
  async listAll(namespace) {
    return mockStore(namespace).map((e) => ({ text: e.text, blobId: e.blobId, createdAt: e.createdAt }));
  },
};

export function getMemoryBackend(): MemoryBackend {
  return walrusConfigured() ? walrusBackend : localMockBackend;
}

/* ------------------------------ Write queue -------------------------------- */

/**
 * Paced, deduplicating write queue.
 *
 * Walrus rate limits (product spec): remember costs 5 points against an
 * account cap of 60 points/minute — so at most 12 remembers/minute. We pace
 * Walrus writes 5.1s apart, serialise them, and drop exact duplicates.
 * Local-mock writes are instant and unpaced.
 */
const WALRUS_MIN_INTERVAL_MS = 5100;

interface QueuedWrite {
  text: string;
  namespace: string;
  resolve: (v: { blobId: string }) => void;
  reject: (e: unknown) => void;
}

class MemoryWriteQueue {
  private queue: QueuedWrite[] = [];
  private running = false;
  private lastWalrusWriteAt = 0;
  private seen = new Map<string, Promise<{ blobId: string }>>();
  private idleWaiters: (() => void)[] = [];

  enqueue(record: MemoryRecord): Promise<{ blobId: string }> {
    const text = serializeMemory(record);
    const key = `${record.householdId}:${dedupeKey(record)}`;
    const existing = this.seen.get(key);
    if (existing) return existing; // duplicate — do not pay for the same memory twice
    const promise = new Promise<{ blobId: string }>((resolve, reject) => {
      this.queue.push({ text, namespace: householdNamespace(record.householdId), resolve, reject });
      void this.pump();
    });
    this.seen.set(key, promise);
    promise.catch(() => this.seen.delete(key));
    return promise;
  }

  /** Resolves when every queued write has completed. Used by the restart proof. */
  async drain(): Promise<void> {
    if (!this.running && this.queue.length === 0) return;
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue[0];
        const backend = getMemoryBackend();
        if (backend.mode === "walrus") {
          const wait = this.lastWalrusWriteAt + WALRUS_MIN_INTERVAL_MS - Date.now();
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        }
        try {
          const result = await backend.rememberAndWait(item.text, item.namespace);
          if (backend.mode === "walrus") this.lastWalrusWriteAt = Date.now();
          item.resolve(result);
        } catch (err) {
          item.reject(err);
        }
        this.queue.shift();
      }
    } finally {
      this.running = false;
      const waiters = this.idleWaiters.splice(0);
      waiters.forEach((w) => w());
    }
  }
}

const globalForQueue = globalThis as unknown as { __evenlyMemoryQueue?: MemoryWriteQueue };

export function getMemoryQueue(): MemoryWriteQueue {
  if (!globalForQueue.__evenlyMemoryQueue) globalForQueue.__evenlyMemoryQueue = new MemoryWriteQueue();
  return globalForQueue.__evenlyMemoryQueue;
}

/** Fire-and-forget remember with error logging; returns the queued promise. */
export function rememberRecord(record: MemoryRecord): Promise<{ blobId: string }> {
  const promise = getMemoryQueue().enqueue(record);
  promise.catch((err) => console.error("[evenly] memory write failed:", err));
  return promise;
}


export async function recallRecords(householdId: string, query: string, topK = 25): Promise<{ record: MemoryRecord; blobId: string; createdAt?: string }[]> {
  const backend = getMemoryBackend();
  const hits = await backend.recall(query, householdNamespace(householdId), topK);
  const out: { record: MemoryRecord; blobId: string; createdAt?: string }[] = [];
  for (const hit of hits) {
    const { parseMemory } = await import("./serialize");
    const record = parseMemory(hit.text);
    if (record && record.householdId === householdId) out.push({ record, blobId: hit.blobId, createdAt: hit.createdAt });
  }
  return out;
}

export async function listAllRecords(householdId: string): Promise<{ record: MemoryRecord; blobId: string; createdAt?: string }[]> {
  const backend = getMemoryBackend();
  const hits = await backend.listAll(householdNamespace(householdId));
  const { parseMemory } = await import("./serialize");
  const out: { record: MemoryRecord; blobId: string; createdAt?: string }[] = [];
  for (const hit of hits) {
    const record = parseMemory(hit.text);
    if (record && record.householdId === householdId) out.push({ record, blobId: hit.blobId, createdAt: hit.createdAt });
  }
  return out;
}
