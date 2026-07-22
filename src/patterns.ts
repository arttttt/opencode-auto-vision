import type { ModelInfo } from "./types.js";

function matchesWildcard(pattern: string, value: string): boolean {
  const p = pattern.toLowerCase();
  const v = value.toLowerCase();
  if (p === "*") return true;
  if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
    return v.includes(p.slice(1, -1));
  }
  if (p.endsWith("*")) return v.startsWith(p.slice(0, -1));
  if (p.startsWith("*")) return v.endsWith(p.slice(1));
  return v === p;
}

/** Match a single `provider/model` (or bare) pattern against a model id. */
export function modelMatchesPattern(
  pattern: string,
  model: ModelInfo,
): boolean {
  if (pattern === "*") return true;
  const slash = pattern.indexOf("/");
  if (slash === -1) {
    // Bare token: accept either provider or model match.
    return (
      matchesWildcard(pattern, model.modelID) ||
      matchesWildcard(pattern, model.providerID)
    );
  }
  return (
    matchesWildcard(pattern.slice(0, slash), model.providerID) &&
    matchesWildcard(pattern.slice(slash + 1), model.modelID)
  );
}

export function modelMatchesAnyPattern(
  patterns: string[],
  model: ModelInfo | undefined,
): boolean {
  if (!model) return false;
  return patterns.some((p) => modelMatchesPattern(p, model));
}
