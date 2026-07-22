import type { Part, FilePart } from "@opencode-ai/sdk";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  IMAGE_MIME_TYPES,
  IMAGE_MIME_TO_EXT,
  VIDEO_MIME_TYPES,
  VIDEO_MIME_TO_EXT,
} from "./constants.js";
import { getTempDir } from "./config.js";
import type { SavedMedia, MediaKind, Logger, Notifier } from "./types.js";

export function isMediaFilePart(part: Part): part is FilePart {
  if (part.type !== "file") return false;
  const mime = (part as FilePart).mime?.toLowerCase() ?? "";
  return IMAGE_MIME_TYPES.has(mime) || VIDEO_MIME_TYPES.has(mime);
}

export function kindForMime(mime: string): MediaKind | null {
  const m = mime.toLowerCase();
  if (IMAGE_MIME_TYPES.has(m)) return "image";
  if (VIDEO_MIME_TYPES.has(m)) return "video";
  return null;
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  return IMAGE_MIME_TO_EXT[m] ?? VIDEO_MIME_TO_EXT[m] ?? "bin";
}

/**
 * Stable filename derived from the part id (sha256). OpenCode re-runs message
 * transforms after tool calls; a stable name keeps every pass for the same
 * attachment pointed at the path already shown to the model (no duplicates).
 */
function stableFilename(partId: string, mime: string): string {
  const id = createHash("sha256").update(partId).digest("hex");
  return `${id}.${extForMime(mime)}`;
}

async function ensureTempDir(): Promise<string> {
  const dir = getTempDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

async function saveBytesToTemp(
  data: Buffer,
  mime: string,
  partId: string,
): Promise<string> {
  const dir = await ensureTempDir();
  const filepath = join(dir, stableFilename(partId, mime));
  await writeFile(filepath, data);
  return filepath;
}

async function processMediaPart(
  part: FilePart,
  log: Logger,
  notify: Notifier,
): Promise<SavedMedia | null> {
  const url = part.url;
  const kind = kindForMime(part.mime);
  if (!kind) return null;
  if (!url) {
    log(`skip ${part.id}: no url`);
    return null;
  }

  // file:// -> already on disk
  if (url.startsWith("file://")) {
    const localPath = fileURLToPath(url);
    log(`media already on disk: ${localPath}`);
    return { path: localPath, mime: part.mime, kind, partId: part.id };
  }

  // data: -> base64 decode and save to temp
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      log(`failed to parse data url for ${part.id}`);
      return null;
    }
    try {
      const saved = await saveBytesToTemp(
        Buffer.from(match[2], "base64"),
        part.mime,
        part.id,
      );
      log(`saved data url -> ${saved}`);
      return { path: saved, mime: part.mime, kind, partId: part.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`failed to save media: ${msg}`);
      notify.error(`Could not save media to disk: ${msg}`, "Auto Vision");
      return null;
    }
  }

  // http(s):// -> hand the URL straight to the MCP tool
  if (url.startsWith("http://") || url.startsWith("https://")) {
    log(`remote url passthrough: ${url}`);
    return { path: url, mime: part.mime, kind, partId: part.id };
  }

  log(`unsupported url scheme for ${part.id}: ${url.slice(0, 50)}...`);
  return null;
}

export async function extractMediaFromParts(
  parts: FilePart[],
  log: Logger,
  notify: Notifier,
): Promise<SavedMedia[]> {
  const results = await Promise.all(
    parts.map((part) => processMediaPart(part, log, notify)),
  );
  return results.filter((r): r is SavedMedia => r !== null);
}
