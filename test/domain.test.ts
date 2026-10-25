import { describe, expect, it } from "vitest";

import { buildInjectionPrompt, mimeToKind, modelMatchesAnyPattern, modelMatchesPattern } from "../src/domain.js";
import type { PluginConfig, SavedMedia } from "../src/ports.js";

const CONFIG: PluginConfig = { imageTool: "analyze_image", videoTool: "analyze_video", cleanupAfterHours: 24, forceModels: [] };
const image: SavedMedia = { path: "/tmp/a.png", mime: "image/png", kind: "image", partId: "p1" };
const video: SavedMedia = { path: "/tmp/b.mp4", mime: "video/mp4", kind: "video", partId: "p2" };

describe("mimeToKind", () => {
  it("knows images and videos, case-insensitively, and nothing else", () => {
    expect(mimeToKind("image/PNG")).toBe("image");
    expect(mimeToKind("video/quicktime")).toBe("video");
    expect(mimeToKind("application/pdf")).toBeNull();
  });
});

describe("buildInjectionPrompt", () => {
  it("names the path and the tool for each item", () => {
    const prompt = buildInjectionPrompt([image, video], "describe", CONFIG);
    expect(prompt).toContain("- image 1: /tmp/a.png  (use `analyze_image`)");
    expect(prompt).toContain("- video 2: /tmp/b.mp4  (use `analyze_video`)");
    expect(prompt).toContain("analyze_image / analyze_video");
    expect(prompt).toContain("User's request: describe");
  });

  it("fills a custom template", () => {
    const prompt = buildInjectionPrompt([image], "", { ...CONFIG, promptTemplate: "{mediaCount} {kind} via {toolName}: {userText}" });
    expect(prompt).toBe("1 image via analyze_image: (analyze the media)");
  });

  it("returns the user's text unchanged when there is nothing to route", () => {
    expect(buildInjectionPrompt([], "hi", CONFIG)).toBe("hi");
  });
});

describe("modelMatchesPattern", () => {
  const model = { providerID: "zai-coding-plan", modelID: "glm-5v-turbo" };

  it.each([
    ["*", true],
    ["glm-5v-turbo", true],
    ["zai-coding-plan", true],
    ["glm-5v*", true],
    ["*turbo", true],
    ["*5v*", true],
    ["zai-coding-plan/glm-*", true],
    ["other/glm-5v-turbo", false],
    ["glm-4*", false],
  ])("%s → %p", (pattern, matches) => {
    expect(modelMatchesPattern(pattern, model)).toBe(matches);
  });

  it("matches no pattern for an unknown model", () => {
    expect(modelMatchesAnyPattern(["*"], undefined)).toBe(false);
  });
});
