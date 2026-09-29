# obix-compiler-script-setup

> Previous name: `@obinexusltd/obix-compiler-script-setup` — OBIX packages are named without an npm scope since decision D-102 (2026-09-29); the package, its version and its exports are unchanged.

**The `<script setup>` frontend of the `.obix` compiler — `defineProps`, `defineEmits`, `withDefaults`, `defineExpose`, `defineOptions`, `defineSlots` and `defineModel`, compiled by the official Vue script compiler.**

`<script setup>` is Vue's compile-time sugar, and its compiler is the official one, `@vue/compiler-sfc` (`compileScript`), pinned at exactly **3.5.43** by `obix-vue.json` (OBIX monorepo record). This package adds **no macro handling and no copy of Vue code**: it runs the official compiler through the shared core of [`obix-compiler-script`](https://github.com/obinexus/obix-compiler-script) — so the macros, the binding metadata and the diagnostics have one implementation — and adds the vocabulary in which the official compiler's complaints about a `<script setup>` are reported.

```text
Counter.obix ─► parseObix ─► toObixSfc ─► compileObixScriptSetup ─► VueScriptArtifact   (+ OBIX diagnostics)
                                                                     artifact.bindings ─► the template stage
```

```bash
npm install obix-compiler-script-setup
```

```ts
import { compileObixScriptSetup } from "obix-compiler-script-setup";
import { compileObixTemplate } from "obix-compiler-template";

const sfc = toObixSfc(parseObix(source, "Counter.obix"));
const script = compileObixScriptSetup(sfc);
script.artifact?.content;   // the compiled module: defineComponent({ props, emits, setup() { … } }), TypeScript retained
script.artifact?.bindings;  // { count: "setup-maybe-ref", props: "setup-const", … }

// the template is compiled AGAIN with what the script declared: $setup.count, $props.label — not always _ctx
const template = compileObixTemplate(sfc, { bindingMetadata: script.artifact?.bindings });
```

The result, the artifact, the statuses and the options are those of the script stage — see its [README](https://github.com/obinexus/obix-compiler-script/blob/main/README.md). This stage owns a file with a `<script setup>`, **with or without a normal `<script>`** (the official compiler merges them: exports stay, the default export becomes the base of the component options); a normal `<script>` alone, and a file with no script, are `absent` here.

| Export | Role |
|---|---|
| `compileObixScriptSetup(sfc, options?)` | compile the `<script setup>` of a canonical SFC; throws `TypeError` only for misuse |
| `OBIX_SCRIPT_SETUP_MESSAGE_CODES` | the table of the messages a `<script setup>` can produce: `{ pattern, code }`, 40 entries |
| `OBIX_SCRIPT_CODES` · `OBIX_SCRIPT_MESSAGE_CODES` · `scriptCompilerVersion` · types | re-exported from the script package — the same objects |

## The compiler macros

Each macro is the official compiler's; the tests state, from the official output, what each becomes — and check every fixture against the official compiler called directly.

| Macro | Becomes |
|---|---|
| `defineProps({…})` / `defineProps<T>()` | the `props` option (type-based declarations are resolved into runtime props — `String`, `Number`, `Array`, `Function`, `null` for a type parameter); `const props = __props` |
| `withDefaults(defineProps<T>(), {…})` | the defaults merged into the props the type declared (values and factory functions) |
| `const { a = 1, b: c } = defineProps<T>()` | reactive props destructure (Vue 3.5): defaults move into the props, the destructure is removed, an alias is a `props-aliased` binding with `__propsAliases` |
| `defineEmits([…])` / `defineEmits<{…}>()` | the `emits` option (call signatures and property syntax); `emit` is `__emit` |
| `defineExpose({…})` | `__expose({…})`; a component that exposes nothing is closed by `__expose()` |
| `defineOptions({…})` | spread into the component options before `__name` |
| `defineSlots<T>()` | `useSlots()` — the typed slots are for the type checker |
| `defineModel<T>(name?, options?)` | a prop and an `update:` event, read through `useModel`; merged with declared props and emits by `mergeModels` |

A macro imported from `"vue"` is redundant: the import is removed, and **nothing is reported** — the official compiler prints that hint once per process, so it cannot be part of a result. `generic="T extends …"` is for the type checker: the output does not carry it (a prop typed by a type parameter has no runtime type), and the type parameters left in the code are removed by the TypeScript phase.

## Diagnostics

The vocabulary has one entry per message the official compiler can raise about a `<script setup>` — every compiler macro (`OBIX_SCRIPT_SETUP_DEFINE_PROPS_DUPLICATE`, `_DEFINE_PROPS_ARGUMENTS_CONFLICT`, `_WITH_DEFAULTS_*`, `_DEFINE_EMITS_*`, `_DEFINE_EXPOSE_DUPLICATE`, `_DEFINE_SLOTS_*`, `_DEFINE_OPTIONS_*`, `_DEFINE_MODEL_NAME_DUPLICATE`), the props destructure (`_PROPS_DESTRUCTURE_*`, `_PROP_DEFAULT_TYPE_MISMATCH`), what a macro's arguments and the imports may say (`_MACRO_ARGUMENT_LOCAL_REFERENCE`, `_MACRO_IMPORT_ALIASED`, `_IMPORT_LOCAL_NAME_CONFLICT`, `_ES_MODULE_EXPORT`), and the resolution of the types a macro is given (`_TYPE_*`). Codes are OBIX-owned words, never a Vue or Babel number. The tests check it against the source of the pinned compiler **both ways** — every message the compiler can raise is matched by exactly one entry (of this table or the script package's), and every entry is raised by some message — and against the corpus: every entry a source can trigger has a fixture that triggers it; the five it cannot reach (the props destructure prohibited by a configuration the frontend fixes; two type-index failures; the resolution of a type imported from another file, which needs a file-system host — a deferred capability) are listed, each with its reason.

