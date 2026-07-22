// Adapter — removes stale files from the media temp dir. Pure IO, no policy.

import { readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../ports.js";

export async function cleanupOldTempFiles(
  dir: string,
  maxAgeHours: number,
  log: Logger,
): Promise<void> {
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return; // dir doesn't exist yet — nothing to clean.
  }
  const now = Date.now();
  let removed = 0;
  for (const name of entries) {
    const filepath = join(dir, name);
    try {
      const s = await stat(filepath);
      if (now - s.mtimeMs > maxAgeMs) {
        await rm(filepath, { force: true });
        removed++;
      }
    } catch {
      /* skip unreadable entries */
    }
  }
  log(`cleanup: removed ${removed} stale file(s)`);
}
