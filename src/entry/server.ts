// `./server` export: the entry OpenCode 1.3.4+ loads first.
//
// OpenCode 1 reads `id` + `server` from this object. OpenCode 2 also loads
// this entry but requires a `setup`; until there is one it rejects the
// plugin rather than run code written for OpenCode 1's hooks. OpenCode
// 1.0 – 1.3.3 never look here: they import the package root, entry/legacy.ts.

import { AutoVisionPlugin, PLUGIN_ID } from "../composition.js";

export default {
  id: PLUGIN_ID,
  server: AutoVisionPlugin,
};
