// Ports — abstractions the application layer depends on.
// (Dependency Inversion: high-level policy depends on these contracts,
// not on concrete IO or the opencode SDK. Adapters implement them.)

export type ModelInfo = {
  providerID: string;
  modelID: string;
};

export type MediaKind = "image" | "video";

/** Minimal, SDK-agnostic projection of a media FilePart. */
export type MediaRef = {
  id: string;
  mime: string;
  kind: MediaKind;
};

/** Neutral input handed to MediaStore — keeps the port free of SDK types. */
export type MediaSource = {
  partId: string;
  mime: string;
  kind: MediaKind;
  url: string;
};

export type SavedMedia = {
  /** Local file path or remote URL handed to the MCP tool. */
  path: string;
  mime: string;
  kind: MediaKind;
  partId: string;
};

export type PluginConfig = {
  imageTool: string;
  videoTool: string;
  cleanupAfterHours: number;
  promptTemplate?: string;
  /** Patterns that force interception regardless of capability. */
  forceModels: string[];
};

export type Logger = (msg: string) => void;

export type Notifier = {
  warn: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
};

/** Resolves whether a model natively supports a media kind. */
export interface CapabilityGateway {
  supports(model: ModelInfo | undefined, kind: MediaKind): Promise<boolean>;
}

/** Persists a media part to a stable location, returning a path/URL for the MCP tool. */
export interface MediaStore {
  save(source: MediaSource): Promise<SavedMedia | null>;
}
