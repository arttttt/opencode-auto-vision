// OpenCode 2 message boundary — the v2 counterpart of sdk.ts: the only place
// that knows v2's Message / MediaPart shapes.

import { createHash } from "node:crypto";
import { IMAGE_MIME_TO_EXT, VIDEO_MIME_TO_EXT } from "../constants.js";
import { mimeToKind } from "../domain.js";
import type { MediaKind, MediaSource } from "../ports.js";
import type { V2ContentPart, V2MediaPart, V2Message, V2TextPart } from "./host.js";

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    [...Object.entries(IMAGE_MIME_TO_EXT), ...Object.entries(VIDEO_MIME_TO_EXT)].map(([mime, ext]) => [ext, mime]),
  ),
  jpeg: "image/jpeg",
};

/** A media part the plugin can route, with what it resolved about it. */
export type V2MediaRef = {
  part: V2MediaPart;
  mime: string;
  kind: MediaKind;
};

export function isMediaPart(part: V2ContentPart): part is V2MediaPart {
  return part.type === "media" && typeof (part as V2MediaPart).media === "object";
}

export function isTextPart(part: V2ContentPart): part is V2TextPart {
  return part.type === "text" && typeof (part as V2TextPart).text === "string";
}

export function findLastUserMessage(messages: V2Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return i;
  return -1;
}

function extensionOf(name: string | undefined): string | null {
  if (!name) return null;
  const path = name.split(/[?#]/)[0];
  const dot = path.lastIndexOf(".");
  return dot === -1 || dot < path.lastIndexOf("/") ? null : path.slice(dot + 1).toLowerCase();
}

/**
 * The media type of a part: as declared, else as the host derived it, else —
 * for a url or ref sent without one — guessed from the filename or the url's
 * extension. null when it is none of the image/video types the plugin routes.
 */
export function mediaTypeOf(part: V2MediaPart): string | null {
  const { source, mediaType: derived } = part.media;
  const declared = source.mediaType ?? derived;
  if (declared && mimeToKind(declared)) return declared.toLowerCase();
  const guessed =
    MIME_BY_EXTENSION[extensionOf(part.filename) ?? ""] ??
    (source.type === "url" ? MIME_BY_EXTENSION[extensionOf(source.url) ?? ""] : undefined);
  return guessed ?? null;
}

/**
 * The media parts of `message` the plugin can route. Not a provider-side
 * `ref`: no vision tool can read the provider's own file, so it is left to
 * the host, which strips it if the model can't read it either.
 */
export function projectMediaRefs(message: V2Message): V2MediaRef[] {
  const refs: V2MediaRef[] = [];
  for (const part of message.content) {
    if (!isMediaPart(part) || part.media.source.type === "ref") continue;
    const mime = mediaTypeOf(part);
    const kind = mime ? mimeToKind(mime) : null;
    if (mime && kind) refs.push({ part, mime, kind });
  }
  return refs;
}

/**
 * The neutral MediaStore input for a part: inline media as a data: url, a
 * url as itself. v2 parts carry no ids, so the stable key the store names
 * the file by is a hash of the content — the same attachment keeps the same
 * path across the re-sent requests of a session.
 */
export function toMediaSource(ref: V2MediaRef): MediaSource {
  const { source } = ref.part.media;
  const url =
    source.type === "base64"
      ? `data:${ref.mime};base64,${source.data}`
      : source.type === "bytes"
        ? `data:${ref.mime};base64,${Buffer.from(source.data).toString("base64")}`
        : source.type === "url"
          ? source.url
          : "";
  const partId = `v2-${createHash("sha256").update(url).digest("hex")}`;
  return { partId, mime: ref.mime, kind: ref.kind, url };
}

/** `message` without `routed` parts and with `text` as its first text part. */
export function withRoutedMedia(message: V2Message, routed: ReadonlySet<V2MediaPart>, text: string | null): V2Message {
  const kept = message.content.filter((part) => !(isMediaPart(part) && routed.has(part)));
  if (text === null) return rebuild(message, kept);
  const index = kept.findIndex(isTextPart);
  const content = index === -1 ? [{ type: "text", text } as V2TextPart, ...kept] : kept.map((part, i) => (i === index ? { ...part, text } : part));
  return rebuild(message, content);
}

/**
 * A copy of `message` with new content. v2 messages are Schema class
 * instances: the copy is made by the same class, so it stays one.
 */
function rebuild(message: V2Message, content: V2ContentPart[]): V2Message {
  const props = { ...message, content };
  const Class: unknown = message.constructor;
  if (typeof Class === "function" && Class !== Object) {
    try {
      return new (Class as new (props: V2Message) => V2Message)(props);
    } catch {
      // Fall through to a plain copy.
    }
  }
  return props;
}
