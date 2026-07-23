// Self-contained logic test for the transform handler.
// Feeds a synthetic user message with an image FilePart + a mocked text-only
// model, and asserts the plugin strips the image and injects a path hint.
import { buildTransformHandler } from "./dist/plugin.js";

// --- mock ports ---
const supportsCalls = [];
const capabilities = {
  async supports(model, kind) {
    supportsCalls.push(`${model?.modelID}:${kind}`);
    // glm-5.2: no image, no video
    return false;
  },
};
const store = {
  async save(src) {
    return {
      path: "/tmp/opencode-auto-vision/MOCK.png",
      mime: src.mime,
      kind: src.kind,
      partId: src.partId,
    };
  },
};
const config = {
  imageTool: "analyze_image",
  videoTool: "analyze_video",
  cleanupAfterHours: 24,
  forceModels: [],
};
const deps = {
  config,
  capabilities,
  store,
  log: () => {},
  notify: { warn: () => {}, error: () => {} },
};

// --- a vision-capable model case (should be skipped, left native) ---
async function runCase(name, { model, supportsImage }, parts) {
  capabilities.supports = async (_m, kind) =>
    kind === "image" ? supportsImage : false;
  const handler = buildTransformHandler(deps);
  const output = {
    messages: [
      {
        info: {
          id: "m1",
          sessionID: "s1",
          role: "user",
          model,
        },
        parts,
      },
    ],
  };
  await handler({}, output);
  const resultParts = output.messages[0].parts;
  const hasFile = resultParts.some((p) => p.type === "file");
  const injection = resultParts.find((p) => p.type === "text" && p.text.includes("MOCK.png"));
  return { name, hasFile, injected: !!injection, snippet: injection?.text?.slice(0, 160) };
}

const imagePart = {
  id: "p2",
  type: "file",
  mime: "image/png",
  url: "data:image/png;base64,iVBORw0KGgo=",
  filename: "clip.png",
};
const textPart = { id: "p1", type: "text", text: "что на картинке?" };

const r1 = await runCase(
  "text-only model (glm-5.2)",
  { model: { providerID: "zai-coding-plan", modelID: "glm-5.2" }, supportsImage: false },
  [textPart, imagePart],
);
const r2 = await runCase(
  "vision model (glm-5v-turbo)",
  { model: { providerID: "zai-coding-plan", modelID: "glm-5v-turbo" }, supportsImage: true },
  [textPart, imagePart],
);

console.log(JSON.stringify({ r1, r2 }, null, 2));

// --- assertions ---
const ok =
  r1.hasFile === false && r1.injected === true &&
  r2.hasFile === true && r2.injected === false; // vision model: untouched

console.log("\nRESULT:", ok ? "PASS ✅" : "FAIL ❌");
console.log("  - text-only model: image stripped & path injected:", !r1.hasFile && r1.injected);
console.log("  - vision model:    image left native (untouched):  ", r2.hasFile && !r2.injected);
process.exit(ok ? 0 : 1);
