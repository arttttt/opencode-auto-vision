// Adapter — CapabilityGateway over the opencode provider catalog.
// Implements the port; owns its own cache as instance state (no module globals).

import type { CapabilityGateway, ModelInfo, MediaKind } from "../ports.js";

type ProviderModel = {
  attachment?: boolean;
  modalities?: { input?: Array<"text" | "audio" | "image" | "video" | "pdf"> };
};
type ProviderEntry = { id: string; models?: Record<string, ProviderModel> };

type ProviderListClient = {
  provider: {
    list: () => Promise<{ data?: { all?: ProviderEntry[] } }>;
  };
};

export class OpencodeCapabilityGateway implements CapabilityGateway {
  private cache: Promise<ProviderEntry[]> | null = null;

  constructor(private readonly client: ProviderListClient) {}

  private async catalog(): Promise<ProviderEntry[]> {
    if (!this.cache) {
      this.cache = this.client.provider
        .list()
        .then((res) => res?.data?.all ?? [])
        .catch((err) => {
          // Don't pin a rejected promise — allow the next call to retry.
          this.cache = null;
          void err;
          return [];
        });
    }
    return this.cache;
  }

  async supports(
    model: ModelInfo | undefined,
    kind: MediaKind,
  ): Promise<boolean> {
    if (!model) return true;
    try {
      const all = await this.catalog();
      const m = all.find((p) => p.id === model.providerID)?.models?.[
        model.modelID
      ];
      // Unknown model -> assume supported (never interfere blindly).
      if (!m) return true;
      if (m.attachment === false) return false;
      const inputs = m.modalities?.input;
      return Array.isArray(inputs) ? inputs.includes(kind) : true;
    } catch {
      return true;
    }
  }
}
