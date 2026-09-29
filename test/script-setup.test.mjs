/**
 * obix-compiler-script-setup — Phase 3 of the VueTS compiler recovery (docs/recovery/vuets-compiler.md).
 *
 * The `<script setup>` frontend compiles the `<script setup>` of a canonical SFC — with any normal `<script>` it is merged with — with the OFFICIAL Vue script
 * compiler (@vue/compiler-sfc `compileScript`): the compiler macros defineProps, defineEmits, withDefaults, defineExpose, defineOptions, defineSlots and
 * defineModel, the binding metadata, and the diagnostics. Every expectation is obtained from the official APIs (tests/vuets/oracle.mjs) and reduced to plain data
 * BEFORE the code under test runs; the hard-coded facts are what the official compiler is known to generate for each macro.
 *
 * Written before the implementation (RED), then satisfied (GREEN). The corpus is tests/corpus/vuets: every fixture is a byte-identical pair Foo.vue / Foo.obix.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseObix, parseVueReference } from 'obix-compiler-parser';
import { toObixSfc } from 'obix-compiler-sfc';
import * as scriptPackage from 'obix-compiler-script';
import { compileObixScriptSetup, OBIX_SCRIPT_SETUP_MESSAGE_CODES, OBIX_SCRIPT_CODES, OBIX_SCRIPT_MESSAGE_CODES, scriptCompilerVersion } from '../dist/index.js';
import { manifest, fixtureSource, officialScript, officialScriptMessages, scriptIdOf, plainBindings } from '../../../tests/vuets/oracle.mjs';
import { assertStageResult, assertLocated } from '../../../tests/vuets/script-assertions.mjs';

const PACKAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireHere = createRequire(import.meta.url);
const STAGE = (source, filename, options) => compileObixScriptSetup(toObixSfc(parseObix(source, filename)), options);
const VUE = (source, filename, options) => compileObixScriptSetup(toObixSfc(parseVueReference(source, filename)), options);
const SYNTAXES = [['obix', '.obix', STAGE], ['vue', '.vue', VUE]];
const byId = (id) => manifest.fixtures.find((f) => f.id === id);
const owns = (ref) => ref.owner === 'script-setup';
/**
 * A result as plain data for comparing two compiles of the same source. The official compiler hangs its own working objects on the Babel AST it returns (`_ownerScope`:
 * the type scope, which holds the file name and the whole source), so two ASTs are compared without the keys the official compiler marks private.
 */
const withoutPrivate = (ast) => ast && JSON.parse(JSON.stringify(ast, (key, value) => (key.startsWith('_') ? undefined : value)));
const comparable = (r) => (r.artifact ? { ...r, artifact: { ...r.artifact, scriptAst: withoutPrivate(r.artifact.scriptAst), scriptSetupAst: withoutPrivate(r.artifact.scriptSetupAst) } } : r);
/** Compile a corpus fixture with the stage. */
const fixture = (id, options) => {
  const f = byId(id);
  return STAGE(fixtureSource(f), `${f.name}.obix`, options);
};
const contentOf = (id) => fixture(id).artifact.content;

// ── the surface ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('the module exposes compileObixScriptSetup, its vocabulary, and the code table and version of the script package it is built on — the same objects, not copies', () => {
  assert.equal(typeof compileObixScriptSetup, 'function');
  assert.equal(scriptCompilerVersion, '3.5.43');
  assert.equal(OBIX_SCRIPT_CODES, scriptPackage.OBIX_SCRIPT_CODES);
  assert.equal(OBIX_SCRIPT_MESSAGE_CODES, scriptPackage.OBIX_SCRIPT_MESSAGE_CODES);
  assert.ok(Object.isFrozen(OBIX_SCRIPT_SETUP_MESSAGE_CODES));
  assert.equal(OBIX_SCRIPT_SETUP_MESSAGE_CODES.length, 40, 'one entry per message of the official compiler that a <script setup> can be told off with (the completeness test checks it against the compiler\'s source)');
  for (const entry of OBIX_SCRIPT_SETUP_MESSAGE_CODES) {
    assert.ok(Object.isFrozen(entry) && entry.pattern instanceof RegExp, entry.code);
    assert.match(entry.code, /^OBIX_SCRIPT_SETUP_[A-Z_]+$/, `${entry.code}: a namespaced word list — no digit, so no Vue or Babel number`);
  }
  const codes = OBIX_SCRIPT_SETUP_MESSAGE_CODES.map((e) => e.code);
  assert.equal(new Set(codes).size, codes.length, 'one OBIX code per message');
});

