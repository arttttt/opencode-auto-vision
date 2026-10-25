import { describe, expect, it } from "vitest";

import { OpencodeCapabilityGateway } from "../src/adapters/capability-gateway.js";

const MODEL = { providerID: "zai", modelID: "glm-5.2" };

describe("OpencodeCapabilityGateway (OpenCode 1 catalogue)", () => {
  const gateway = (models: Record<string, unknown>) =>
    new OpencodeCapabilityGateway({ provider: { list: async () => ({ data: { all: [{ id: "zai", models: models as never }] } }) } });

  it("reads the capabilities.input booleans", async () => {
    const g = gateway({ "glm-5.2": { capabilities: { attachment: true, input: { text: true, image: true, video: false } } } });
    expect(await g.supports(MODEL, "image")).toBe(true);
    expect(await g.supports(MODEL, "video")).toBe(false);
  });

  it("says no to every kind when attachments are off", async () => {
    const g = gateway({ "glm-5.2": { capabilities: { attachment: false, input: { image: true } } } });
    expect(await g.supports(MODEL, "image")).toBe(false);
  });

  it("falls back to modalities.input", async () => {
    const g = gateway({ "glm-5.2": { modalities: { input: ["text", "image"] } } });
    expect(await g.supports(MODEL, "image")).toBe(true);
    expect(await g.supports(MODEL, "video")).toBe(false);
  });

  it("assumes support for a model it doesn't know", async () => {
    expect(await gateway({}).supports(MODEL, "image")).toBe(true);
  });
});
