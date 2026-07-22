// Adapter — loads PluginConfig from disk (json/jsonc). Returns a value;
// no module-global state. Project config takes precedence over user config.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import stripJsonComments from "strip-json-comments";
import {
  CONFIG_FILENAME,
  CONFIG_FILENAME_JSONC,
  DEFAULT_IMAGE_TOOL,
  DEFAULT_VIDEO_TOOL,
  DEFAULT_CLEANUP_AFTER_HOURS,
} from "../constants.js";
import type { PluginConfig } from "../ports.js";

export function defaultConfig(): PluginConfig {
  return {
    imageTool: DEFAULT_IMAGE_TOOL,
    videoTool: DEFAULT_VIDEO_TOOL,
    cleanupAfterHours: DEFAULT_CLEANUP_AFTER_HOURS,
    forceModels: [],
  };
}

function readJsonc(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(stripJsonComments(readFileSync(path, "utf8")));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Merge only recognized, correctly-typed keys over the defaults. */
function withOverrides(raw: Record<string, unknown>): PluginConfig {
  const cfg = defaultConfig();
  if (typeof raw.imageTool === "string") cfg.imageTool = raw.imageTool;
  if (typeof raw.videoTool === "string") cfg.videoTool = raw.videoTool;
  if (typeof raw.cleanupAfterHours === "number") {
    cfg.cleanupAfterHours = raw.cleanupAfterHours;
  }
  if (typeof raw.promptTemplate === "string") {
    cfg.promptTemplate = raw.promptTemplate;
  }
  if (Array.isArray(raw.forceModels)) {
    cfg.forceModels = raw.forceModels.filter(
      (x): x is string => typeof x === "string",
    );
  }
  return cfg;
}

function candidates(directory: string): string[] {
  const home = process.env.HOME ?? "";
  return [
    join(directory, ".opencode", CONFIG_FILENAME_JSONC),
    join(directory, ".opencode", CONFIG_FILENAME),
    join(home, ".config", "opencode", CONFIG_FILENAME_JSONC),
    join(home, ".config", "opencode", CONFIG_FILENAME),
  ];
}

export function loadConfig(directory: string): PluginConfig {
  for (const path of candidates(directory)) {
    const raw = readJsonc(path);
    if (raw) return withOverrides(raw);
  }
  return defaultConfig();
}
