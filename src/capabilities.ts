import type { ModelInfo, MediaKind } from "./types.js";

type ProviderModel = {
  attachment?: boolean;
  modalities?: {
    input?: Array<"text" | "audio" | "image" | "video" | "pdf">;
  };
};
type ProviderEntry = { id: string; models?: Record<string, ProviderModel> };

// Provider catalog is stable for the process lifetime; cache it once.
let providersCache: Promise<ProviderEntry[]> | null = null;

function fetchProviders(client: unknown): Promise<ProviderEntry[]> {
  return (async () => {
    const res = await (
      client as {
        provider: { list: () => Promise<{ data?: { all?: ProviderEntry[] } }> };
      }
    ).provider.list();
    return res?.data?.all ?? [];
  })();
}

async function getProviders(client: unknown): Promise<ProviderEntry[]> {
  if (!providersCache) {
    providersCache = fetchProviders(client).catch((err) => {
      // Don't cache a rejection — next message can retry.
      providersCache = null;
      void err;
      return [];
    });
  }
  return providersCache;
}

/**
 * True if (providerID/modelID) natively supports the given media kind.
 *
 * Resolution order:
 *   1. provider catalog found, model known  -> use attachment + modalities.input
 *   2. model unknown / catalog unavailable  -> `true` (never interfere blindly)
 *
 * This is what makes the plugin "auto": vision-capable models are skipped
 * without any per-model config.
 */
export async function modelSupportsMedia(
  client: unknown,
  model: ModelInfo | undefined,
  kind: MediaKind,
): Promise<boolean> {
  if (!model) return true;
  try {
    const all = await getProviders(client);
    const m = all.find((p) => p.id === model.providerID)?.models?.[
      model.modelID
    ];
    if (!m) return true;
    if (m.attachment === false) return false;
    const inputs = m.modalities?.input;
    if (Array.isArray(inputs)) return inputs.includes(kind);
    return true;
  } catch {
    return true;
  }
}
