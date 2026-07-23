// Composition root — the only place that knows about concrete adapters and
// the opencode SDK client. Wires dependencies and registers the hook.
// (Everything else depends on ports, not on this wiring.)

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

export default AutoVisionPlugin;
