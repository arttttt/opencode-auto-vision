import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import stripJsonComments from "strip-json-comments";
import {
  CONFIG_FILENAME,
  CONFIG_FILENAME_JSONC,
  TEMP_DIR_NAME,
  DEFAULT_IMAGE_TOOL,
  DEFAULT_VIDEO_TOOL,
  DEFAULT_CLEANUP_AFTER_HOURS,
} from "./constants.js";
import type { PluginConfig, Logger } from "./types.js";

const DEFAULTS: PluginConfig = {
  imageTool: DEFAULT_IMAGE_TOOL,
  videoTool: DEFAULT_VIDEO_TOOL,
  tempDir: join(tmpdir(), TEMP_DIR_NAME),
  cleanupAfterHours: DEFAULT_CLEANUP_AFTER_HOURS,
};

let cfg: PluginConfig = { ...DEFAULTS };

function candidatePaths(directory: string): string[] {
  const home = process.env.HOME ?? "";
  return [
    join(directory, ".opencode", CONFIG_FILENAME_JSONC),
    join(directory, ".opencode", CONFIG_FILENAME),
    join(home, ".config", "opencode", CONFIG_FILENAME_JSONC),
    join(home, ".config", "opencode", CONFIG_FILENAME),
  ];
}

function readJsonc(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(stripJsonComments(readFileSync(path, "utf8")));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadPluginConfig(
  directory: string,
  log: Logger,
): Promise<void> {
  for (const p of candidatePaths(directory)) {
    const raw = readJsonc(p);
    if (raw) {
      cfg = {
        imageTool:
          typeof raw.imageTool === "string"
            ? raw.imageTool
            : DEFAULTS.imageTool,
        videoTool:
          typeof raw.videoTool === "string"
            ? raw.videoTool
            : DEFAULTS.videoTool,
        tempDir:
          typeof raw.tempDir === "string" ? raw.tempDir : DEFAULTS.tempDir,
        cleanupAfterHours:
          typeof raw.cleanupAfterHours === "number"
            ? raw.cleanupAfterHours
            : DEFAULTS.cleanupAfterHours,
        promptTemplate:
          typeof raw.promptTemplate === "string"
            ? raw.promptTemplate
            : undefined,
        forceModels: Array.isArray(raw.forceModels)
          ? raw.forceModels
          : undefined,
      };
      log(`loaded config from ${p}`);
      return;
    }
  }
  cfg = { ...DEFAULTS };
  log("no config file found, using defaults");
}

export function getConfig(): PluginConfig {
  return cfg;
}
export function getTempDir(): string {
  return cfg.tempDir;
}
export function getCleanupAfterHours(): number {
  return cfg.cleanupAfterHours;
}
export function getForceModels(): string[] {
  return cfg.forceModels ?? [];
}
