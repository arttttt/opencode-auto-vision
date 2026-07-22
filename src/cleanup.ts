import { readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { getTempDir, getCleanupAfterHours } from "./config.js";
import type { Logger } from "./types.js";

/** Remove temp media files older than cleanupAfterHours. Runs once on plugin load. */
export async function cleanupOldTempFiles(log: Logger): Promise<void> {
  const dir = getTempDir();
  const maxAgeMs = getCleanupAfterHours() * 60 * 60 * 1000;
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
