// Adapter — CapabilityGateway over OpenCode 2's model catalogue.
//
// OpenCode 2 lists a model's input modalities as strings,
// capabilities.input ⊂ "text"|"audio"|"image"|"video"|"pdf" — not the
// OpenCode 1 booleans the v1 gateway reads, which on this shape find
// nothing and answer "supported" for a text-only model. Its own parser here.
//
// "Supported" is also the answer whenever the catalogue can't say — the
// model is missing, or its entry has no input list: the plugin then leaves
// the media alone, and OpenCode 2 itself strips what the model can't read.

import { debug } from "../debug.js";
import type { CapabilityGateway, MediaKind, ModelInfo } from "../ports.js";
import type { V2Context, V2ModelInfo } from "./host.js";

export class V2CapabilityGateway implements CapabilityGateway {
  private cache: Promise<readonly V2ModelInfo[]> | null = null;

  constructor(
    private readonly model: V2Context["model"],
    private readonly directory: string,
  ) {}

  private catalogue(): Promise<readonly V2ModelInfo[]> {
    this.cache ??= this.model
      .list({ location: { directory: this.directory } })
      .then((result) => result?.data ?? [])
      .catch(() => {
        // Don't pin a failure: the next request asks again.
        this.cache = null;
        return [];
      });
    return this.cache;
  }

  async supports(model: ModelInfo | undefined, kind: MediaKind): Promise<boolean> {
    if (!model) return true;
    const entry = (await this.catalogue()).find((m) => m.providerID === model.providerID && m.id === model.modelID);
    const input = entry?.capabilities?.input;
    if (!Array.isArray(input)) {
      debug(`model ${model.providerID}/${model.modelID}: no input capabilities in the catalogue -> leave media`);
      return true;
    }
    return input.includes(kind);
  }
}
