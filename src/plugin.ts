// Application layer — the transform use-case.
// Orchestrates domain policy through injected ports (no concrete IO here).
// This is the only place that knows the end-to-end flow; everything else
// is either pure policy (domain.ts) or an adapter behind a port.

import type { Message, Part, FilePart } from "@opencode-ai/sdk";
import type {
  CapabilityGateway,
  MediaStore,
  PluginConfig,
  Logger,
  Notifier,
  MediaKind,
} from "./ports.js";
import {
  selectMediaToRoute,
  buildInjectionPrompt,
  modelMatchesAnyPattern,
} from "./domain.js";
import {
  findLastUserMessage,
  getModelFromMessage,
  projectMediaRefs,
  removePartsByIds,
  withUpdatedTextPart,
  isTextPart,
} from "./sdk.js";
import { debug, dump } from "./debug.js";

export type TransformDeps = {
  config: PluginConfig;
  capabilities: CapabilityGateway;
  store: MediaStore;
  log: Logger;
  notify: Notifier;
};

type TransformOutput = {
  messages: Array<{ info: Message; parts: Part[] }>;
};

/**
 * Returns the `experimental.chat.messages.transform` handler.
 * For each user message carrying media the model can't handle natively:
 * resolve a stable path via MediaStore, strip the raw media parts (which would
 * otherwise error on non-vision models), and inject a text instruction.
 */
export function buildTransformHandler(deps: TransformDeps) {
  const { config, capabilities, store, log, notify } = deps;

  return async (_input: unknown, output: TransformOutput): Promise<void> => {
    const messages = output.messages;
    const result = findLastUserMessage(messages);
    if (!result) {
      debug("no user message found");
      return;
    }
    const { message: lastUser, index } = result;
    const model = getModelFromMessage(lastUser);
    debug(`last user message: model=${model?.providerID ?? "?"}/${model?.modelID ?? "?"}, parts=${lastUser.parts.length} types=[${lastUser.parts.map((p) => p.type).join(",")}]`);

    const refs = projectMediaRefs(lastUser.parts);
    dump("media refs detected", refs);
    if (refs.length === 0) {
      debug("no media refs -> nothing to route");
      return;
    }

    // Which present kinds can't the model handle? (capability auto-detect)
    const kindsPresent = new Set<MediaKind>(refs.map((r) => r.kind));
    const unsupported = new Set<MediaKind>();
    for (const kind of kindsPresent) {
      const ok = await capabilities.supports(model, kind);
      debug(`capability ${model?.modelID ?? "?"} supports ${kind}: ${ok}`);
      if (!ok) unsupported.add(kind);
    }
    // Escape hatch: forceModels overrides capabilities.
    if (modelMatchesAnyPattern(config.forceModels, model)) {
      debug("forceModels match -> marking all present kinds unsupported");
      for (const kind of kindsPresent) unsupported.add(kind);
    }
    if (unsupported.size === 0) {
      debug("model supports all present kinds -> leaving native");
      return; // model handles everything natively
    }

    const toRoute = selectMediaToRoute(refs, unsupported);
    debug(`toRoute: ${toRoute.length}`);
    if (toRoute.length === 0) return;

    // Strip every routed id even if a save later fails — a raw data: blob
    // left in parts still breaks a non-vision model.
    const ids = new Set(toRoute.map((r) => r.id));
    log(
      `routing ${toRoute.length} media part(s) for ${model?.providerID ?? "?"}/${model?.modelID ?? "?"}`,
    );

    const partById = new Map(lastUser.parts.map((p) => [p.id, p as FilePart]));
    const saved = [];
    for (const ref of toRoute) {
      const fp = partById.get(ref.id);
      if (!fp) continue;
      const out = await store.save({
        partId: fp.id,
        mime: fp.mime,
        kind: ref.kind,
        url: fp.url,
      });
      if (out) saved.push(out);
    }
    dump("saved media", saved);

    if (saved.length === 0) {
      log("failed to process any media");
      notify.error(
        "Could not process attached media. Check logs for details.",
        "Auto Vision",
      );
      messages[index] = {
        ...lastUser,
        parts: removePartsByIds(lastUser.parts, ids),
      };
      return;
    }
    if (saved.length < toRoute.length) {
      notify.warn(
        `${saved.length} of ${toRoute.length} media item(s) were processed. Some could not be saved.`,
        "Auto Vision",
      );
    }

    const userText = lastUser.parts.find(isTextPart)?.text ?? "";
    const injection = buildInjectionPrompt(saved, userText, config);
    messages[index] = {
      ...lastUser,
      parts: withUpdatedTextPart(
        { ...lastUser, parts: removePartsByIds(lastUser.parts, ids) },
        injection,
      ),
    };
  };
}
