import { describe, expect, it } from "vitest";

import { buildTransformHandler, type TransformDeps } from "../src/plugin.js";
import type { MediaKind, MediaSource, ModelInfo, SavedMedia } from "../src/ports.js";

const TEXT_ONLY: ModelInfo = { providerID: "zai-coding-plan", modelID: "glm-5.2" };
const VISION: ModelInfo = { providerID: "zai-coding-plan", modelID: "glm-5v-turbo" };

const textPart = { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text: "what is in the picture?" };
const imagePart = {
  id: "p2",
  sessionID: "s1",
  messageID: "m1",
  type: "file",
  mime: "image/png",
  url: "data:image/png;base64,iVBORw0KGgo=",
  filename: "clip.png",
};
const videoPart = { ...imagePart, id: "p3", mime: "video/mp4", url: "data:video/mp4;base64,AAAA", filename: "clip.mp4" };

function userMessage(model: ModelInfo | undefined, parts: unknown[]) {
  return { info: { id: "m1", sessionID: "s1", role: "user", model }, parts };
}

/** Ports recording what the handler did; `supported` lists the kinds the model reads natively. */
function harness(options: { supported?: MediaKind[]; forceModels?: string[]; save?: (source: MediaSource) => SavedMedia | null } = {}) {
  const saved: MediaSource[] = [];
  const notices: { level: "warn" | "error"; message: string }[] = [];
  const deps: TransformDeps = {
    config: { imageTool: "analyze_image", videoTool: "analyze_video", cleanupAfterHours: 24, forceModels: options.forceModels ?? [] },
    capabilities: { supports: async (_model, kind) => (options.supported ?? []).includes(kind) },
    store: {
      save: async (source) => {
        saved.push(source);
        return options.save ? options.save(source) : { path: `/tmp/auto-vision/${source.partId}.png`, mime: source.mime, kind: source.kind, partId: source.partId };
      },
    },
    log: () => {},
    notify: {
      warn: (message) => notices.push({ level: "warn", message }),
      error: (message) => notices.push({ level: "error", message }),
    },
  };
  return { deps, saved, notices, handler: buildTransformHandler(deps) };
}

async function run(handler: ReturnType<typeof buildTransformHandler>, messages: unknown[]) {
  const output = { messages } as Parameters<typeof handler>[1];
  await handler({}, output);
  return output.messages;
}

const texts = (parts: unknown[]) => (parts as { type: string; text?: string }[]).filter((p) => p.type === "text").map((p) => p.text ?? "");
const files = (parts: unknown[]) => (parts as { type: string }[]).filter((p) => p.type === "file");

describe("buildTransformHandler", () => {
  it("strips an image a text-only model can't read and tells it which tool and path to use", async () => {
    const { handler, saved } = harness();

    const [message] = await run(handler, [userMessage(TEXT_ONLY, [textPart, imagePart])]);

    expect(files(message.parts)).toEqual([]);
    expect(saved.map((s) => s.partId)).toEqual(["p2"]);
    const [text] = texts(message.parts);
    expect(text).toContain("/tmp/auto-vision/p2.png");
    expect(text).toContain("analyze_image");
    expect(text).toContain("what is in the picture?");
  });

  it("leaves the message untouched for a model that reads the media natively", async () => {
    const { handler, saved } = harness({ supported: ["image"] });
    const original = userMessage(VISION, [textPart, imagePart]);

    const [message] = await run(handler, [original]);

    expect(message.parts).toEqual([textPart, imagePart]);
    expect(saved).toEqual([]);
  });

  it("routes only the kinds the model can't read", async () => {
    const { handler, saved } = harness({ supported: ["image"] });

    const [message] = await run(handler, [userMessage(VISION, [textPart, imagePart, videoPart])]);

    expect(files(message.parts)).toEqual([imagePart]);
    expect(saved.map((s) => s.kind)).toEqual(["video"]);
    expect(texts(message.parts)[0]).toContain("analyze_video");
  });

  it("routes everything for a model matched by forceModels, whatever its capabilities say", async () => {
    const { handler, saved } = harness({ supported: ["image", "video"], forceModels: ["zai-coding-plan/glm-5v*"] });

    const [message] = await run(handler, [userMessage(VISION, [textPart, imagePart])]);

    expect(files(message.parts)).toEqual([]);
    expect(saved.map((s) => s.partId)).toEqual(["p2"]);
  });

  it("adds a text part when the user sent media alone", async () => {
    const { handler } = harness();

    const [message] = await run(handler, [userMessage(TEXT_ONLY, [imagePart])]);

    expect(files(message.parts)).toEqual([]);
    expect(texts(message.parts)[0]).toContain("(analyze the media)");
  });

  it("only looks at the last user message", async () => {
    const { handler, saved } = harness();
    const earlier = userMessage(TEXT_ONLY, [textPart, imagePart]);
    const assistant = { info: { id: "m2", sessionID: "s1", role: "assistant" }, parts: [] };
    const latest = { ...userMessage(TEXT_ONLY, [textPart]), info: { id: "m3", sessionID: "s1", role: "user", model: TEXT_ONLY } };

    const messages = await run(handler, [earlier, assistant, latest]);

    expect(saved).toEqual([]);
    expect(messages[0].parts).toEqual([textPart, imagePart]);
  });

  // A raw data: blob left in the parts still breaks a non-vision model.
  it("still strips the media and reports an error when no media could be saved", async () => {
    const { handler, notices } = harness({ save: () => null });

    const [message] = await run(handler, [userMessage(TEXT_ONLY, [textPart, imagePart])]);

    expect(files(message.parts)).toEqual([]);
    expect(texts(message.parts)).toEqual(["what is in the picture?"]);
    expect(notices.map((n) => n.level)).toEqual(["error"]);
  });

  it("warns when only some of the media could be saved, and routes those", async () => {
    const { handler, notices } = harness({
      save: (source) => (source.kind === "video" ? null : { path: "/tmp/auto-vision/ok.png", mime: source.mime, kind: source.kind, partId: source.partId }),
    });

    const [message] = await run(handler, [userMessage(TEXT_ONLY, [textPart, imagePart, videoPart])]);

    expect(files(message.parts)).toEqual([]);
    expect(texts(message.parts)[0]).toContain("/tmp/auto-vision/ok.png");
    expect(notices).toEqual([{ level: "warn", message: expect.stringContaining("1 of 2") }]);
  });

  it("does nothing without a user message or without media", async () => {
    const { handler, saved } = harness();
    const assistant = { info: { id: "m2", sessionID: "s1", role: "assistant" }, parts: [imagePart] };

    expect((await run(handler, [assistant]))[0].parts).toEqual([imagePart]);
    expect((await run(handler, [userMessage(TEXT_ONLY, [textPart])]))[0].parts).toEqual([textPart]);
    expect(saved).toEqual([]);
  });
});
