// Dev trace logger — writes everything the plugin sees to a disk file, because
// client.app.log output is not surfaced in opencode.log.
//
// Silent unless AUTO_VISION_DEBUG=1 is set. Path: $TMPDIR/opencode-auto-vision-debug.log

import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendFileSync } from "node:fs";

const enabled =
  process.env.AUTO_VISION_DEBUG === "1" ||
  process.env.AUTO_VISION_DEBUG === "true";
const path = join(tmpdir(), "opencode-auto-vision-debug.log");

/** Truncate long strings (base64 / data URLs) so the log stays readable. */
function truncate(value: unknown, depth = 0): unknown {
  if (depth > 6) return "<…>";
  if (typeof value === "string") {
    return value.length > 96
      ? value.slice(0, 48) + `…(${value.length}c)`
      : value;
  }
  if (Array.isArray(value)) return value.map((v) => truncate(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = truncate(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function debug(msg: string): void {
  try {
    appendFileSync(path, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

export function dump(label: string, value: unknown): void {
  try {
    debug(`${label}: ${JSON.stringify(truncate(value))}`);
  } catch (e) {
    debug(`${label}: <unserializable> ${String(e)}`);
  }
}