test('SSR boundary (directive, Bottleneck C): importing the package reads no browser global, and compiling then works with the globals absent, as on a server', () => {
  const entry = pathToFileURL(path.join(PACKAGE, 'dist', 'index.js')).href;
  const parserEntry = import.meta.resolve('obix-compiler-parser');
  const sfcEntry = import.meta.resolve('obix-compiler-sfc');
  const script = `
    const names = ['window', 'self', 'document', 'HTMLElement', 'Element', 'MutationObserver', 'requestAnimationFrame'];
    const log = [];
    for (const n of names) Object.defineProperty(globalThis, n, { configurable: true, get() { log.push(n); throw new ReferenceError(n + ' is not defined (trap)'); } });
    const mod = await import(${JSON.stringify(entry)});
    const atImport = [...log];
    for (const n of names) delete globalThis[n];
    const { parseObix } = await import(${JSON.stringify(parserEntry)});
    const { toObixSfc } = await import(${JSON.stringify(sfcEntry)});
    const r = mod.compileObixScriptSetup(toObixSfc(parseObix('<script setup lang="ts">const n = 1</script>', 'Pure.obix')));
    process.stdout.write('@@' + JSON.stringify({ atImport, status: r.status, ok: r.ok, diagnostics: r.diagnostics.length, content: typeof r.artifact.content, version: mod.scriptCompilerVersion }));
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  const m = /@@(.*)$/s.exec(r.stdout ?? '');
  assert.ok(m, `the probe died: ${(r.stderr ?? '').slice(0, 400)}`);
  const out = JSON.parse(m[1]);
  assert.deepEqual(out.atImport, [], 'importing the package must not read any browser global');
  assert.deepEqual([out.status, out.ok, out.diagnostics, out.content, out.version], ['compiled', true, 0, 'string', '3.5.43']);
});

test('the frontend is isolated from the frozen Level-0 track and declares no Vue-family dependency of its own: the official compiler is reached only through the script package', () => {
  const dist = path.join(PACKAGE, 'dist');
  const specifiers = new Set();
  for (const file of fs.readdirSync(dist).filter((f) => f.endsWith('.js'))) {
    for (const m of fs.readFileSync(path.join(dist, file), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g)) specifiers.add(m[1]);
  }
  assert.deepEqual([...specifiers].filter((s) => !s.startsWith('.')), ['obix-compiler-script']);
  const manifestJson = JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifestJson.dependencies).sort(), ['obix-compiler-script', 'obix-compiler-sfc'], 'the parser is a test-time dependency: its tests parse real source with it');
  assert.deepEqual(Object.keys({ ...manifestJson.dependencies, ...manifestJson.devDependencies }).filter((n) => /legacy|^vue$|^@vue\//.test(n)), []);
});

// ── THE GATE: the frontend equals the official reference, for every fixture, in both syntaxes ─────────────────────────────────────────────────

test('THE GATE — every corpus fixture, in both syntaxes: status, compiled script, binding metadata, imports, diagnostics and where they point equal what the official Vue compiler says', () => {
  let compared = 0;
  let owned = 0;
  for (const f of manifest.fixtures) {
    const source = fixtureSource(f);
    for (const [, ext, run] of SYNTAXES) {
      const filename = f.name + ext;
      const ref = officialScript(source, filename); // FIRST: the reference, as plain data
      const got = run(source, filename); //            THEN: the code under test
      if (assertStageResult(got, ref, { source, filename, expectation: f.script, label: `${f.id}${ext}`, kind: 'script-setup', owns })) owned++;
      compared++;
    }
  }
  assert.equal(compared, manifest.fixtures.length * 2);
  assert.ok(compared >= 240, `${compared} comparisons`);
  assert.ok(owned >= 100, `${owned} of them are compiled by this stage`);
});

test('Foo.vue ≅ Foo.obix under the setup stage: with the same id, the two results differ in nothing but the filename — same script, same bindings, same diagnostics', () => {
  const normalize = (r) => ({ ...comparable(r), filename: '<filename>', diagnostics: r.diagnostics.map((d) => ({ ...d, filename: '<filename>', detail: d.detail && d.detail.split(/\S+\.(?:vue|obix)/).join('<filename>') })) });
  let pairs = 0;
  for (const f of manifest.fixtures) {
    const source = fixtureSource(f);
    const vue = VUE(source, `${f.name}.vue`, { id: 'same' });
    const obix = STAGE(source, `${f.name}.obix`, { id: 'same' });
    assert.deepStrictEqual(normalize(vue), normalize(obix), f.id);
    if (vue.artifact) assert.notEqual(vue.artifact.scriptSetupAst, obix.artifact.scriptSetupAst, `${f.id}: each compile owns its AST`);
    pairs++;
  }
  assert.equal(pairs, manifest.fixtures.length);
});

// ── the domain ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('the stage compiles a <script setup> — alone or with a normal <script> — and nothing else: no script, and a normal <script> alone (the script stage\'s), are `absent`', () => {
  for (const source of ['<template><p /></template>\n', '', '<script>export const a = 1</script>\n', '<script lang="ts">export default {}</script>\n<template><p /></template>\n']) {
    const r = STAGE(source, 'None.obix');
    assert.deepEqual([r.status, r.ok, r.artifact, r.diagnostics], ['absent', true, null, []], JSON.stringify(source));
  }
  assert.equal(STAGE('<script setup>const a = 1</script>\n', 'One.obix').status, 'compiled');
  const dual = fixture('28r-dual-options');
  assert.equal(dual.status, 'compiled', 'a normal <script> next to a <script setup> is compiled WITH it');
});

// ── the compiler macros, one by one (hard-coded facts, checked against the reference by the gate) ─────────────────────────────────────────────

test('defineProps: a runtime declaration becomes the props option as written, and the macro call becomes `const props = __props`', () => {
  const r = fixture('28-define-props-runtime');
  const c = r.artifact.content;
  assert.match(c, /props: \{\n {2}title: String,\n {2}count: \{ type: Number, required: true \},\n {2}tags: \{ type: Array, default: \(\) => \[\] \}\n\},/);
  assert.match(c, /const props = __props\n/);
  assert.doesNotMatch(c, /defineProps/, 'the macro is gone from the output');
  assert.deepEqual({ ...r.artifact.bindings }, { title: 'props', count: 'props', tags: 'props', props: 'setup-reactive-const' });
});

test('defineProps: a type-based declaration is resolved into runtime props by the official compiler — optional, required, unions of literals, function types', () => {
  const c = contentOf('28b-define-props-type-literal');
  assert.match(c, /title: \{ type: String, required: false \},/);
  assert.match(c, /count: \{ type: Number, required: true \},/);
  assert.match(c, /tone: \{ type: String, required: true \},/, 'a union of string literals is a String prop');
  assert.match(c, /onPick: \{ type: Function, required: false \}/);
  assert.match(c, /setup\(__props: any, \{ expose: __expose \}\)/, 'TypeScript retained: the setup function is typed');
  const iface = contentOf('18-typescript-props');
  assert.match(iface, /items: \{ type: Array, required: true \},/);
  assert.match(iface, /selected: \{ type: Number, required: false \}/);
});

test('withDefaults: the defaults are merged into the props the type declared — plain values and factory functions', () => {
  const r = fixture('28c-with-defaults');
  assert.match(r.artifact.content, /label: \{ type: String, required: false, default: "untitled" \},/);
  assert.match(r.artifact.content, /items: \{ type: Array, required: false, default: \(\) => \["a", "b"\] \},/);
  assert.match(r.artifact.content, /size: \{ type: Number, required: false, default: 3 \}/);
  assert.match(r.artifact.content, /interface Props \{/, 'the type declaration itself is left for the TypeScript phase');
  assert.deepEqual({ ...r.artifact.bindings }, { props: 'setup-const', label: 'props', items: 'props', size: 'props' });
});

test('reactive props destructure (Vue 3.5): defaults move into the props, the destructure is removed, and an alias is a props-aliased binding with its alias recorded', () => {
  const r = fixture('28d-props-destructure');
  assert.match(r.artifact.content, /title: \{ type: String, required: false, default: "hello" \},/);
  assert.match(r.artifact.content, /label: \{ type: String, required: false, default: "L" \}/);
  assert.match(r.artifact.content, /const __returned__ = \{ {2}\}/, 'nothing was left in the setup scope: the destructured names are props');
  assert.deepEqual(JSON.parse(JSON.stringify(r.artifact.bindings)), { heading: 'props-aliased', __propsAliases: { heading: 'label' }, title: 'props', count: 'props', label: 'props' });
});

test('defineEmits: a runtime array, and a type — call signatures or property syntax — become the emits option; `emit` is `__emit`', () => {
  const runtime = contentOf('28e-define-emits-runtime');
  assert.match(runtime, /emits: \["pick", "close"\],/);
  assert.match(runtime, /const emit = __emit\n/);
  assert.match(runtime, /setup\(__props, \{ expose: __expose, emit: __emit \}\)/);
  assert.match(contentOf('28f-define-emits-call-signatures'), /emits: \["change", "close"\],/, 'call signatures');
  assert.match(contentOf('19-emits'), /emits: \["change", "close"\],/, 'property syntax');
});

test('defineExpose: the macro becomes `__expose(...)`, and a component that exposes nothing is closed by `__expose()` — the official default of <script setup>', () => {
  assert.match(contentOf('28g-define-expose'), /__expose\(\{ open, toggle \}\)/);
  assert.doesNotMatch(contentOf('28g-define-expose'), /__expose\(\);/);
  assert.match(contentOf('28-define-props-runtime'), /__expose\(\);/);
});

test('defineOptions: its object is spread into the component options, before the generated `__name`', () => {
  const r = fixture('28h-define-options');
  assert.match(r.artifact.content, /\.\.\.\{\n {2}name: "OptionsMacro",\n {2}inheritAttrs: false\n\},\n {2}__name: 'OptionsMacro',/);
  assert.deepEqual({ ...r.artifact.bindings }, {});
});

test('defineSlots: a type-only declaration — at runtime it is `useSlots()`, and the typed slots are for the type checker', () => {
  const r = fixture('28i-define-slots');
  assert.match(r.artifact.content, /const slots = _useSlots\(\)\n/);
  assert.match(r.artifact.content, /import \{ useSlots as _useSlots, defineComponent as _defineComponent \} from 'vue'/);
  assert.deepEqual({ ...r.artifact.bindings }, { slots: 'setup-const' });
});

test('defineModel: a model is a prop and an update event — the default model and a named one, with modifiers and a default — read through useModel', () => {
  const r = fixture('28j-define-model');
  const c = r.artifact.content;
  assert.match(c, /"modelValue": \{ type: String, \.\.\.\{ required: true \} \},\n {4}"modelModifiers": \{\},/);
  assert.match(c, /"count": \{ type: Number, \.\.\.\{ default: 0 \} \},\n {4}"countModifiers": \{\},/);
  assert.match(c, /emits: \["update:modelValue", "update:count"\],/);
  assert.match(c, /const model = _useModel<string>\(__props, "modelValue"\)/, 'the type argument is retained for the TypeScript phase');
  assert.match(c, /const \[count, modifiers\] = _useModel<number, "clamp">\(__props, "count"\)/);
  assert.deepEqual({ ...r.artifact.bindings }, { modelValue: 'props', count: 'setup-maybe-ref', model: 'setup-ref', modifiers: 'setup-maybe-ref' });
});

test('all the macros at once: models are merged into the declared props and emits, and every macro call is gone', () => {
  const r = fixture('28k-all-macros');
  const c = r.artifact.content;
  assert.match(c, /\.\.\.\{ name: "AllMacros" \},/);
  assert.match(c, /props: \/\*@__PURE__\*\/_mergeModels\(\{\n {4}a: \{ type: String, required: false, default: "x" \},\n {4}b: \{ type: Number, required: true \}\n {2}\}, \{\n {4}"modelValue": \{ type: String \},\n {4}"modelModifiers": \{\},\n {2}\}\),/);
  assert.match(c, /emits: \/\*@__PURE__\*\/_mergeModels\(\["done"\], \["update:modelValue"\]\),/);
  assert.match(c, /__expose\(\{ finish \}\)/);
  for (const macro of ['defineProps', 'withDefaults', 'defineEmits', 'defineSlots', 'defineModel', 'defineExpose', 'defineOptions']) assert.ok(!c.includes(`${macro}(`), `${macro}( is gone`);
  assert.deepEqual({ ...r.artifact.bindings }, { modelValue: 'props', props: 'setup-const', emit: 'setup-const', slots: 'setup-const', value: 'setup-ref', finish: 'setup-const', a: 'props', b: 'props' });
});

test('a macro imported from "vue" is redundant: the import is removed and NOTHING is reported — the official hint is printed once per process, so it cannot be part of a result', () => {
  const f = byId('28t-macro-import');
  const source = fixtureSource(f);
  const ref = officialScript(source, 'MacroImport.vue');
  assert.deepEqual(ref.warnings, [], 'the reference runs under a fixed environment too: no hint');
  const printed = [];
  const original = console.warn;
  console.warn = (...args) => printed.push(args);
  let first;
  let second;
  try {
    first = STAGE(source, 'MacroImport.obix');
    second = STAGE(source, 'MacroImport.obix');
  } finally {
    console.warn = original;
  }
  assert.deepEqual(printed, [], 'nothing was printed, however often it is compiled');
  for (const r of [first, second]) {
    assert.deepEqual([r.status, r.ok, r.diagnostics], ['compiled', true, []]);
    assert.doesNotMatch(r.artifact.content, /import \{ defineProps/, 'the redundant import is removed');
    assert.match(r.artifact.content, /import \{ ref \} from "vue"/);
  }
  assert.deepStrictEqual(comparable(first), comparable(second), 'the second compile in the same process is the same result');
});

// ── binding metadata ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('bindingMetadata: every kind of binding the official compiler distinguishes is recorded, and the artifact carries it as frozen plain data for the template stage', () => {
  const r = fixture('28p-binding-kinds');
  const b = JSON.parse(JSON.stringify(r.artifact.bindings));
  assert.ok(Object.isFrozen(r.artifact.bindings) && Object.isFrozen(r.artifact.bindings.__propsAliases));
  // props, and the alias of a destructured prop
  assert.deepEqual([b.title, b.size, b.heading, b.__propsAliases], ['props', 'props', 'props-aliased', { heading: 'title' }]);
  // imports: a component is a constant, everything else imported from a source Vue does not know is maybe-a-ref
  assert.deepEqual([b.Child, b.ref, b.reactive, b.computed, b.shallowRef, b.helper], ['setup-const', 'setup-maybe-ref', 'setup-maybe-ref', 'setup-maybe-ref', 'setup-maybe-ref', 'setup-maybe-ref']);
  // declarations
  assert.deepEqual([b.counter, b.legacy, b.literal, b.numeric, b.handler, b.Service], ['setup-let', 'setup-let', 'literal-const', 'literal-const', 'setup-const', 'setup-const']);
  // what a call returns is unknown to the compiler: maybe a ref
  assert.deepEqual([b.plainRef, b.derived, b.shallow, b.state, b.objectLiteral, b.helped], ['setup-maybe-ref', 'setup-maybe-ref', 'setup-maybe-ref', 'setup-maybe-ref', 'setup-const', 'setup-maybe-ref']);
  assert.deepEqual([b.a, b.renamed, b.first], ['setup-maybe-ref', 'setup-maybe-ref', 'setup-maybe-ref'], 'destructured names');
  assert.deepEqual(b, officialScript(fixtureSource(byId('28p-binding-kinds')), 'BindingKinds.vue').bindings);
});

test('the authoring alias is a fork the official compiler cannot see: from "vue" a ref() is `setup-ref` and a reactive() `setup-reactive-const`; from "obix" the same code is `setup-maybe-ref` — a finding for the alias phase, recorded here as a fact', () => {
  const body = (specifier) => `<script setup lang="ts">\nimport { ref, computed, reactive } from "${specifier}"\nconst count = ref(0)\nconst doubled = computed(() => count.value * 2)\nconst state = reactive({ n: 1 })\n</script>\n`;
  const vue = STAGE(body('vue'), 'Fork.obix').artifact;
  const obix = STAGE(body('obix'), 'Fork.obix').artifact;
  assert.deepEqual({ ...vue.bindings }, { ref: 'setup-const', computed: 'setup-const', reactive: 'setup-const', count: 'setup-ref', doubled: 'setup-ref', state: 'setup-reactive-const' });
  assert.deepEqual({ ...obix.bindings }, { ref: 'setup-maybe-ref', computed: 'setup-maybe-ref', reactive: 'setup-maybe-ref', count: 'setup-maybe-ref', doubled: 'setup-maybe-ref', state: 'setup-maybe-ref' });
  const head = (c) => c.split('const __returned__')[0];
  assert.equal(head(obix.content), head(vue.content).replaceAll('from "vue"', 'from "obix"'), 'the code of the setup is the same; what differs is only what the compiler does with what it does not know');
  assert.match(vue.content, /const __returned__ = \{ count, doubled, state, ref, computed, reactive \}/, 'imports from "vue" are constants: returned as they are');
  assert.match(obix.content, /const __returned__ = \{ count, doubled, state, get ref\(\) \{ return ref \}, get computed\(\) \{ return computed \}, get reactive\(\) \{ return reactive \} \}/, 'imports from a source Vue does not know are exposed through live getters');
  assert.deepEqual(obix.imports.map((i) => i.source), ['obix', 'obix', 'obix'], 'the specifier is left exactly as written — no alias resolution here');
});

test('the imports of the artifact are the official ones: what each import is, where it comes from, whether it is a type, whether the setup script declared it and whether the template uses it', () => {
  const r = fixture('28m-type-only-imports');
  const byLocal = Object.fromEntries(r.artifact.imports.map((i) => [i.local, { ...i }]));
  assert.deepEqual(Object.keys(byLocal), ['Ref', 'ref', 'ComputedRef', 'computed', 'Shape', 'Kind', 'build']);
  assert.deepEqual([byLocal.Ref.isType, byLocal.ComputedRef.isType, byLocal.Shape.isType, byLocal.Kind.isType], [true, true, true, true], 'type-only imports, `import type` and inline `type`');
  assert.deepEqual([byLocal.ref.isType, byLocal.computed.isType, byLocal.build.isType], [false, false, false]);
  assert.deepEqual(byLocal.build, { local: 'build', imported: 'build', source: './shapes', isType: false, isFromSetup: true, isUsedInTemplate: false });
  const dual = fixture('28r-dual-options').artifact.imports.map((i) => ({ ...i }));
  assert.deepEqual(dual, [{ local: 'ref', imported: 'ref', source: 'obix', isType: false, isFromSetup: true, isUsedInTemplate: false }]);
});

// ── TypeScript syntax: retained for the TypeScript phase ────────────────────────────────────────────────────────────────────────────────────

test('TypeScript syntax is retained in the compiled setup — type annotations, enums, namespaces, parameter properties, overloads, satisfies, non-null, generics — for the TypeScript phase', () => {
  const runtime = contentOf('28n-ts-runtime-constructs');
  for (const fact of ['enum Color {', 'namespace Geometry {', 'abstract class Base {', 'constructor(private readonly side: number)', 'function pick(a: string): string', 'declare const injected: string', 'const chosen: Color = Color.Red']) {
    assert.ok(runtime.includes(fact), fact);
  }
  const exprs = contentOf('28o-ts-expressions');
  for (const fact of ['ref<Box<number>>(', 'ref<HTMLElement | null>(null)', '] as const', '} satisfies { mode: string }', 'tuple[0]!', '(first as number) + 1', '<T,>(x: T): T => x']) assert.ok(exprs.includes(fact), fact);
  const bare = fixture('28n-ts-runtime-constructs').artifact.bindings;
  assert.deepEqual([bare.Color, bare.Base, bare.Square, bare.pick], ['literal-const', 'setup-const', 'setup-const', 'setup-const']);
  assert.equal(bare.Geometry, undefined, 'a namespace is not a binding the official compiler knows');
  assert.equal(bare.injected, undefined, 'a declare is not either');
});

test('the generic attribute is for the type checker: the output does not carry it, a prop typed by a type parameter has no runtime type, and the type parameters are left in the code', () => {
  const r = fixture('28l-generic-attribute');
  assert.match(r.artifact.content, /item: \{ type: null, required: true \},/, 'a prop of type U cannot be typed at runtime');
  assert.match(r.artifact.content, /keys: \{ type: Array, required: true \}/);
  assert.match(r.artifact.content, /function pick\(key: T\): void/, 'the type parameter T is still referenced: it is the TypeScript phase that removes annotations');
  assert.doesNotMatch(r.artifact.content, /generic=/);
  assert.equal(r.artifact.lang, 'ts');
});

// ── a normal <script> merged with the setup, top-level await, css variables ─────────────────────────────────────────────────────────────────

test('a normal <script> is compiled together with the <script setup>: its exports stay, its default export becomes the base of the component options, and both ranges are reported', () => {
  const r = fixture('28r-dual-options');
  const a = r.artifact;
  assert.equal(a.kind, 'script-setup');
  assert.match(a.content, /export const version = "2"/);
  assert.match(a.content, /const __default__ = \{\n {2}inheritAttrs: false,\n {2}customOption: true\n\}/);
  assert.match(a.content, /\.\.\.__default__,\n {2}__name: 'DualOptions',/);
  assert.match(a.content, /const __returned__ = \{ version, n \}/, 'the normal script\'s export is available to the template');
  const source = fixtureSource(byId('28r-dual-options'));
  assert.equal(source.slice(a.scriptRange.start.offset, a.scriptRange.end.offset).trim().split('\n')[0], 'export const version = "2"');
  assert.equal(source.slice(a.setupRange.start.offset, a.setupRange.end.offset).trim().split('\n')[0], 'import { ref } from "obix"');
  assert.ok(Array.isArray(a.scriptAst) && Array.isArray(a.scriptSetupAst));
  assert.deepEqual({ ...a.bindings }, { ref: 'setup-maybe-ref', version: 'literal-const', n: 'setup-maybe-ref' });
});

test('top-level await makes an async setup with the official async-context helper; v-bind() in <style> injects useCssVars scoped by the component id', () => {
  const awaited = fixture('28q-top-level-await').artifact.content;
  assert.match(awaited, /async setup\(__props, \{ expose: __expose \}\)/);
  assert.match(awaited, /_withAsyncContext\(\(\) => Promise\.resolve\(1\)\)/);
  const f = byId('22-css-v-bind');
  const css = STAGE(fixtureSource(f), `${f.name}.obix`).artifact.content;
  const id = scriptIdOf(`${f.name}.obix`);
  assert.match(css, /_useCssVars\(_ctx => \(\{/);
  assert.ok(css.includes(`"${id}-color": (_unref(color))`) && css.includes(`"${id}-theme\\.bg": (theme.bg)`), 'the css variables are scoped by the id derived from the file name');
  assert.ok(STAGE(fixtureSource(f), `${f.name}.obix`, { id: 'chosen' }).artifact.content.includes('"chosen-color": (_unref(color))'), 'an explicit id replaces it');
});

// ── diagnostics ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('a warning is a diagnostic, not output: the compile succeeds, the warning is reported with the place it points at and what the official compiler printed — and nothing is printed', () => {
  const f = byId('29f-with-defaults-destructure-warning');
  const source = fixtureSource(f);
  const printed = [];
  const original = console.warn;
  console.warn = (...args) => printed.push(args);
  let r;
  try {
    r = STAGE(source, 'WithDefaultsDestructure.obix');
  } finally {
    console.warn = original;
  }
  assert.deepEqual(printed, []);
  assert.deepEqual([r.status, r.ok], ['compiled', true], 'a warning is not an error');
  assert.ok(r.artifact);
  const [d] = r.diagnostics;
  assert.equal(d.severity, 'warning');
  assert.equal(d.code, 'OBIX_SCRIPT_SETUP_WITH_DEFAULTS_UNNECESSARY');
  assert.equal(d.message, 'withDefaults() is unnecessary when using destructure with defineProps().\nReactive destructure will be disabled when using withDefaults().\nPrefer using destructure default values, e.g. const { foo = 1 } = defineProps(...).');
  assert.match(d.detail, /^\[@vue\/compiler-sfc\] withDefaults\(\) is unnecessary[\s\S]*\n\nWithDefaultsDestructure\.obix\n\d+ {2}\|/);
  assert.doesNotMatch(d.detail, /\u001b/, 'no colour codes');
  assertLocated(d, source, 'withDefaults', 'warning');
  assert.deepEqual({ ...d.upstream }, { package: '@vue/compiler-sfc', version: '3.5.43', enum: null, name: null, code: null });
});

test('an error keeps the warnings the official compiler printed before it gave up, in order, and is last', () => {
  const source = '<script setup lang="ts">\nconst { a } = withDefaults(defineProps<{ a?: string }>(), { a: "x" })\ndefineProps<{ b: string }>()\n</script>\n';
  const r = STAGE(source, 'Both.obix');
  assert.deepEqual([r.status, r.ok, r.artifact], ['failed', false, null]);
  assert.deepEqual(r.diagnostics.map((d) => [d.code, d.severity]), [['OBIX_SCRIPT_SETUP_WITH_DEFAULTS_UNNECESSARY', 'warning'], ['OBIX_SCRIPT_SETUP_DEFINE_PROPS_DUPLICATE', 'error']]);
  assert.deepEqual(r.diagnostics.map((d) => source.slice(d.start.offset, d.end.offset)), ['withDefaults', 'defineProps<{ b: string }>()']);
});

test('the language mismatch of a normal <script> and a <script setup> is reported even where a block would otherwise be deferred — the official order — and has no place', () => {
  const both = '<script lang="coffee">a = 1</script>\n<script setup lang="ts">const n = 1</script>\n';
  const r = STAGE(both, 'Order.obix');
  assert.deepEqual([r.status, r.diagnostics.map((d) => d.code)], ['failed', [OBIX_SCRIPT_CODES.langMismatch]]);
  assert.equal(r.diagnostics[0].start, undefined);
  assert.equal(r.diagnostics[0].message, '<script> and <script setup> must have the same language type.');
  const same = STAGE('<script lang="coffee">a = 1</script>\n<script setup lang="coffee">b = 2</script>\n', 'Same.obix');
  assert.deepEqual([same.status, same.diagnostics.map((d) => d.code)], ['deferred', [OBIX_SCRIPT_CODES.deferredLanguage]], 'the same unsupported language on both is deferred');
  // `<script setup src>` is refused by the SFC parser, which then drops the block: the SFC keeps the diagnostic, and nothing is left for this stage
  const withSrc = '<script setup lang="ts" src="./x.ts"></script>\n';
  assert.deepEqual(toObixSfc(parseObix(withSrc, 'Src.obix')).diagnostics.map((d) => d.code), ['OBIX_SFC_SCRIPT_SETUP_SRC']);
  const src = STAGE(withSrc, 'Src.obix');
  assert.deepEqual([src.status, src.ok, src.artifact, src.diagnostics], ['absent', true, null, []]);
});

// ── the vocabulary, checked against the official compiler ───────────────────────────────────────────────────────────────────────────────────

test('COMPLETENESS — every message the pinned official compiler can raise about a script is matched by exactly one entry of the vocabulary, and no entry of the setup vocabulary is stale', () => {
  const { sites } = officialScriptMessages();
  const table = [...OBIX_SCRIPT_SETUP_MESSAGE_CODES, ...OBIX_SCRIPT_MESSAGE_CODES];
  const fixed = sites.filter((s) => !s.dynamic);
  assert.ok(fixed.length >= 41, `${fixed.length} sites in the source of the official compiler`);
  assert.deepEqual(sites.filter((s) => s.dynamic).map((s) => s.source), ['err.message'], 'the one message that is whatever the host raised: unclassified by design');
  for (const site of fixed) {
    const sample = site.sample.trimEnd();
    const matching = table.filter((entry) => entry.pattern.test(sample));
    assert.equal(matching.length, 1, `${JSON.stringify(sample)} is matched by ${matching.length} entries`);
  }
  for (const entry of OBIX_SCRIPT_SETUP_MESSAGE_CODES) assert.ok(fixed.some((s) => entry.pattern.test(s.sample.trimEnd())), `${entry.code} matches no message of the official compiler`);
  // the shared table: the invariant is a site of the compiler; the language mismatch is thrown elsewhere, by `throw new Error`
  assert.ok(fixed.some((s) => OBIX_SCRIPT_MESSAGE_CODES[1].pattern.test(s.sample)));
});

test('COVERAGE — every entry of the setup vocabulary is exercised by a fixture of the corpus, except the ones the frontend cannot reach — each with its reason', () => {
  const reached = new Set(manifest.fixtures.flatMap((f) => (f.script ? f.script.diagnostics.map((d) => d.code) : [])));
  const unreachable = new Map([
    ['OBIX_SCRIPT_SETUP_PROPS_DESTRUCTURE_PROHIBITED', 'needs the option propsDestructure: "error", which the frontend fixes to true'],
    ['OBIX_SCRIPT_SETUP_TYPE_INDEX_UNSUPPORTED', 'raised only for an index type the resolver cannot walk; no source the corpus can state without a resolver host reaches it'],
    ['OBIX_SCRIPT_SETUP_TYPE_INDEX_NOT_FINITE', 'raised only for an index type whose keys are not finite; the same'],
    ['OBIX_SCRIPT_SETUP_TYPE_IMPORT_TYPESCRIPT_MISSING', 'needs a file system host, which a pure frontend does not have (deferred capability)'],
    ['OBIX_SCRIPT_SETUP_TYPE_IMPORT_UNRESOLVED', 'needs a file system host, which a pure frontend does not have (deferred capability)'],
  ]);
  const missing = OBIX_SCRIPT_SETUP_MESSAGE_CODES.map((e) => e.code).filter((code) => !reached.has(code));
  assert.deepEqual(missing.sort(), [...unreachable.keys()].sort());
  for (const code of reached) assert.ok(OBIX_SCRIPT_SETUP_MESSAGE_CODES.some((e) => e.code === code) || Object.values(OBIX_SCRIPT_CODES).includes(code), `${code}: a code of a table`);
});

// ── the environment and the confinement ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('the stage never throws and never prints for a script, valid or not, and the official compiler leaves nothing changed behind it', () => {
  const shared = createRequire(requireHere.resolve('@vue/compiler-sfc'))('@vue/shared');
  const frame = shared.generateCodeFrame;
  const warn = console.warn;
  const env = process.env.NODE_ENV;
  const calls = [];
  const originals = ['warn', 'error', 'log', 'info'].map((name) => [name, console[name]]);
  for (const [name] of originals) console[name] = (...args) => calls.push([name, ...args]);
  try {
    for (const f of manifest.fixtures) {
      const source = fixtureSource(f);
      assert.doesNotThrow(() => STAGE(source, `${f.name}.obix`), f.id);
      assert.doesNotThrow(() => VUE(source, `${f.name}.vue`), f.id);
    }
  } finally {
    for (const [name, fn] of originals) console[name] = fn;
  }
  assert.deepEqual(calls, []);
  assert.equal(shared.generateCodeFrame, frame);
  assert.equal(console.warn, warn);
  assert.equal(process.env.NODE_ENV, env);
});

test('the environment does not change what a script means: NODE_ENV=production and development give the same result — hints, warnings, errors and all', () => {
  const ids = ['28-define-props-runtime', '28k-all-macros', '28t-macro-import', '29f-with-defaults-destructure-warning', '29-duplicate-define-props', '30c-setup-syntax-error', '30h-lang-mismatch', '28r-dual-options'];
  const probeIn = (env) => {
    const r = spawnSync(process.execPath, [path.join(PACKAGE, 'test', 'env-probe.mjs'), JSON.stringify(ids)], { encoding: 'utf8', env: { ...process.env, NODE_ENV: env } });
    const m = /@@(.*)$/s.exec(r.stdout ?? '');
    assert.ok(m, `the probe died under ${env}: ${(r.stderr ?? '').slice(0, 400)}`);
    const out = JSON.parse(m[1]);
    assert.equal(out.env, env);
    return out.rows;
  };
  const development = probeIn('development');
  const production = probeIn('production');
  assert.equal(development.length, ids.length);
  assert.deepEqual(production, development);
  assert.ok(development.some((row) => row.status === 'failed') && development.some((row) => row.diagnostics.some((d) => d.severity === 'warning')));
});

test('compiling is deterministic and pure: the same SFC gives deep-equal results with distinct ASTs, the SFC is untouched, and everything reported is frozen', () => {
  const sfc = toObixSfc(parseObix(fixtureSource(byId('28k-all-macros')), 'AllMacros.obix'));
  const before = JSON.stringify(sfc);
  const a = compileObixScriptSetup(sfc);
  const b = compileObixScriptSetup(sfc);
  assert.deepStrictEqual(comparable(a), comparable(b));
  assert.notEqual(a.artifact.scriptSetupAst, b.artifact.scriptSetupAst);
  assert.equal(JSON.stringify(sfc), before);
  for (const r of [a, b]) assert.ok(Object.isFrozen(r) && Object.isFrozen(r.diagnostics) && Object.isFrozen(r.artifact) && Object.isFrozen(r.artifact.bindings) && Object.isFrozen(r.artifact.imports));
  const bad = STAGE(fixtureSource(byId('29-duplicate-define-props')), 'DupProps.obix');
  for (const d of bad.diagnostics) assert.ok(Object.isFrozen(d) && Object.isFrozen(d.upstream) && Object.isFrozen(d.start) && Object.isFrozen(d.end));
  assert.deepEqual(plainBindings(a.artifact.bindings), officialScript(fixtureSource(byId('28k-all-macros')), 'AllMacros.vue').bindings);
});

test('misuse is reported in the words of this entry point: a TypeError that names compileObixScriptSetup', () => {
  for (const bad of [undefined, null, 'x', {}, { filename: 'a.obix', source: 'x' }]) {
    assert.throws(() => compileObixScriptSetup(bad), (e) => e instanceof TypeError && /^compileObixScriptSetup expects a canonical SFC/.test(e.message), JSON.stringify(bad));
  }
  const sfc = toObixSfc(parseObix('<script setup>const a = 1</script>\n', 'A.obix'));
  assert.throws(() => compileObixScriptSetup(sfc, { mode: 'x' }), (e) => e instanceof TypeError && /^compileObixScriptSetup expects no option named "mode"/.test(e.message));
  const skewed = structuredClone(sfc);
  skewed.scriptSetup.loc.end.offset += 1;
  assert.throws(() => compileObixScriptSetup(skewed), (e) => e instanceof TypeError && /^compileObixScriptSetup: the script of the SFC does not match its source/.test(e.message));
});
