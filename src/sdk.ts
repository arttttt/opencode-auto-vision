// SDK boundary — thin helpers over @opencode-ai/sdk message/part types.
// This is the only place that knows about opencode's Message/Part shapes;
// the rest of the codebase talks to neutral ports.

import type { Message, Part, TextPart, FilePart } from "@opencode-ai/sdk";
import { randomUUID } from "node:crypto";
import { IMAGE_MIME_TYPES, VIDEO_MIME_TYPES } from "./constants.js";
import { mimeToKind } from "./domain.js";
import type { ModelInfo, MediaRef } from "./ports.js";

const MEDIA_MIME_TYPES: ReadonlySet<string> = new Set([
  ...IMAGE_MIME_TYPES,
  ...VIDEO_MIME_TYPES,
]);

export function isMediaFilePart(part: Part): part is FilePart {
  return (
    part.type === "file" &&
    MEDIA_MIME_TYPES.has((part as FilePart).mime?.toLowerCase() ?? "")
  );
}

export function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

export function findLastUserMessage(
  messages: Array<{ info: Message; parts: Part[] }>,
): { message: { info: Message; parts: Part[] }; index: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "user") {
      return { message: messages[i], index: i };
    }
  }
  return null;
}

export function getModelFromMessage(message: {
  info: Message;
}): ModelInfo | undefined {
  return (message.info as { model?: ModelInfo }).model;
}

/** Project SDK media FileParts into neutral MediaRef[]. */
export function projectMediaRefs(parts: Part[]): MediaRef[] {
  const refs: MediaRef[] = [];
  for (const part of parts) {
    if (!isMediaFilePart(part)) continue;
    const fp = part as FilePart;
    const kind = mimeToKind(fp.mime);
    if (kind) refs.push({ id: fp.id, mime: fp.mime, kind });
  }
  return refs;
}

export function removePartsByIds(parts: Part[], ids: Set<string>): Part[] {
  return parts.filter((part) => !(part.type === "file" && ids.has(part.id)));
}

export function withUpdatedTextPart(
  message: { info: Message; parts: Part[] },
  newText: string,
): Part[] {
  const idx = message.parts.findIndex(isTextPart);
  if (idx !== -1) {
    return message.parts.map((part, i) =>
      i === idx ? ({ ...part, text: newText } as TextPart) : part,
    );
  }
  const newPart: TextPart = {
    id: `autovision-${randomUUID()}`,
    sessionID: message.info.sessionID,
    messageID: message.info.id,
    type: "text",
    text: newText,
    synthetic: true,
  };
  return [newPart, ...message.parts];
}
