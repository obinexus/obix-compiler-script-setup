/**
 * obix-compiler-script-setup — the `<script setup>` frontend of the `.obix` compiler (Phase 3 of the VueTS compiler recovery,
 * docs/recovery/vuets-compiler.md).
 *
 * `<script setup>` is Vue's compile-time sugar, and its compiler is the official one, `@vue/compiler-sfc` (pinned at exactly 3.5.43 by obix-vue.json). This package
 * runs it through the shared core of obix-compiler-script, so that the compiler macros — `defineProps`, `defineEmits`, `withDefaults`,
 * `defineExpose`, `defineOptions`, `defineSlots`, `defineModel` — the binding metadata and the diagnostics have one implementation:
 *
 *     ObixSfc (canonical) ──► the official script compiler ──► VueScriptArtifact  (+ OBIX diagnostics)      artifact.bindings ──► the template stage
 *
 * The artifact is the same FRONTEND artifact as the script stage's: not OBIX semantics (the canonical DOP IR is, D-44), TypeScript retained, the `obix`
 * authoring alias left as written. It is NOT the Level-0 compiler (the frozen legacy track, D-46), and nothing here imports it.
 */
export { compileObixScriptSetup } from "./compile.js";
export { OBIX_SCRIPT_SETUP_MESSAGE_CODES } from "./codes.js";
export { OBIX_SCRIPT_CODES, OBIX_SCRIPT_MESSAGE_CODES, scriptCompilerVersion } from "obix-compiler-script";
export type { ObixScriptOptions, ObixScriptResult, ObixScriptStatus, VueScriptArtifact, VueScriptImport } from "obix-compiler-script";
