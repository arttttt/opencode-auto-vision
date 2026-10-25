/**
 * The package is installed and loaded by name, and each OpenCode generation
 * finds a different entry in it. These tests install the checkout into a
 * throwaway node_modules, resolve it the way each loader does, and apply each
 * loader's own acceptance rule to the built dist/ that ships:
 *
 *   OpenCode 1.0 – 1.3.3  import the package root, call EVERY export
 *                         (packages/opencode/src/plugin/index.ts@v1.0.0 … @v1.3.3)
 *   OpenCode 1.3.4 – 1.x  exports["./server"], else main; default {id, server}
 *                         (plugin/shared.ts resolvePackageEntrypoint, readV1Plugin @v1.18.32)
 *   OpenCode 2            `<name>/server`, else `<name>`; default must be an
 *                         OBJECT {id, setup} (@opencode/plugin host.js, @opencode/core Module)
 *
 * Same harness as opencode-pr-signature's test/entrypoints.test.ts.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const install = mkdtempSync(join(tmpdir(), "opencode-auto-vision-install-"));
mkdirSync(join(install, "node_modules"));
symlinkSync(ROOT, join(install, "node_modules", pkg.name), "dir");
afterAll(() => rmSync(install, { force: true, recursive: true }));

/** Resolve a specifier from inside the install, as a host resolving the installed package does. */
const resolveFromInstall = (specifier: string) => createRequire(join(install, "host.js")).resolve(specifier);

const load = async (specifier: string) => import(pathToFileURL(resolveFromInstall(specifier)).href);

/** A v1 plugin input with a client whose calls all resolve, and a project dir without config. */
function v1Input() {
  const ok = async () => ({ data: {} });
  const client = { app: { log: ok }, tui: { showToast: ok }, config: { providers: ok }, provider: { list: ok } };
  return { client, directory: mkdtempSync(join(tmpdir(), "opencode-auto-vision-project-")) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

describe("package manifest", () => {
  it("main and the root export name the same built file", () => {
    // A resolver that ignores `exports` falls back to `main`; both must land on the legacy entry.
    expect(`./${pkg.main}`).toBe(pkg.exports["."].default);
  });

  it("ships every entry: they all live in dist/, which is published", () => {
    expect(pkg.files).toContain("dist");
    for (const target of Object.values<{ default: string }>(pkg.exports)) expect(target.default.startsWith("./dist/")).toBe(true);
  });
});

describe("OpenCode 1.0 – 1.3.3: the package root, every export called", () => {
  it("the root resolves to the built legacy entry", () => {
    expect(resolveFromInstall(pkg.name)).toBe(join(ROOT, "dist", "entry", "legacy.js"));
  });

  it("every export is a plugin function and there is exactly one", async () => {
    const mod: Record<string, unknown> = await load(pkg.name);
    // 1.0.x calls each export without deduplicating, so a second export
    // pointing at the same function would register the hook twice.
    const hooks = [];
    for (const entry of Object.values(mod)) {
      expect(typeof entry).toBe("function");
      hooks.push(await (entry as (input: unknown) => Promise<Record<string, unknown>>)(v1Input()));
    }

    expect(hooks).toHaveLength(1);
    expect(Object.keys(hooks[0])).toEqual(["experimental.chat.messages.transform"]);
  });
});

describe("OpenCode 1.3.4+: exports['./server'], an {id, server} object", () => {
  it("the server export resolves to the built server entry", () => {
    expect(resolveFromInstall(`${pkg.name}/server`)).toBe(join(ROOT, "dist", "entry", "server.js"));
  });

  it("readV1Plugin accepts it and the server function yields the hook", async () => {
    const value = (await load(`${pkg.name}/server`)).default;

    // readV1Plugin: an object with a function `server`, not also `tui`.
    expect(isRecord(value)).toBe(true);
    expect(value.id).toBe(pkg.name);
    expect(typeof value.server).toBe("function");
    expect(value.tui).toBeUndefined();
    expect(Object.keys(await value.server(v1Input()))).toEqual(["experimental.chat.messages.transform"]);
  });

  it("engines.opencode admits the OpenCode 1 releases that have the hook, from 1.2.0", () => {
    expect(pkg.engines.opencode).toBe("^1.2.0");
  });
});

// No OpenCode 2 entry yet: written for OpenCode 1's hooks, the plugin must be
// turned away by OpenCode 2, not run half-working. Adding `setup` is the
// deliberate change that flips this.
describe("OpenCode 2: <name>/server must default to an {id, setup} object", () => {
  it("is rejected: the server entry has no setup", async () => {
    const value = (await load(`${pkg.name}/server`)).default;
    expect(isRecord(value) && typeof value.setup === "function").toBe(false);
  });
});
