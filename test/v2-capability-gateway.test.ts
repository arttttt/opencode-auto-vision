import { describe, expect, it } from "vitest";

import { V2CapabilityGateway } from "../src/v2/capability-gateway.js";
import type { V2ModelInfo } from "../src/v2/host.js";

const MODEL = { providerID: "zai", modelID: "glm-5.2" };

describe("V2CapabilityGateway (OpenCode 2 catalogue)", () => {
  function gateway(models: V2ModelInfo[] | (() => Promise<{ data?: V2ModelInfo[] }>)) {
    const calls: unknown[] = [];
    const list = typeof models === "function" ? models : async () => ({ data: models });
    const g = new V2CapabilityGateway(
      {
        list: async (input) => {
          calls.push(input);
          return list();
        },
      },
      "/project",
    );
    return { g, calls };
  }

  it("reads the capabilities.input list of modality names", async () => {
    const { g, calls } = gateway([{ providerID: "zai", id: "glm-5.2", capabilities: { input: ["text", "video"] } }]);
    expect(await g.supports(MODEL, "image")).toBe(false);
    expect(await g.supports(MODEL, "video")).toBe(true);
    // Asked once, for the plugin's own location.
    expect(calls).toEqual([{ location: { directory: "/project" } }]);
  });

  // This is the shape the OpenCode 1 gateway misread as "supported" for a
  // text-only model.
  it("says a text-only model reads no images", async () => {
    const { g } = gateway([{ providerID: "zai", id: "glm-5.2", capabilities: { input: ["text"] } }]);
    expect(await g.supports(MODEL, "image")).toBe(false);
  });

  // The user's choice: unknown means leave the media to the host, which
  // strips what the model can't read.
  it("leaves media alone for a model missing from the catalogue or without an input list", async () => {
    expect(await gateway([]).g.supports(MODEL, "image")).toBe(true);
    expect(await gateway([{ providerID: "zai", id: "glm-5.2", capabilities: {} }]).g.supports(MODEL, "image")).toBe(true);
    expect(await gateway([]).g.supports(undefined, "image")).toBe(true);
  });

  it("asks the catalogue again after a failure", async () => {
    let attempt = 0;
    const { g } = gateway(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("offline");
      return { data: [{ providerID: "zai", id: "glm-5.2", capabilities: { input: ["text"] } }] };
    });

    expect(await g.supports(MODEL, "image")).toBe(true);
    expect(await g.supports(MODEL, "image")).toBe(false);
  });
});