`withDefaults() is unnecessary when using destructure` is a **warning**: the compile succeeds and the diagnostic is reported (`severity: "warning"`), with the place it points at.

## The authoring alias is a fork the official compiler cannot see

Vue recognises `ref()`, `computed()` and `reactive()` — and knows an import is a constant — only when they come **from `"vue"`**. From `"obix"` the same code is `setup-maybe-ref`, and the imports are exposed through live getters (`get ref() { return ref }`). This is recorded as a fact in the tests, not fixed here: **resolving the `obix` authoring alias is a later phase**, and until then the specifier is left exactly as written.

## What this package does not do

No macro handling of its own; no TypeScript removal (the TypeScript phase); no alias resolution; no cross-file type resolution (deferred); no source maps (deferred); no template compilation (the template stage, given `artifact.bindings`). It does not define OBIX semantics or the DOP IR. The Level-0 compiler is a different track ([`obix-compiler-legacy-parser`](https://github.com/obinexus/obix-compiler-legacy-parser)); nothing here imports it.

## Dependency role

Depends on `obix-compiler-script` (which loads the official compiler on the first compile, not at import) and, for types only, on the parser and the canonical SFC. It declares **no Vue-family dependency of its own**. A compile-time package: it never belongs in a browser bundle (graph rule R5).

## Tests

`npm test -w obix-compiler-script-setup` — every expectation is obtained from the **official** compiler (`tests/vuets/oracle.mjs`) and reduced to plain data before the code under test runs. Corpus: `tests/corpus/vuets` (OBIX monorepo record) — byte-identical `.vue` / `.obix` pairs, including one fixture per diagnostic of the vocabulary that a source can trigger.

<!-- obix-release:begin — generated by scripts/release/prepare.mjs; edit the text above this line -->

## Installation

```bash
npm install obix-compiler-script-setup
```

## API surface

- `obix-compiler-script-setup` — 5 value exports: `OBIX_SCRIPT_CODES`, `OBIX_SCRIPT_MESSAGE_CODES`, `OBIX_SCRIPT_SETUP_MESSAGE_CODES`, `compileObixScriptSetup`, `scriptCompilerVersion`
- Type declarations: `./dist/index.d.ts` (and a declaration next to every JS entry point).

## Architecture role

`obix-compiler-script-setup` is part of the **OBIX compiler** (build-time tooling): it never runs in an application's browser graph.

The architecture of OBIX — the package families and which packages are public API — is indexed in the umbrella: [docs/architecture.md](https://github.com/obinexus/obix/blob/main/docs/architecture.md).

## Package relationships

- Depends on (OBIX): [`obix-compiler-script`](https://github.com/obinexus/obix-compiler-script), [`obix-compiler-sfc`](https://github.com/obinexus/obix-compiler-sfc).
- Used by (OBIX): no other OBIX package.

## Testing

- 2 test files ship in the npm package (`test/`): the evidence of the package's contract, published so that its verification can be inspected — not runtime code (no entry point reaches them).
- **Standalone**: none.
- **Need the OBIX development / test harness**: 2 — they read the OBIX monorepo's shared harness, oracles or fixtures, so they do **not** run from an npm install or from this package's repository alone; they are shipped for inspection and provenance:
  - `test/env-probe.mjs` — reads ../../../tests/vuets/oracle.mjs, outside the package
  - `test/script-setup.test.mjs` — reads ../../../tests/vuets/oracle.mjs, outside the package
- Run them with `npm test` (`node --test "test/*.test.mjs"`) in the OBIX monorepo, which provides the test tooling (Node's test runner, TypeScript) and the harness.

## Documentation

- [CHANGELOG.md](CHANGELOG.md)
- The OBIX architecture index: [obix/docs/architecture.md](https://github.com/obinexus/obix/blob/main/docs/architecture.md)

## Repository

- https://github.com/obinexus/obix-compiler-script-setup — `git@github.com:obinexus/obix-compiler-script-setup.git`
- Issues: https://github.com/obinexus/obix-compiler-script-setup/issues
- The repository is a clean export of the package from the OBIX monorepo. Its lineage — the sources it was recovered from and its earlier names — is `PROVENANCE.json`, shipped in this package; the repository's copy also records the monorepo commit it was exported from.

## License

MIT — see [LICENSE](LICENSE).

<!-- obix-release:end -->
