import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FileMediaStore } from "../src/adapters/media-store.js";
import type { MediaSource } from "../src/ports.js";

function store() {
  const dir = mkdtempSync(join(tmpdir(), "auto-vision-store-"));
  const errors: string[] = [];
  const s = new FileMediaStore(dir, () => {}, { warn: () => {}, error: (m) => errors.push(m) });
  return { dir, errors, s };
}

const source = (url: string, partId = "p1"): MediaSource => ({ partId, mime: "image/png", kind: "image", url });

describe("FileMediaStore", () => {
  it("writes a data: url to a file named by its key, the same name every time", async () => {
    const { dir, s } = store();

    const first = await s.save(source("data:image/png;base64,aGVsbG8="));
    const again = await s.save(source("data:image/png;base64,aGVsbG8="));

    expect(first?.path.startsWith(dir)).toBe(true);
    expect(first?.path.endsWith(".png")).toBe(true);
    expect(again?.path).toBe(first?.path);
    expect(readFileSync(first!.path, "utf8")).toBe("hello");
  });

  it("hands a file: url over as its path and an http(s) url as is", async () => {
    const { s } = store();
    expect((await s.save(source("file:///tmp/shot.png")))?.path).toBe("/tmp/shot.png");
    expect((await s.save(source("https://cdn.example/a.png")))?.path).toBe("https://cdn.example/a.png");
  });

  it("gives up on a url it can't read", async () => {
    const { s } = store();
    expect(await s.save(source("blob:abc"))).toBeNull();
    expect(await s.save(source("data:image/png,not-base64"))).toBeNull();
    expect(await s.save(source(""))).toBeNull();
  });
});
