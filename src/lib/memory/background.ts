import { after } from "next/server";
import { rememberRecord } from "./client";
import type { MemoryRecord } from "./serialize";

/**
 * Remember in the background, serverless-safely. Route handlers only.
 *
 * On Vercel, a function can freeze the moment its response is sent, killing
 * plain fire-and-forget writes (we watched this happen: live households in
 * walrus mode wrote nothing). after() keeps the invocation alive until the
 * queued, paced writes have landed on Walrus.
 */
export function rememberInBackground(records: MemoryRecord[]): void {
  const promises = records.map((r) => rememberRecord(r));
  after(async () => {
    await Promise.allSettled(promises);
  });
}
