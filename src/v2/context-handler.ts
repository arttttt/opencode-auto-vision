// Application layer, OpenCode 2 — the `context` hook use-case: the v2
// counterpart of buildTransformHandler, over v2's message shape.
//
// OpenCode 2 strips media a model can't read itself, after this hook runs;
// what the plugin adds is the routing: the media saved to a stable file and
// an instruction to read it with a vision MCP tool.

import { buildInjectionPrompt } from "../domain.js";
import type { CapabilityGateway, Logger, MediaStore, ModelInfo, Notifier, PluginConfig, SavedMedia } from "../ports.js";
import { unsupportedKinds } from "../plugin.js";
import { debug } from "../debug.js";
import type { V2MediaPart, V2SessionContext } from "./host.js";
import { findLastUserMessage, isTextPart, projectMediaRefs, toMediaSource, withRoutedMedia } from "./messages.js";

export type ContextDeps = {
  config: PluginConfig;
  capabilities: CapabilityGateway;
  store: MediaStore;
  log: Logger;
  notify: Notifier;
};

export function buildContextHandler(deps: ContextDeps) {
  const { config, capabilities, store, log, notify } = deps;

  return async (event: V2SessionContext): Promise<void> => {
    const index = findLastUserMessage(event.messages);
    if (index === -1) return;
    const message = event.messages[index];
    const model: ModelInfo = { providerID: event.model.providerID, modelID: event.model.id };

    const refs = projectMediaRefs(message);
    if (refs.length === 0) return;

    const unsupported = await unsupportedKinds(refs.map((ref) => ref.kind), model, capabilities, config);
    if (unsupported.size === 0) return;
    const toRoute = refs.filter((ref) => unsupported.has(ref.kind));
    debug(`v2 toRoute: ${toRoute.length}`);
    log(`routing ${toRoute.length} media part(s) for ${model.providerID}/${model.modelID}`);

    const routed = new Set<V2MediaPart>();
    const saved: SavedMedia[] = [];
    for (const ref of toRoute) {
      // Stripped even when it can't be saved: the model can't read it anyway.
      routed.add(ref.part);
      const out = await store.save(toMediaSource(ref));
      if (out) saved.push(out);
    }

    if (saved.length === 0) {
      notify.error("Could not process attached media. Check logs for details.", "Auto Vision");
      event.messages[index] = withRoutedMedia(message, routed, null);
      return;
    }
    if (saved.length < toRoute.length) {
      notify.warn(`${saved.length} of ${toRoute.length} media item(s) were processed. Some could not be saved.`, "Auto Vision");
    }

    const userText = message.content.find(isTextPart)?.text ?? "";
    event.messages[index] = withRoutedMedia(message, routed, buildInjectionPrompt(saved, userText, config));
  };
}
