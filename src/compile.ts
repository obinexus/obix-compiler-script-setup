/**
 * `compileObixScriptSetup`: the `<script setup>` of a canonical SFC — with the normal `<script>` it is merged with, if any — compiled by the OFFICIAL Vue script
 * compiler. `defineProps`, `defineEmits`, `withDefaults`, `defineExpose`, `defineOptions`, `defineSlots` and `defineModel` are the official compiler's macros:
 * this package adds no macro handling and no copy of Vue code, only the vocabulary in which the official compiler's complaints about them are reported.
 *
 * A file with no `<script setup>` is not this stage's: a normal `<script>` alone is obix-compiler-script. For it — and for a file with no script —
 * this stage has nothing to compile: `absent`.
 */
import { compileVueScript } from "obix-compiler-script";
import type { ObixScriptOptions, ObixScriptResult } from "obix-compiler-script";
import type { ObixSfc } from "obix-compiler-sfc";
import { OBIX_SCRIPT_SETUP_MESSAGE_CODES } from "./codes.js";

/**
 * Compile the `<script setup>` of a canonical SFC with the official Vue script compiler.
 *
 * Never throws for a script, however invalid: what the compiler reports becomes diagnostics, and a compiler that gives up becomes a `failed` result. It throws a
 * `TypeError` only for misuse — something that is not a canonical SFC, an SFC whose script blocks do not match its own source, or options that are not
 * `ObixScriptOptions`.
 *
 * Total and composable: the stage is not refused because the SFC parser reported recoverable errors. Only THIS stage's diagnostics are reported; the SFC's parse
 * diagnostics stay on the SFC, and the orchestrator that aggregates them decides whether to emit. The `bindings` of the artifact are what the template stage
 * takes as `bindingMetadata`.
 */
export function compileObixScriptSetup(sfc: ObixSfc, options?: ObixScriptOptions): ObixScriptResult {
  return compileVueScript(sfc, "script-setup", OBIX_SCRIPT_SETUP_MESSAGE_CODES, options);
}
