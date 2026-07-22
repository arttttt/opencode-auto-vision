import {
  DEFAULT_PROMPT_TEMPLATE_MULTIPLE,
  DEFAULT_PROMPT_TEMPLATE_SINGLE,
} from "./constants.js";
import { getConfig } from "./config.js";
import type { SavedMedia } from "./types.js";

// Since the target model can't natively read the media, we replace those parts
// with text instructions pointing the model at an MCP tool (e.g. analyze_image)
// via the saved file path or URL. The user's original text is preserved.

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

export function generateInjectionPrompt(
  media: SavedMedia[],
  userText: string,
): string {
  if (media.length === 0) return userText;

  const { imageTool, videoTool, promptTemplate } = getConfig();

  const mediaList = media
    .map((m, idx) => {
      const tool = m.kind === "video" ? videoTool : imageTool;
      return `- ${m.kind} ${idx + 1}: ${m.path}  (use \`${tool}\`)`;
    })
    .join("\n");

  const kinds = new Set(media.map((m) => m.kind));
  const toolName =
    kinds.size === 1
      ? media[0].kind === "video"
        ? videoTool
        : imageTool
      : `${imageTool} / ${videoTool}`;
  const kindLabel = kinds.size === 1 ? [...kinds][0] : "mixed";

  const template =
    promptTemplate ??
    (media.length === 1
      ? DEFAULT_PROMPT_TEMPLATE_SINGLE
      : DEFAULT_PROMPT_TEMPLATE_MULTIPLE);

  return applyTemplate(template, {
    mediaList,
    mediaCount: media.length,
    kind: kindLabel,
    toolName,
    // Blank user text would leave the model without an instruction.
    userText: userText || "(analyze the media)",
  });
}
