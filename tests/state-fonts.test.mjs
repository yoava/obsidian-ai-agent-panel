import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILY_MONO, FAMILY_UI, FontRegistry } from "./.build/state/fonts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Documents with a `fonts` set, and a `FontFace` factory recording every face and holding its load open. */
function setup() {
	const calls = [];
	const faces = [];
	const makeDoc = (name) => {
		const set = new Set();
		return { name, fonts: { add: (face) => set.add(face), delete: (face) => set.delete(face), set } };
	};
	const makeFace = (doc, family, source, descriptors) => {
		const face = { family, source, descriptors, doc };
		face.load = () =>
			new Promise((resolve, reject) => {
				calls.push(`load ${family} sees ${doc.fonts.set.has(face) ? "added" : "unadded"}`);
				face.settle = { resolve, reject };
			});
		faces.push(face);
		return face;
	};
	const registry = new FontRegistry({ ui: "data:font/woff2;base64,AAA", mono: "data:font/woff2;base64,BBB" }, makeFace);
	return { registry, makeDoc, faces, calls };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("ADR-017 Typography: a document gets two namespaced faces with data sources, added before load()", () => {
	const { registry, makeDoc, faces, calls } = setup();
	const doc = makeDoc("main");
	registry.ensure(doc);
	assert.deepEqual(faces.map((face) => face.family), ["AI Agent Panel Geist", "AI Agent Panel Geist Mono"]);
	assert.deepEqual(faces.map((face) => face.family), [FAMILY_UI, FAMILY_MONO]);
	assert.ok(faces.every((face) => face.source.startsWith("url(data:font/woff2")));
	assert.ok(faces.every((face) => face.descriptors.weight === "100 900" && face.descriptors.display === "swap"));
	assert.ok(faces.every((face) => face.descriptors.unicodeRange.startsWith("U+0000-00FF")));
	assert.equal(doc.fonts.set.size, 2);
	assert.deepEqual(calls, ["load AI Agent Panel Geist sees added", "load AI Agent Panel Geist Mono sees added"]);
});

test("ADR-017 Typography: two roots sharing one document add once", () => {
	const { registry, makeDoc, faces } = setup();
	const doc = makeDoc("main");
	registry.ensure(doc);
	registry.ensure(doc);
	assert.equal(faces.length, 2);
	assert.equal(doc.fonts.set.size, 2);
});

test("ADR-017 Typography: a root migrating to a second document adds there and leaves the first", () => {
	const { registry, makeDoc, faces } = setup();
	const first = makeDoc("main");
	const second = makeDoc("popout");
	registry.ensure(first);
	registry.ensure(second);
	assert.equal(faces.length, 4);
	assert.equal(first.fonts.set.size, 2);
	assert.equal(second.fonts.set.size, 2);
	assert.deepEqual(registry.documents(), [first, second]);
});

test("ADR-017 Typography: a pop-out closed before unload, delivered as the window-close pair, is deleted from the map", () => {
	const { registry, makeDoc } = setup();
	const main = makeDoc("main");
	const popout = makeDoc("popout");
	registry.ensure(main);
	registry.ensure(popout);
	const onWindowClose = (_win, window) => registry.dispose(window.document);
	onWindowClose({}, { document: popout });
	assert.equal(popout.fonts.set.size, 0);
	assert.deepEqual(registry.documents(), [main]);
});

test("ADR-017 Typography: a load settling after dispose neither throws nor re-adds", async () => {
	const { registry, makeDoc, faces } = setup();
	const doc = makeDoc("main");
	registry.ensure(doc);
	registry.dispose(doc);
	faces[0].settle.resolve();
	faces[1].settle.reject(new Error("decode failed"));
	await tick();
	assert.equal(doc.fonts.set.size, 0);
	assert.deepEqual(registry.documents(), []);
});

test("ADR-017 Typography: a rejected load is swallowed and the faces stay", async () => {
	const { registry, makeDoc, faces } = setup();
	const doc = makeDoc("main");
	registry.ensure(doc);
	faces[0].settle.reject(new Error("decode failed"));
	await tick();
	assert.equal(doc.fonts.set.size, 2);
});

test("ADR-017 Typography: unload disposes every remaining document; re-enable registers two faces per document again", () => {
	const { registry, makeDoc, faces } = setup();
	const a = makeDoc("a");
	const b = makeDoc("b");
	registry.ensure(a);
	registry.ensure(b);
	registry.disposeAll();
	assert.equal(a.fonts.set.size + b.fonts.set.size, 0);
	assert.deepEqual(registry.documents(), []);
	registry.ensure(a);
	assert.equal(a.fonts.set.size, 2);
	assert.equal(faces.length, 6);
});

test("ADR-017 Typography: dispose twice, and of an unknown document, is a no-op", () => {
	const { registry, makeDoc } = setup();
	const doc = makeDoc("main");
	registry.ensure(doc);
	registry.dispose(doc);
	registry.dispose(doc);
	registry.dispose(makeDoc("other"));
	assert.equal(doc.fonts.set.size, 0);
});

test("ADR-017 Typography: the token block names the registered families, falling back to Obsidian's", () => {
	const css = readFileSync(path.join(ROOT, "styles.css"), "utf8");
	assert.ok(css.includes(`--ai-agent-panel-font-ui: "${FAMILY_UI}", var(--font-interface);`));
	assert.ok(css.includes(`--ai-agent-panel-font-mono: "${FAMILY_MONO}", var(--font-monospace);`));
});

test("ADR-017 Typography: src/fonts.ts imports only the two latin files, and the scope wires fonts per root", () => {
	const fonts = readFileSync(path.join(ROOT, "src", "fonts.ts"), "utf8");
	const imports = [...fonts.matchAll(/^import .* from "(.+\.woff2)";$/gm)].map((m) => m[1]);
	assert.deepEqual(imports, [
		"@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
		"@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
	]);
	const scope = readFileSync(path.join(ROOT, "src", "theme-scope.ts"), "utf8");
	assert.match(scope, /watchFonts\(root\)/);
	assert.match(scope, /on\("window-close", \(_win, window\) => disposeFonts\(window\.document\)\)/);
	assert.match(scope, /disposeAllFonts\(\)/);
});
