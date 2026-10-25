// OpenCode 2 boundary — the slice of the v2 plugin API this plugin touches,
// typed structurally so the plugin keeps zero runtime dependencies.
// Shapes from @opencode/plugin, @opencode/ai and @opencode/schema 2.1.4:
//   Plugin.define({id, setup}) / Context            promise/plugin.d.ts
//   ctx.session.hook("context", …) / SessionContext  promise/session.d.ts
//   Message {id?, role, content: ContentPart[]}      ai schema/messages.d.ts
//   MediaPart.media: Media.Asset {source, mediaType} ai media.d.ts
//   ctx.model.list() → {data: Model.Info[]}          client api ModelListOutput

export type V2MediaSource =
  | { type: "bytes"; data: Uint8Array; mediaType: string }
  | { type: "base64"; data: string; mediaType: string }
  | { type: "url"; url: string; mediaType?: string }
  | { type: "ref"; provider: string; id: string; mediaType?: string };

export type V2TextPart = { type: "text"; text: string };

export type V2MediaPart = {
  type: "media";
  /** A Media.Asset: `mediaType` is derived by the host, `source` is what was sent. */
  media: { source: V2MediaSource; mediaType?: string };
  filename?: string;
};

export type V2ContentPart = V2TextPart | V2MediaPart | { type: string };

export type V2Message = {
  id?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: V2ContentPart[];
};

/** The `context` hook's event: the request about to go to the model, mutable. */
export type V2SessionContext = {
  readonly sessionID: string;
  readonly model: { id: string; providerID: string };
  messages: V2Message[];
};

export type V2ModelInfo = {
  id: string;
  providerID: string;
  capabilities?: { input?: unknown };
};

export type V2Registration = { dispose: () => Promise<void> };

export type V2Context = {
  readonly location: { directory: string };
  readonly model: { list: (input?: { location?: { directory?: string } }) => Promise<{ data?: readonly V2ModelInfo[] }> };
  readonly session: {
    hook: (name: "context", callback: (event: V2SessionContext) => Promise<void> | void) => Promise<V2Registration>;
  };
};

export type V2Cleanup = () => Promise<void> | void;
