export const PLUGIN_NAME = "auto-vision";

export const CONFIG_FILENAME = "opencode-auto-vision.json";
export const CONFIG_FILENAME_JSONC = "opencode-auto-vision.jsonc";
export const TEMP_DIR_NAME = "opencode-auto-vision";

/** MCP tool names have a defined upper bound; treat longer as misconfiguration. */
export const MAX_TOOL_NAME_LENGTH = 256;

export const IMAGE_MIME_TO_EXT: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

export const VIDEO_MIME_TO_EXT: Readonly<Record<string, string>> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
};

export const IMAGE_MIME_TYPES: ReadonlySet<string> = new Set(
  Object.keys(IMAGE_MIME_TO_EXT),
);
export const VIDEO_MIME_TYPES: ReadonlySet<string> = new Set(
  Object.keys(VIDEO_MIME_TO_EXT),
);

export const DEFAULT_IMAGE_TOOL = "analyze_image";
export const DEFAULT_VIDEO_TOOL = "analyze_video";
export const DEFAULT_CLEANUP_AFTER_HOURS = 24;

export const DEFAULT_PROMPT_TEMPLATE_SINGLE = `The user shared {kind} media, but the current model cannot process it directly. It has been saved to:
{mediaList}

Use the \`{toolName}\` tool with the path above to analyze it before answering.

User's request: {userText}`;

export const DEFAULT_PROMPT_TEMPLATE_MULTIPLE = `The user shared {mediaCount} media items, but the current model cannot process them directly. They have been saved to:
{mediaList}

Use the \`{toolName}\` tool with each path above to analyze them before answering.

User's request: {userText}`;

export const PROMPT_TEMPLATE_VARIABLES = [
  "{mediaList}",
  "{mediaCount}",
  "{kind}",
  "{toolName}",
  "{userText}",
] as const;
