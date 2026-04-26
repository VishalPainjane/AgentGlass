import { join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dataDir } from "./db";

const blobsDir = join(dataDir, "blobs");

// Ensure blobs directory exists
mkdirSync(blobsDir, { recursive: true });

/**
 * Writes a payload string to the blob store and returns its SHA-256 hash.
 * If the blob already exists, it just returns the hash.
 */
export function writeBlob(payloadStr: string): string {
  const hash = createHash("sha256").update(payloadStr).digest("hex");
  const blobPath = join(blobsDir, `${hash}.json`);
  
  if (!existsSync(blobPath)) {
    writeFileSync(blobPath, payloadStr, "utf-8");
  }
  
  return hash;
}

/**
 * Reads a payload string from the blob store by its hash.
 */
export function readBlob(hash: string): string | null {
  const blobPath = join(blobsDir, `${hash}.json`);
  if (!existsSync(blobPath)) {
    return null;
  }
  return readFileSync(blobPath, "utf-8");
}
