/**
 * The OBIX diagnostic vocabulary of `<script setup>`.
 *
 * OBIX codes are OBIX-OWNED identifiers: words only, never a Vue or Babel number or name. The official script compiler states no code for what it reports — it throws
 * or prints a message — so the vocabulary is a table from the MESSAGE to an OBIX code, one entry per message the official compiler can raise about a `<script setup>`:
 * the compiler macros, the props destructure, the imports it rewrites, the exports it refuses, and the resolution of the types a macro is given. The tests check it
 * against the source of the pinned compiler, both ways: every message the compiler can raise is matched by exactly one entry here (or by the shared table of
 * obix-compiler-script), and every entry here is raised by some message — so a Vue upgrade that adds, rewords or drops one fails until it is decided again.
 *
 * The short messages are matched whole. The two long ones are matched by their opening sentences (their tails are advice to the reader).
 *
 * Whether a source can trigger an entry is the corpus's business, not this table's: the entries the frontend cannot reach with its fixed options or without a
 * file system host (the props destructure prohibited by configuration; the resolution of a type from another file) are listed in the tests, each with the reason.
 */
import type { ScriptMessageCode } from "obix-compiler-script";

const entry = (pattern: RegExp, code: string): ScriptMessageCode => Object.freeze({ pattern, code: `OBIX_SCRIPT_SETUP_${code}` });

