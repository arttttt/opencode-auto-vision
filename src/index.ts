import type { Plugin } from "@opencode-ai/plugin";
import type { FilePart, TextPart } from "@opencode-ai/sdk";
import { PLUGIN_NAME } from "./constants.js";
import { loadPluginConfig, getForceModels } from "./config.js";
import { cleanupOldTempFiles } from "./cleanup.js";
import { modelSupportsMedia } from "./capabilities.js";
import {
  isMediaFilePart,
  kindForMime,
  extractMediaFromParts,
} from "./media.js";
import { generateInjectionPrompt } from "./prompt.js";
import { modelMatchesAnyPattern } from "./patterns.js";
import {
  findLastUserMessage,
  getModelFromMessage,
  removePartsByIds,
  withUpdatedTextPart,
} from "./transform.js";
import type { Logger, Notifier, MediaKind } from "./types.js";

export const AutoVisionPlugin: Plugin = async (input) => {
  const { client, directory } = input;

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

  await loadPluginConfig(directory, log);
  await cleanupOldTempFiles(log);
  log("plugin initialized");

  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      const { messages } = output;
      const result = findLastUserMessage(messages);
      if (!result) return;
      const { message: lastUser, index: lastUserIndex } = result;

      const mediaParts = lastUser.parts.filter(isMediaFilePart) as FilePart[];
      if (mediaParts.length === 0) return;

      const model = getModelFromMessage(lastUser);

      // Which media kinds are present in this message?
      const kindsPresent = new Set<MediaKind>();
      for (const p of mediaParts) {
        const k = kindForMime(p.mime);
        if (k) kindsPresent.add(k);
      }

      // Which of those can't the model handle natively? (capability auto-detect)
      const unsupported = new Set<MediaKind>();
      for (const k of kindsPresent) {
        const ok = await modelSupportsMedia(client, model, k);
        if (!ok) unsupported.add(k);
      }

      // Escape hatch: forceModels overrides capabilities.
      if (modelMatchesAnyPattern(getForceModels(), model)) {
        for (const k of kindsPresent) unsupported.add(k);
      }

      // If the model handles every present kind natively, do nothing.
      if (unsupported.size === 0) return;

      const toProcess = mediaParts.filter((p) => {
        const k = kindForMime(p.mime);
        return k !== null && unsupported.has(k);
      });
      if (toProcess.length === 0) return;

      // Collect every id we intend to strip — even parts that fail to save must be
      // removed, otherwise a raw data: blob leaks through and still breaks the model.
      const allIds = new Set(toProcess.map((p) => p.id));

      log(
        `processing ${toProcess.length} unsupported media part(s) for ${model?.providerID ?? "?"}/${model?.modelID ?? "?"}`,
      );

      const saved = await extractMediaFromParts(toProcess, log, notify);
      if (saved.length === 0) {
        log("failed to process any media");
        notify.error(
          "Could not process attached media. Check logs for details.",
          "Auto Vision",
        );
        messages[lastUserIndex] = {
          ...lastUser,
          parts: removePartsByIds(lastUser.parts, allIds),
        };
        return;
      }
      if (saved.length < toProcess.length) {
        notify.warn(
          `${saved.length} of ${toProcess.length} media item(s) were processed. Some could not be saved.`,
          "Auto Vision",
        );
      }

      const existingText =
        lastUser.parts.find((p): p is TextPart => p.type === "text")?.text ??
        "";
      const injection = generateInjectionPrompt(saved, existingText);

      messages[lastUserIndex] = {
        ...lastUser,
        parts: withUpdatedTextPart(
          { ...lastUser, parts: removePartsByIds(lastUser.parts, allIds) },
          injection,
        ),
      };
    },
  };
};

export default AutoVisionPlugin;
