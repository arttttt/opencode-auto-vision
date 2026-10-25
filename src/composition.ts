// Composition root — the only place that knows about concrete adapters and
// the opencode SDK client. Wires dependencies and registers the hook.
// (Everything else depends on ports, not on this wiring.)
// Not an entry: OpenCode loads the plugin through entry/legacy.ts or
// entry/server.ts.

import type { Plugin } from "@opencode-ai/plugin";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLUGIN_NAME, TEMP_DIR_NAME } from "./constants.js";
import { loadConfig } from "./adapters/config-loader.js";
import { cleanupOldTempFiles } from "./adapters/temp-cleanup.js";
import { OpencodeCapabilityGateway } from "./adapters/capability-gateway.js";
import { FileMediaStore } from "./adapters/media-store.js";
import { buildTransformHandler } from "./plugin.js";
import { debug, dump } from "./debug.js";
import type { Logger, Notifier } from "./ports.js";
import { V2CapabilityGateway } from "./v2/capability-gateway.js";
import { buildContextHandler } from "./v2/context-handler.js";
import type { V2Cleanup, V2Context } from "./v2/host.js";

/** The plugin's id for loaders that read one: its npm package name. */
export const PLUGIN_ID = "opencode-auto-vision";

export const AutoVisionPlugin: Plugin = async (input) => {
  const { client, directory } = input;
  debug("plugin module loaded");

  // Logging / notification adapters over the opencode client.
  const log: Logger = (msg) => {
    client.app
      .log({ body: { service: PLUGIN_NAME, level: "info", message: msg } })
      .catch(() => {});
  };
  const notify: Notifier = {
    warn: (message, title) => {
      client.app
        .log({ body: { service: PLUGIN_NAME, level: "warn", message } })
        .catch(() => {});
      client.tui
        .showToast({
          body: {
            title: title ?? "Auto Vision",
            message,
            variant: "warning",
            duration: 5000,
          },
        })
        .catch(() => {});
    },
    error: (message, title) => {
      client.app
        .log({ body: { service: PLUGIN_NAME, level: "error", message } })
        .catch(() => {});
      client.tui
        .showToast({
          body: {
            title: title ?? "Auto Vision",
            message,
            variant: "error",
            duration: 5000,
          },
        })
        .catch(() => {});
    },
  };

  // Config (value, not global) + one-shot temp cleanup.
  // Temp dir is always the system temp + our subdir — not user-overridable.
  const tempDir = join(tmpdir(), TEMP_DIR_NAME);
  const config = loadConfig(directory);
  await cleanupOldTempFiles(tempDir, config.cleanupAfterHours, log);
  debug("plugin initialized");
  log("plugin initialized");

  // Adapters behind ports.
  const capabilities = new OpencodeCapabilityGateway(client);
  const store = new FileMediaStore(tempDir, log, notify);

  const handler = buildTransformHandler({
    config,
    capabilities,
    store,
    log,
    notify,
  });

  return {
    "experimental.chat.messages.transform": async (input, output) => {
      debug("=== transform hook fired ===");
      // Full dump of what the plugin receives (data URLs/base64 truncated).
      dump("messages", output.messages);
      try {
        await handler(input, output);
        dump("messages(after)", output.messages);
      } catch (e) {
        debug(`transform error: ${e instanceof Error ? e.stack : String(e)}`);
        throw e;
      }
    },
  };
};

/**
 * OpenCode 2's `setup`: the same plugin over v2's API. The `context` hook
 * (the agent loop's requests only, by the user's choice) routes media;
 * v2's server API has no log or toast service, so failures go to the
 * console only — nothing is written into the session.
 */
export async function openCodeV2Setup(ctx: V2Context): Promise<V2Cleanup> {
  const log: Logger = (msg) => console.info(`[${PLUGIN_NAME}] ${msg}`);
  const notify: Notifier = {
    warn: (message) => console.warn(`[${PLUGIN_NAME}] ${message}`),
    error: (message) => console.error(`[${PLUGIN_NAME}] ${message}`),
  };

  const tempDir = join(tmpdir(), TEMP_DIR_NAME);
  const config = loadConfig(ctx.location.directory);
  await cleanupOldTempFiles(tempDir, config.cleanupAfterHours, log);

  const handler = buildContextHandler({
    config,
    capabilities: new V2CapabilityGateway(ctx.model, ctx.location.directory),
    store: new FileMediaStore(tempDir, log, notify),
    log,
    notify,
  });
  const registration = await ctx.session.hook("context", async (event) => {
    debug("=== v2 context hook fired ===");
    await handler(event);
  });
  return () => registration.dispose();
}
