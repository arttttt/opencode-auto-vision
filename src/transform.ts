import type { Message, Part, TextPart } from "@opencode-ai/sdk";
import { randomUUID } from "node:crypto";
import type { ModelInfo } from "./types.js";

export function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

// Transformation flow:
// 1. findLastUserMessage  -> most recent request
// 2. extract+save unsupported media from its parts
// 3. remove those media parts (the model can't use raw blobs)
// 4. update the text part with injection instructions

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
