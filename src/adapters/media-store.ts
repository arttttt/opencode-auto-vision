// Adapter — MediaStore that resolves a media part's url to a stable path.
// URL schemes are handled by a strategy table (Open/Closed): adding a scheme
// means registering a resolver, not editing this class.

import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { IMAGE_MIME_TO_EXT, VIDEO_MIME_TO_EXT } from "../constants.js";
import type {
  MediaStore,
  MediaSource,
  SavedMedia,
  Logger,
  Notifier,
} from "../ports.js";

function extensionFor(mime: string): string {
  const m = mime.toLowerCase();
  return IMAGE_MIME_TO_EXT[m] ?? VIDEO_MIME_TO_EXT[m] ?? "bin";
}

/** Stable name from the part id — survives the re-transforms opencode runs
 *  after tool calls, so the same attachment keeps the same path. */
function stableFilename(partId: string, mime: string): string {
  return `${createHash("sha256").update(partId).digest("hex")}.${extensionFor(mime)}`;
}

type ResolveContext = {
  dir: string;
  log: Logger;
  notify: Notifier;
};
type Resolver = (
  src: MediaSource,
  ctx: ResolveContext,
) => Promise<SavedMedia | null>;

const resolveFileUrl: Resolver = (src, { log }) => {
  const path = fileURLToPath(src.url);
  log(`media already on disk: ${path}`);
  return Promise.resolve(saved(src, path));
};

const resolveHttpUrl: Resolver = (src, { log }) => {
  log(`remote url passthrough: ${src.url}`);
  return Promise.resolve(saved(src, src.url));
};

const resolveDataUrl: Resolver = async (src, { dir, log, notify }) => {
  const match = src.url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    log(`failed to parse data url for ${src.partId}`);
    return null;
  }
  try {
    await mkdir(dir, { recursive: true });
    const path = join(dir, stableFilename(src.partId, src.mime));
    await writeFile(path, Buffer.from(match[2], "base64"));
    log(`saved data url -> ${path}`);
    return saved(src, path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`failed to save media: ${msg}`);
    notify.error(`Could not save media to disk: ${msg}`, "Auto Vision");
    return null;
  }
};

function saved(src: MediaSource, path: string): SavedMedia {
  return { path, mime: src.mime, kind: src.kind, partId: src.partId };
}

function resolverFor(url: string): Resolver | null {
  if (url.startsWith("file://")) return resolveFileUrl;
  if (url.startsWith("data:")) return resolveDataUrl;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return resolveHttpUrl;
  }
  return null;
}

export class FileMediaStore implements MediaStore {
  constructor(
    private readonly dir: string,
    private readonly log: Logger,
    private readonly notify: Notifier,
  ) {}

  async save(src: MediaSource): Promise<SavedMedia | null> {
    if (!src.url) {
      this.log(`skip ${src.partId}: no url`);
      return null;
    }
    const resolve = resolverFor(src.url);
    if (!resolve) {
      this.log(
        `unsupported url scheme for ${src.partId}: ${src.url.slice(0, 50)}...`,
      );
      return null;
    }
    return resolve(src, { dir: this.dir, log: this.log, notify: this.notify });
  }
}