export const OBIX_SCRIPT_SETUP_MESSAGE_CODES: readonly ScriptMessageCode[] = Object.freeze([
  // defineProps and withDefaults
  entry(/^duplicate defineProps\(\) call$/, "DEFINE_PROPS_DUPLICATE"),
  entry(/^defineProps\(\) cannot accept both type and non-type arguments at the same time\. Use one or the other\.$/, "DEFINE_PROPS_ARGUMENTS_CONFLICT"),
  entry(/^withDefaults' first argument must be a defineProps call\.$/, "WITH_DEFAULTS_FIRST_ARGUMENT_INVALID"),
  entry(/^withDefaults can only be used with type-based defineProps declaration\.$/, "WITH_DEFAULTS_REQUIRES_TYPE_PROPS"),
  entry(
    /^withDefaults\(\) is unnecessary when using destructure with defineProps\(\)\.\nReactive destructure will be disabled when using withDefaults\(\)\.\nPrefer using destructure default values, e\.g\. const \{ foo = 1 \} = defineProps\(\.\.\.\)\.$/,
    "WITH_DEFAULTS_UNNECESSARY",
  ),
  entry(/^The 2nd argument of withDefaults is required\.$/, "WITH_DEFAULTS_DEFAULTS_MISSING"),
  entry(/^Default value of prop ".*" does not match declared type\.$/s, "PROP_DEFAULT_TYPE_MISMATCH"),
  // the reactive props destructure
  entry(/^Props destructure is explicitly prohibited via config\.$/, "PROPS_DESTRUCTURE_PROHIBITED"),
  entry(/^defineProps\(\) destructure cannot use computed key\.$/, "PROPS_DESTRUCTURE_COMPUTED_KEY"),
  entry(/^defineProps\(\) destructure does not support nested patterns\.$/, "PROPS_DESTRUCTURE_NESTED"),
  entry(/^Cannot assign to destructured props as they are readonly\.$/, "PROPS_DESTRUCTURE_ASSIGNED"),
  entry(/^".*" is a destructured prop and should not be passed directly to \S+\(\)\. Pass a getter \(\) => .* instead\.$/s, "PROPS_DESTRUCTURE_PASSED_DIRECTLY"),
  // defineEmits
  entry(/^duplicate defineEmits\(\) call$/, "DEFINE_EMITS_DUPLICATE"),
  entry(/^defineEmits\(\) cannot accept both type and non-type arguments at the same time\. Use one or the other\.$/, "DEFINE_EMITS_ARGUMENTS_CONFLICT"),
  entry(/^defineEmits\(\) type cannot mixed call signature and property syntax\.$/, "DEFINE_EMITS_TYPE_SYNTAX_MIXED"),
  // defineExpose, defineSlots
  entry(/^duplicate defineExpose\(\) call$/, "DEFINE_EXPOSE_DUPLICATE"),
  entry(/^duplicate defineSlots\(\) call$/, "DEFINE_SLOTS_DUPLICATE"),
  entry(/^defineSlots\(\) cannot accept arguments$/, "DEFINE_SLOTS_ARGUMENTS_UNEXPECTED"),
  // defineOptions
  entry(/^duplicate defineOptions\(\) call$/, "DEFINE_OPTIONS_DUPLICATE"),
  entry(/^defineOptions\(\) cannot accept type arguments$/, "DEFINE_OPTIONS_TYPE_ARGUMENTS_UNEXPECTED"),
  entry(/^defineOptions\(\) cannot be used to declare props\. Use defineProps\(\) instead\.$/, "DEFINE_OPTIONS_DECLARES_PROPS"),
  entry(/^defineOptions\(\) cannot be used to declare emits\. Use defineEmits\(\) instead\.$/, "DEFINE_OPTIONS_DECLARES_EMITS"),
  entry(/^defineOptions\(\) cannot be used to declare expose\. Use defineExpose\(\) instead\.$/, "DEFINE_OPTIONS_DECLARES_EXPOSE"),
  entry(/^defineOptions\(\) cannot be used to declare slots\. Use defineSlots\(\) instead\.$/, "DEFINE_OPTIONS_DECLARES_SLOTS"),
  entry(/^defineOptions\(\) has no returning value, it cannot be assigned\.$/, "DEFINE_OPTIONS_ASSIGNED"),
  // defineModel
  entry(/^duplicate model name ".*"$/s, "DEFINE_MODEL_NAME_DUPLICATE"),
  // what a macro's arguments and the imports may say
  entry(/^`\w+\(\)` in <script setup> cannot reference locally declared variables because it will be hoisted outside of the setup\(\) function\. If your component options require initialization in the module scope, use a separate normal <script> to export the options instead\.$/, "MACRO_ARGUMENT_LOCAL_REFERENCE"),
  entry(/^`\w+` is a compiler macro and cannot be aliased to a different name\.$/, "MACRO_IMPORT_ALIASED"),
  entry(/^different imports aliased to same local name\.$/, "IMPORT_LOCAL_NAME_CONFLICT"),
  entry(/^<script setup> cannot contain ES module exports\. If you are using a previous version of <script setup>, please consult the updated RFC at https:\/\/github\.com\/vuejs\/rfcs\/pull\/227\.$/, "ES_MODULE_EXPORT"),
  // the types a macro is given
  entry(/^Unresolvable type reference or unsupported built-in utility type$/, "TYPE_REFERENCE_UNRESOLVABLE"),
  entry(/^Unresolvable type: \w+$/, "TYPE_UNSUPPORTED"),
  entry(/^Unsupported computed key in type referenced by a macro$/, "TYPE_COMPUTED_KEY_UNSUPPORTED"),
  entry(/^Failed to resolve extends base type\.\nIf this previously worked in 3\.2, /, "TYPE_EXTENDS_UNRESOLVABLE"),
  entry(/^Failed to resolve element type from target type$/, "TYPE_ELEMENT_UNRESOLVABLE"),
  entry(/^Unsupported type when resolving index type$/, "TYPE_INDEX_UNSUPPORTED"),
  entry(/^Failed to resolve index type into finite keys$/, "TYPE_INDEX_NOT_FINITE"),
  entry(/^No fs option provided to `compileScript` in non-Node environment\. File system access is required for resolving imported types\.$/, "TYPE_IMPORT_HOST_MISSING"),
  entry(/^Failed to resolve import source ".*"\. TypeScript is required as a peer dep for vue in order to support resolving types from module imports\.$/s, "TYPE_IMPORT_TYPESCRIPT_MISSING"),
  entry(/^Failed to resolve import source ".*"\.$/s, "TYPE_IMPORT_UNRESOLVED"),
]);
