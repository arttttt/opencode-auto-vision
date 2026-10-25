// The OpenCode 2 `context` hook, driven with the real @opencode/ai Message
// and Media.Asset classes the host hands it (2.1.4).

import { Media, Message } from "@opencode/ai";
import { describe, expect, it } from "vitest";

import type { MediaKind, MediaSource, SavedMedia } from "../src/ports.js";
import { buildContextHandler } from "../src/v2/context-handler.js";
import type { V2Message, V2SessionContext } from "../src/v2/host.js";

const TEXT_ONLY = { providerID: "zai-coding-plan", id: "glm-5.2" };

const PNG = "iVBORw0KGgo=";
const image = () => ({ type: "media", media: new Media.Asset({ source: { type: "base64", data: PNG, mediaType: "image/png" } }) });
const remote = (url: string) => ({ type: "media", media: new Media.Asset({ source: { type: "url", url } }) });
const text = (value: string) => ({ type: "text", text: value });

function user(...content: unknown[]): V2Message {
  return new Message({ role: "user", content: content as never }) as unknown as V2Message;
}

function harness(options: { supported?: MediaKind[]; forceModels?: string[]; save?: (source: MediaSource) => SavedMedia | null } = {}) {
  const saved: MediaSource[] = [];
  const notices: string[] = [];
  const handler = buildContextHandler({
    config: { imageTool: "analyze_image", videoTool: "analyze_video", cleanupAfterHours: 24, forceModels: options.forceModels ?? [] },
    capabilities: { supports: async (_model, kind) => (options.supported ?? []).includes(kind) },
    store: {
      save: async (source) => {
        saved.push(source);
        return options.save ? options.save(source) : { path: `/tmp/auto-vision/${source.partId}`, mime: source.mime, kind: source.kind, partId: source.partId };
      },
    },
    log: () => {},
    notify: { warn: (m) => notices.push(`warn: ${m}`), error: (m) => notices.push(`error: ${m}`) },
  });
  return { handler, saved, notices };
}

async function run(handler: ReturnType<typeof buildContextHandler>, messages: V2Message[], model = TEXT_ONLY) {
  const event: V2SessionContext = { sessionID: "s1", model, messages };
  await handler(event);
  return event.messages;
}

const types = (message: V2Message) => message.content.map((part) => part.type);
const firstText = (message: V2Message) => (message.content.find((p) => p.type === "text") as { text: string } | undefined)?.text ?? "";

describe("buildContextHandler (OpenCode 2)", () => {
  it("routes an inline image for a text-only model: saved, stripped, and the model told where it is", async () => {
    const { handler, saved } = harness();

    const [message] = await run(handler, [user(text("what is this?"), image())]);

    expect(types(message)).toEqual(["text"]);
    expect(saved).toEqual([{ partId: expect.stringMatching(/^v2-[0-9a-f]{64}$/), mime: "image/png", kind: "image", url: `data:image/png;base64,${PNG}` }]);
    expect(firstText(message)).toContain(`/tmp/auto-vision/${saved[0].partId}`);
    expect(firstText(message)).toContain("analyze_image");
    expect(firstText(message)).toContain("what is this?");
    // Still the host's Message class, not a plain object.
    expect(message).toBeInstanceOf(Message);
  });

  // v2 parts have no ids: the key is the content, so the requests a session
  // re-sends with the same attachment keep pointing at the same file.
  it("names the same attachment the same way on every request", async () => {
    const { handler, saved } = harness();

    await run(handler, [user(text("a"), image())]);
    await run(handler, [user(text("b"), image())]);

    expect(saved[0].partId).toBe(saved[1].partId);
  });

  it("leaves the message as it is for a model that reads the media", async () => {
    const { handler, saved } = harness({ supported: ["image"] });
    const original = user(text("hi"), image());

    const [message] = await run(handler, [original]);

    expect(message).toBe(original);
    expect(saved).toEqual([]);
  });

  it("guesses the type of a url sent without one from its extension, and passes the url on", async () => {
    const { handler, saved } = harness();

    const [message] = await run(handler, [user(text("look"), remote("https://cdn.example/shots/a.webp?sig=1"))]);

    expect(types(message)).toEqual(["text"]);
    expect(saved).toEqual([expect.objectContaining({ mime: "image/webp", kind: "image", url: "https://cdn.example/shots/a.webp?sig=1" })]);
  });

  it("leaves a url whose type it can't tell alone", async () => {
    const { handler, saved } = harness();
    const original = user(text("look"), remote("https://cdn.example/download"));

    const [message] = await run(handler, [original]);

    expect(message).toBe(original);
    expect(saved).toEqual([]);
  });

  it("leaves a provider-side ref to the host: no tool can read the provider's file", async () => {
    const { handler, saved, notices } = harness();
    const ref = { type: "media", media: new Media.Asset({ source: { type: "ref", provider: "openai" as never, id: "file-1", mediaType: "image/png" } }) };
    const original = user(text("look"), ref);

    const [message] = await run(handler, [original]);

    expect(message).toBe(original);
    expect(saved).toEqual([]);
    expect(notices).toEqual([]);
  });

  it("strips media it can't save and reports it, without an instruction pointing nowhere", async () => {
    const { handler, notices } = harness({ save: () => null });

    const [message] = await run(handler, [user(text("what is this?"), image())]);

    expect(types(message)).toEqual(["text"]);
    expect(firstText(message)).toBe("what is this?");
    expect(notices).toEqual([expect.stringMatching(/^error: /)]);
  });

  it("routes everything for a model matched by forceModels", async () => {
    const { handler, saved } = harness({ supported: ["image"], forceModels: ["zai-coding-plan/*"] });

    const [message] = await run(handler, [user(text("x"), image())]);

    expect(types(message)).toEqual(["text"]);
    expect(saved).toHaveLength(1);
  });

  it("adds a text part when the media came alone, and looks only at the last user message", async () => {
    const { handler, saved } = harness();
    const earlier = user(text("old"), image());
    const reply = new Message({ role: "assistant", content: [{ type: "text", text: "ok" }] }) as unknown as V2Message;

    const messages = await run(handler, [earlier, reply, user(image())]);

    expect(messages[0]).toBe(earlier);
    expect(types(messages[2])).toEqual(["text"]);
    expect(firstText(messages[2])).toContain("(analyze the media)");
    expect(saved).toHaveLength(1);
  });
});
