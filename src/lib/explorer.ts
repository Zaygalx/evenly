/** Explorer links for memory blob ids and transaction digests. */
export function explorerLinkForBlob(blobId: string): string | null {
  if (blobId.startsWith("local-")) return null; // local mock id — not on any chain
  if (blobId.startsWith("0x")) return `https://suiscan.xyz/mainnet/object/${blobId}`;
  return `https://walruscan.com/mainnet/blob/${blobId}`;
}

export function explorerLinkForTx(digest: string): string {
  return `https://suiscan.xyz/mainnet/tx/${digest}`;
}
