export type ModelInfo = {
  providerID: string;
  modelID: string;
};

export type MediaKind = "image" | "video";

export type SavedMedia = {
  /** Local file path or remote URL handed to the MCP tool. */
  path: string;
  mime: string;
  kind: MediaKind;
  partId: string;
};

export type Logger = (msg: string) => void;

export type Notifier = {
  warn: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
};

export type PluginConfig = {
  imageTool: string;
  videoTool: string;
  tempDir: string;
  cleanupAfterHours: number;
  promptTemplate?: string;
  /** Patterns that force interception regardless of capability. */
  forceModels?: string[];
};
