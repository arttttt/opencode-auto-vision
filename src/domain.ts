// Domain — pure policy. No IO, no SDK, no side effects.
// Depends only on its own types (ports) and constants. Fully unit-testable.

import {
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  DEFAULT_PROMPT_TEMPLATE_SINGLE,
  DEFAULT_PROMPT_TEMPLATE_MULTIPLE,
} from "./constants.js";
import type {
  MediaKind,
  MediaRef,
  SavedMedia,
  PluginConfig,
  ModelInfo,
} from "./ports.js";

export function mimeToKind(mime: string): MediaKind | null {
  const m = mime.toLowerCase();
  if (IMAGE_MIME_TYPES.has(m)) return "image";
  if (VIDEO_MIME_TYPES.has(m)) return "video";
  return null;
}

/**
 * Pure selection: keep only refs whose kind the model can't handle natively.
 * The caller has already resolved `unsupported` via CapabilityGateway.
 */
export function selectMediaToRoute(
  refs: MediaRef[],
  unsupported: Set<MediaKind>,
): MediaRef[] {
  return refs.filter((r) => unsupported.has(r.kind));
}

function applyTemplate(
  template: string,
  vars: {
    mediaList: string;
    mediaCount: number;
    kind: string;
    toolName: string;
    userText: string;
  },
): string {
  return template
    .replaceAll("{mediaList}", vars.mediaList)
    .replaceAll("{mediaCount}", String(vars.mediaCount))
    .replaceAll("{kind}", vars.kind)
    .replaceAll("{toolName}", vars.toolName)
    .replaceAll("{userText}", vars.userText);
}

/** Build the text instruction that replaces the stripped media parts. */
export function buildInjectionPrompt(
  media: SavedMedia[],
  userText: string,
  config: PluginConfig,
): string {
  if (media.length === 0) return userText;

  const mediaList = media
    .map((m, idx) => {
      const tool = m.kind === "video" ? config.videoTool : config.imageTool;
      return `- ${m.kind} ${idx + 1}: ${m.path}  (use \`${tool}\`)`;
    })
    .join("\n");

  const kinds = new Set(media.map((m) => m.kind));
  const toolName =
    kinds.size === 1
      ? media[0].kind === "video"
        ? config.videoTool
        : config.imageTool
      : `${config.imageTool} / ${config.videoTool}`;
  const kindLabel = kinds.size === 1 ? [...kinds][0] : "mixed";

  const template =
    config.promptTemplate ??
    (media.length === 1
      ? DEFAULT_PROMPT_TEMPLATE_SINGLE
      : DEFAULT_PROMPT_TEMPLATE_MULTIPLE);

  return applyTemplate(template, {
    mediaList,
    mediaCount: media.length,
    kind: kindLabel,
    toolName,
    userText: userText || "(analyze the media)",
  });
}

// --- Model pattern matching (escape hatch: forceModels) ---

function matchesWildcard(pattern: string, value: string): boolean {
  const p = pattern.toLowerCase();
  const v = value.toLowerCase();
  if (p === "*") return true;
  if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
    return v.includes(p.slice(1, -1));
  }
  if (p.endsWith("*")) return v.startsWith(p.slice(0, -1));
  if (p.startsWith("*")) return v.endsWith(p.slice(1));
  return v === p;
}

export function modelMatchesPattern(
  pattern: string,
  model: ModelInfo,
): boolean {
  if (pattern === "*") return true;
  const slash = pattern.indexOf("/");
  if (slash === -1) {
    return (
      matchesWildcard(pattern, model.modelID) ||
      matchesWildcard(pattern, model.providerID)
    );
  }
  return (
    matchesWildcard(pattern.slice(0, slash), model.providerID) &&
    matchesWildcard(pattern.slice(slash + 1), model.modelID)
  );
}

export function modelMatchesAnyPattern(
  patterns: string[],
  model: ModelInfo | undefined,
): boolean {
  if (!model) return false;
  return patterns.some((p) => modelMatchesPattern(p, model));
}
