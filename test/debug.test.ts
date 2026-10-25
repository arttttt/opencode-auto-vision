import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const saved = { TMPDIR: process.env.TMPDIR, AUTO_VISION_DEBUG: process.env.AUTO_VISION_DEBUG };

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

/** Loads debug.ts afresh with AUTO_VISION_DEBUG set to `flag`, logging into a temp dir of its own. */
async function load(flag: string | undefined) {
  const dir = mkdtempSync(join(tmpdir(), "auto-vision-debug-"));
  process.env.TMPDIR = dir;
  if (flag === undefined) delete process.env.AUTO_VISION_DEBUG;
  else process.env.AUTO_VISION_DEBUG = flag;
  vi.resetModules();
  const module = await import("../src/debug.js");
  return { ...module, log: join(dir, "opencode-auto-vision-debug.log") };
}

describe("debug", () => {
  // It used to write on every hook call regardless, into one file that
  // grew to gigabytes with every conversation in it.
  it.each([[undefined], ["0"], [""]])("writes nothing when AUTO_VISION_DEBUG is %p", async (flag) => {
    const { debug, dump, log } = await load(flag);

    debug("hello");
    dump("messages", [{ text: "private" }]);

    expect(existsSync(log)).toBe(false);
  });

  it.each([["1"], ["true"]])("writes the trace when AUTO_VISION_DEBUG is %p", async (flag) => {
    const { debug, dump, log } = await load(flag);

    debug("hello");
    dump("messages", [{ text: "x".repeat(200) }]);

    const text = readFileSync(log, "utf8");
    expect(text).toContain("hello");
    expect(text).toContain("…(200c)");
  });
});
