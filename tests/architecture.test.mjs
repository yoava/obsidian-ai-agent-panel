/**
 * Module boundaries (ADR-016 Boundaries; DES-001 A-rules; DES-003 P-rules):
 * runtime imports from esbuild's metafile of src/main.ts, symbols from
 * TypeScript's checker. Type-only imports are erased and stay free.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

/** DES-001 Layers; `state/`, `tab/` and `ui/` by prefix. */
const LAYER_1 = [
	"protocol/types", "settings-core", "models", "commands", "conversation-list", "history-core",
	"history-file", "history-notice", "tabs-layout", "diff", "edits", "tool-labels", "inert-markdown",
	"transcript-markdown", "restore", "mcp/server", "mcp/query", "timers", "save-queue", "mcp/replies",
	"usage-core", "attachments", "mcp/paths", "edit-tracker", "json", "context-format",
];
const LAYER_2 = ["session", "protocol/client", "cli", "cli-args", "bash"];
const LAYER_3 = [
	"history", "export", "mcp/vault-tools", "diffview", "confirm-modal", "report-view", "suggest",
	"local-store", "icon", "context-builder", "theme-scope", "fonts",
];
const LAYER_4 = ["view", "settings"];

export function layerOf(id) {
	if (id === "main") return 5;
	if (LAYER_4.includes(id) || id.startsWith("tab/") || id.startsWith("ui/")) return 4;
	if (LAYER_3.includes(id)) return 3;
	if (LAYER_2.includes(id)) return 2;
	if (LAYER_1.includes(id) || id.startsWith("state/")) return 1;
	return null;
}

const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
/** ADR-007 admitted runtime dependencies, keyed by the ADR that admitted them, with exact versions. */
const ADMITTED = {
	"017": { "@fontsource-variable/geist": "5.3.0", "@fontsource-variable/geist-mono": "5.3.0" },
};

/** The only package files the bundle may inline: `.woff2` data imported by `fonts` (ADR-017 Typography). */
const ADMITTED_FILES = [
	"node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
	"node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
];

const OBSIDIAN_PROVIDED = /^(obsidian|electron|@codemirror\/[\w-]+|@lezer\/[\w-]+)$/;

/** `fs` and `node:fs` alike; internal paths as module ids ("ui/composer"). */
function normalize(specifier) {
	const bare = specifier.replace(/^node:/, "");
	return BUILTINS.has(bare) ? `node:${bare}` : specifier;
}

/** A package file as `node_modules/...`, whatever the install is linked from; null for any other path. */
function packageFile(file) {
	const at = file.lastIndexOf("node_modules/");
	return at === -1 ? null : file.slice(at);
}

function moduleId(file, srcRoot = SRC) {
	return path.relative(srcRoot, path.resolve(ROOT, file)).replace(/\\/g, "/").replace(/\.ts$/, "");
}

const EXTERNAL = [
	"obsidian",
	"electron",
	"@codemirror/*",
	"@lezer/*",
	...builtinModules.flatMap((name) => (name.startsWith("node:") ? [name] : [name, `node:${name}`])),
];

async function metafileInputs(entryPoints) {
	const result = await esbuild.build({
		absWorkingDir: ROOT,
		entryPoints,
		bundle: true,
		write: false,
		metafile: true,
		platform: "node",
		format: "esm",
		outdir: "out",
		external: EXTERNAL,
		loader: { ".woff2": "dataurl" },
		logLevel: "silent",
	});
	return result.metafile.inputs;
}

/** Runtime import graph: module id -> imported module ids and external specifiers. */
export function importGraph(inputs) {
	const graph = new Map();
	for (const [file, input] of Object.entries(inputs)) {
		if (!file.startsWith("src/")) continue;
		graph.set(
			moduleId(file),
			new Set(
				input.imports.map((imp) =>
					imp.external ? normalize(imp.path) : packageFile(imp.path) ?? moduleId(imp.path)
				)
			)
		);
	}
	return graph;
}

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [path.join(dir, entry.name)] : []
	);
}

function typesOnly(source) {
	return source.statements.every(
		(statement) =>
			ts.isInterfaceDeclaration(statement) ||
			ts.isTypeAliasDeclaration(statement) ||
			(ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly === true) ||
			(ts.isExportDeclaration(statement) && statement.isTypeOnly)
	);
}

function importsObsidian(source) {
	return source.statements.some(
		(statement) => ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === "obsidian"
	);
}

// --- Graph rules, pure over the import graph ---------------------------------

const isUi = (id) => id.startsWith("ui/");
const isState = (id) => id.startsWith("state/");
const isTab = (id) => id.startsWith("tab/");

/** Runtime importers of a module or external. */
function importersOf(graph, target) {
	return [...graph].filter(([, imports]) => imports.has(target)).map(([id]) => id);
}

const UI_SHARED = ["ui/dom", "ui/markdown", "ui/copy"];
const UI_MAY_IMPORT = ["diffview", "report-view", "suggest", "confirm-modal", "icon", "obsidian"];

/** Every graph-rule breach as { file, rule, detail }. */
export function graphViolations(graph) {
	const out = [];
	const add = (file, rule, detail) => out.push({ file, rule, detail });
	// Every bundled module is a key; anything else is an external specifier.
	const internal = (target) => graph.has(target);
	for (const [id, imports] of graph) {
		const layer = layerOf(id);
		if (layer === null) add(id, "A3: has a layer", "not in DES-001's Layers table");
		for (const target of imports) {
			if (internal(target)) {
				const targetLayer = layerOf(target);
				if (layer !== null && targetLayer !== null && targetLayer > layer)
					add(id, "A3: imports its own layer or lower", target);
			}
			if (layer !== null && layer <= 2 && (target === "obsidian" || target === "electron"))
				add(id, "A2: no obsidian or electron in layers 1 and 2", target);
			if (isState(id) && (target === "obsidian" || target === "electron" || isUi(target) || isTab(target) || target === "view"))
				add(id, "U1: state imports nothing of the panel or Obsidian", target);
			if (isUi(id) && !isUi(target) && !isState(target) && layerOf(target) !== 1 && !UI_MAY_IMPORT.includes(target))
				add(id, "U2: ui imports only state, layer 1 and the listed widgets", target);
			if (target === "session" && !isTab(id)) add(id, "U3: imports session", target);
			if (target === "tab/chat-tab" && id !== "view") add(id, "U3: only view imports tab/chat-tab", target);
			if (target === "view" && id !== "main") add(id, "U4: only main imports view", target);
			// Electron's `net` cannot be told apart by symbol (no Electron typings are
			// installed), so no module imports Electron at all.
			if (["node:http", "node:https", "node:net", "node:tls", "node:dgram", "electron"].includes(target))
				add(id, "U6: no network API", target);
			if (target === "main") add(id, "A1: main is imported only as a type", target);
			if (
				id.startsWith("protocol/") &&
				!target.startsWith("protocol/") &&
				!["timers", "json", "node:child_process"].includes(target)
			)
				add(id, "A5: protocol imports only protocol, timers, json and node:child_process", target);
			if (id === "session" && !target.startsWith("protocol/")) add(id, "A6: session imports only protocol", target);
			if (["mcp/server", "mcp/query", "mcp/replies", "mcp/paths"].includes(id))
				add(id, "A7: imports nothing", target);
			if (id === "mcp/vault-tools" && !target.startsWith("mcp/") && target !== "obsidian")
				add(id, "A7: vault-tools imports only mcp and obsidian", target);
			if (target === "node:child_process" && !["protocol/client", "bash", "cli"].includes(id))
				add(id, "A8: node:child_process only in protocol/client, bash and cli", target);
			if (["node:fs", "node:os", "node:path"].includes(target) && id !== "cli")
				add(id, "A8: node:fs, node:os and node:path only in cli", target);
			if (target.startsWith("node_modules/")) {
				if (id !== "fonts" || !ADMITTED_FILES.includes(target))
					add(id, "A11: only fonts imports the admitted font files", target);
			} else if (!internal(target) && !target.startsWith("node:") && !OBSIDIAN_PROVIDED.test(target))
				add(id, "A11: externals are Obsidian's modules and Node builtins", target);
			if (id === "usage-core" && !["settings-core", "timers"].includes(target))
				add(id, "G1: usage-core imports only settings-core and timers", target);
			if (target === "usage-core" && id !== "main") add(id, "G2: only main imports usage-core", target);
		}
		if (isUi(id) && !UI_SHARED.includes(id)) {
			const importers = importersOf(graph, id);
			if (importers.length !== 1) add(id, "P5: exactly one importer", importers.join(", ") || "none");
		}
	}
	for (const cycle of cycles(graph)) add(cycle[0], "U7: no runtime import cycles", cycle.join(" -> "));
	return out;
}

/** Strongly connected components of more than one module, or a self-import (Tarjan). */
export function cycles(graph) {
	const index = new Map();
	const low = new Map();
	const stack = [];
	const onStack = new Set();
	const found = [];
	let next = 0;
	const visit = (id) => {
		index.set(id, next);
		low.set(id, next++);
		stack.push(id);
		onStack.add(id);
		for (const target of graph.get(id) ?? []) {
			if (!graph.has(target)) continue;
			if (!index.has(target)) {
				visit(target);
				low.set(id, Math.min(low.get(id), low.get(target)));
			} else if (onStack.has(target)) low.set(id, Math.min(low.get(id), index.get(target)));
		}
		if (low.get(id) !== index.get(id)) return;
		const component = [];
		let member;
		do {
			member = stack.pop();
			onStack.delete(member);
			component.push(member);
		} while (member !== id);
		if (component.length > 1 || graph.get(id)?.has(id)) found.push(component.reverse());
	};
	for (const id of graph.keys()) if (!index.has(id)) visit(id);
	return found;
}

// --- Symbol rules, over TypeScript's checker ---------------------------------

/** Where a declaration lives: a library, or the module id of a file under `srcRoot`. */
const declaredIn = (declaration, srcRoot) => {
	const file = declaration.getSourceFile().fileName.replace(/\\/g, "/");
	if (/\/typescript\/lib\/lib\.dom[\w.]*\.d\.ts$/.test(file)) return "dom";
	if (/\/obsidian\/obsidian\.d\.ts$/.test(file)) return "obsidian";
	if (/\/(@types\/node|undici-types)\//.test(file)) return "node";
	if (/\/typescript\/lib\/lib\./.test(file)) return "lib";
	if (/\/electron\//.test(file)) return "electron";
	if (file.startsWith(srcRoot.replace(/\\/g, "/"))) return moduleId(file, srcRoot);
	return "other";
};

const parentInterface = (declaration) =>
	ts.isInterfaceDeclaration(declaration.parent) ? declaration.parent.name.text : null;

const GLOBAL_NETWORK = new Set(["fetch", "XMLHttpRequest", "WebSocket", "EventSource"]);
const OBSIDIAN_NETWORK = new Set(["requestUrl", "request", "ajax", "ajaxPromise"]);
const GEOMETRY = new Set([
	"getBoundingClientRect", "offsetTop", "offsetWidth", "offsetHeight", "clientWidth", "clientHeight",
	"scrollWidth", "scrollHeight", "scrollTop", "getComputedStyle",
]);
const GEOMETRY_READERS = [
	"ui/shell", "ui/status-line", "ui/composer", "ui/jump-rail", "ui/tab-strip", "ui/popover-host",
	"ui/hover-card-host", "ui/messages",
];
const OBSIDIAN_MODALS = new Set(["Modal", "SuggestModal", "FuzzySuggestModal"]);

/**
 * Whether a class extends one of Obsidian's modals: "direct" when its own
 * base is one, "inherited" through a class of the plugin's, else null.
 */
function modalAncestry(type, checker, srcRoot) {
	for (const base of checker.getBaseTypes(type.target ?? type) ?? []) {
		const target = base.target ?? base;
		const symbol = target.getSymbol();
		if ((symbol?.declarations ?? []).some((d) => declaredIn(d, srcRoot) === "obsidian"))
			return OBSIDIAN_MODALS.has(symbol.name) ? "direct" : null;
		if (modalAncestry(target, checker, srcRoot)) return "inherited";
	}
	return null;
}

/** The Obsidian modal class `new X(...)` builds itself, which no `onOpen` of the plugin's themes; else null. */
function newedObsidianModal(node, checker, srcRoot) {
	const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
	let symbol = ts.isIdentifier(callee) ? checker.getSymbolAtLocation(callee) : undefined;
	if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
	const obsidian = (symbol?.declarations ?? []).some((d) => declaredIn(d, srcRoot) === "obsidian");
	return obsidian && OBSIDIAN_MODALS.has(symbol.name) ? symbol.name : null;
}

/** Every node under `root` that `match` accepts. */
function descendants(root, match) {
	const found = [];
	const visit = (node) => {
		if (match(node)) found.push(node);
		ts.forEachChild(node, visit);
	};
	visit(root);
	return found;
}

/** `this.<name>`, the name; else null. */
const thisMember = (node) =>
	ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword ? node.name.text : null;

/** Fields `onOpen` sets to `themeModal(this)` from theme-scope. */
function detachFields(onOpen, checker, srcRoot) {
	return descendants(
		onOpen,
		(node) => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
	).flatMap((assignment) => {
		const field = thisMember(assignment.left);
		const call = assignment.right;
		if (!field || !ts.isCallExpression(call) || call.arguments[0]?.kind !== ts.SyntaxKind.ThisKeyword) return [];
		const callee = ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
		let symbol = ts.isIdentifier(callee) ? checker.getSymbolAtLocation(callee) : undefined;
		if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
		const fromScope =
			symbol?.name === "themeModal" &&
			(symbol.declarations ?? []).some((d) => declaredIn(d, srcRoot) === "theme-scope");
		return fromScope ? [field] : [];
	});
}

/** Whether `method` calls `this.<field>()` (optional call included) for one of `fields`. */
const callsField = (method, fields) =>
	descendants(method, ts.isCallExpression).some((call) => fields.includes(thisMember(call.expression)));

/** Whether `method` calls `super.<name>()`. */
const callsSuper = (method, name) =>
	descendants(method, ts.isCallExpression).some(
		(call) =>
			ts.isPropertyAccessExpression(call.expression) &&
			call.expression.expression.kind === ts.SyntaxKind.SuperKeyword &&
			call.expression.name.text === name
	);

/**
 * U5's themeModal clause (ADR-017): a class extending an Obsidian modal keeps
 * `themeModal(this)` in a field in its `onOpen` and calls that field in its
 * `onClose`. A subclass of the plugin's own modal may instead inherit both,
 * or call `super.onOpen()` and `super.onClose()` from its own.
 */
function themeModalBreach(node, checker, srcRoot) {
	// A class expression's type is its constructor's; the instance type is what it constructs.
	const type = ts.isClassDeclaration(node)
		? checker.getTypeAtLocation(node)
		: checker.getTypeAtLocation(node).getConstructSignatures()[0]?.getReturnType();
	const ancestry = type ? modalAncestry(type, checker, srcRoot) : null;
	if (!ancestry) return false;
	const method = (name) =>
		node.members.find((member) => ts.isMethodDeclaration(member) && ts.isIdentifier(member.name) && member.name.text === name);
	const onOpen = method("onOpen");
	const onClose = method("onClose");
	const fields = onOpen ? detachFields(onOpen, checker, srcRoot) : [];
	if (onOpen && onClose && fields.length > 0 && callsField(onClose, fields)) return false;
	if (ancestry === "direct") return true;
	return (onOpen !== undefined && !callsSuper(onOpen, "onOpen")) || (onClose !== undefined && !callsSuper(onClose, "onClose"));
}

/** The popover and hover-card root classes as whole class names, and the modules that may name them (P1). */
const HOST_ROOT_CLASS = /(?<![\w-])ai-agent-panel-(?:popover|hover-card)(?![\w-])/;
const HOSTS = ["ui/popover-host", "ui/hover-card-host"];
/** The live-region attribute as a whole name, and the one module that may set it (P2). */
const ARIA_LIVE = /(?<![\w-])aria-live(?![\w-])/;
const ANNOUNCER = "ui/announcer";

/**
 * Every symbol-rule breach under `srcRoot` as { file, rule, detail }, one per
 * use: the detail names the symbol and its line.
 */
export function symbolViolations(program, srcRoot = SRC) {
	const checker = program.getTypeChecker();
	const root = srcRoot.replace(/\\/g, "/");
	const out = [];
	for (const source of program.getSourceFiles()) {
		const fileName = source.fileName.replace(/\\/g, "/");
		if (!fileName.startsWith(root)) continue;
		const id = moduleId(fileName, srcRoot);
		const visit = (node) => {
			if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && themeModalBreach(node, checker, srcRoot)) {
				const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
				out.push({ file: id, rule: "U5: every modal calls themeModal", detail: `${node.name?.text ?? "class"}, line ${line}` });
			}
			const newed = ts.isNewExpression(node) ? newedObsidianModal(node, checker, srcRoot) : null;
			if (newed) {
				const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
				out.push({ file: id, rule: "U5: every modal calls themeModal", detail: `new ${newed}, line ${line}` });
			}
			if (
				(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateLiteralToken(node)) &&
				HOST_ROOT_CLASS.test(node.text) &&
				!HOSTS.includes(id)
			) {
				const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
				out.push({ file: id, rule: "P1: popover and hover-card root classes only in their hosts", detail: `line ${line}` });
			}
			if (
				(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateLiteralToken(node)) &&
				ARIA_LIVE.test(node.text) &&
				id !== ANNOUNCER
			) {
				const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
				out.push({ file: id, rule: "P2: aria-live only in ui/announcer", detail: `line ${line}` });
			}
			if (ts.isIdentifier(node)) {
				let symbol = checker.getSymbolAtLocation(node);
				if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
				const declarations = symbol?.declarations ?? [];
				const origins = declarations.map((d) => declaredIn(d, srcRoot));
				const name = node.text;
				const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
				const add = (rule) => out.push({ file: id, rule, detail: `${name}, line ${line}` });
				if (isState(id) && origins.length > 0 && origins.every((o) => o === "dom" || o === "obsidian"))
					add("U1: no DOM or Obsidian symbol in state");
				if (name === "MarkdownRenderer" && origins.includes("obsidian") && id !== "ui/markdown")
					add("U5: MarkdownRenderer");
				if (
					name === "open" &&
					declarations.some(
						(d) => declaredIn(d, srcRoot) === "dom" && (parentInterface(d) === "Window" || ts.isFunctionDeclaration(d))
					) &&
					id !== "ui/messages"
				)
					add("U5: window.open");
				if (
					name === "clipboard" &&
					declarations.some((d) => declaredIn(d, srcRoot) === "dom" && parentInterface(d) === "Navigator") &&
					id !== "ui/copy"
				)
					add("U5: navigator.clipboard");
				if ((name === "DropdownComponent" || name === "addDropdown") && origins.includes("obsidian") && id !== "settings")
					add("U5: no dropdown outside settings");
				if (GLOBAL_NETWORK.has(name) && origins.some((o) => o === "dom" || o === "node" || o === "lib"))
					add("U6: no network API");
				if (OBSIDIAN_NETWORK.has(name) && origins.includes("obsidian")) add("U6: no network API");
				if (name === "ariaLive" && origins.includes("dom") && id !== ANNOUNCER) add("P2: aria-live only in ui/announcer");
				if (name === "net" && origins.includes("electron")) add("U6: no network API");
				if (
					(isUi(id) || isTab(id) || id === "view") &&
					((name === "setInterval" && origins.some((o) => o === "dom" || o === "node" || o === "lib")) ||
						(name === "setRepeatingTimer" && origins.includes("timers")))
				)
					add("P3: repeating timer");
				if (isUi(id) && GEOMETRY.has(name) && origins.includes("dom") && !GEOMETRY_READERS.includes(id))
					add("P4: geometry reads only in the measuring components");
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	return out;
}

// --- The model of today's tree ------------------------------------------------

const graph = importGraph(await metafileInputs(["src/main.ts"]));
const config = ts.readConfigFile(path.join(ROOT, "tsconfig.json"), ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, ROOT);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const sources = walk(SRC).map((file) => program.getSourceFile(file));
const all = [...graphViolations(graph), ...symbolViolations(program)];
const format = (list) => list.map((v) => `${v.file}: ${v.rule} (${v.detail})`);

test("ADR-016: every src module with runtime statements is in the bundle's import graph", () => {
	const missing = sources.filter((source) => !typesOnly(source) && !graph.has(moduleId(source.fileName)));
	assert.deepEqual(missing.map((source) => moduleId(source.fileName)), []);
});

test("ADR-016 U1 to U7, DES-001 A1 to A9 and A11, DES-003 P1 to P5, DES-007 G1 and G2: no breach, no named exception", () => {
	assert.deepEqual(format(all), []);
});

test("DES-001 A11: runtime dependencies are the admitted ones", () => {
	const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
	const admitted = Object.entries(Object.assign({}, ...Object.values(ADMITTED))).sort();
	assert.deepEqual(Object.entries(pkg.dependencies ?? {}).sort(), admitted);
});

test("DES-001 A11: the two admitted font files are the bundle's only inputs outside src/", async () => {
	const inputs = Object.keys(await metafileInputs(["src/main.ts"]));
	assert.deepEqual(inputs.filter((file) => !file.startsWith("src/")).map(packageFile).sort(), [...ADMITTED_FILES].sort());
});

test("DES-001 A12: every module that does not import obsidian is built into the pretest bundle", async () => {
	const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
	const entries = pkg.scripts.pretest.split(/\s+/).filter((word) => /^src\/.+\.ts$/.test(word));
	const built = new Set(Object.keys(await metafileInputs(entries)).filter((f) => f.startsWith("src/")).map((file) => moduleId(file)));
	const missing = sources
		.filter((source) => !typesOnly(source) && !importsObsidian(source))
		.map((source) => moduleId(source.fileName))
		.filter((id) => !built.has(id));
	assert.deepEqual(missing, []);
});

test("DES-003 P6: every state module has tests/state-<name>.test.mjs", () => {
	const untested = [...graph.keys()]
		.filter(isState)
		.filter((id) => !existsSync(path.join(ROOT, "tests", `state-${id.slice("state/".length).replace(/\//g, "-")}.test.mjs`)));
	assert.deepEqual(untested, []);
});

test("ADR-016: the graph rules find each kind of breach", () => {
	const seeded = new Map([
		["main", new Set(["view", "usage-core"])],
		["view", new Set(["tab/chat-tab", "ui/shell", "ui/header", "ui/dom", "session"])],
		["tab/chat-tab", new Set(["obsidian"])],
		["ui/shell", new Set(["ui/dom", "history", "node:fs"])],
		["ui/header", new Set(["ui/dom"])],
		["ui/dom", new Set(["obsidian"])],
		["state/tab", new Set(["obsidian", "ui/dom", "models"])],
		["models", new Set(["state/tab", "electron", "main"])],
		["history", new Set(["obsidian"])],
		["usage-core", new Set(["settings-core", "timers", "protocol/client"])],
		["settings", new Set(["ui/header", "left-pad"])],
		["protocol/client", new Set(["node:child_process", "node:readline"])],
		["session", new Set(["protocol/client", "timers"])],
		["timers", new Set([])],
		["mcp/query", new Set(["mcp/paths"])],
		["mcp/paths", new Set([])],
		["bash", new Set(["node:https"])],
		["export", new Set(["tab/chat-tab", "usage-core"])],
		["fonts", new Set([ADMITTED_FILES[0], ADMITTED_FILES[1]])],
		["suggest", new Set([ADMITTED_FILES[0], "node_modules/left-pad/pad.woff2"])],
		["mystery", new Set([])],
	]);
	const found = graphViolations(seeded);
	const rules = new Set(found.map((v) => `${v.file}: ${v.rule}`));
	for (const expected of [
		"mystery: A3: has a layer",
		"models: A3: imports its own layer or lower",
		"models: A2: no obsidian or electron in layers 1 and 2",
		"models: U6: no network API",
		"models: A1: main is imported only as a type",
		"state/tab: U1: state imports nothing of the panel or Obsidian",
		"ui/shell: U2: ui imports only state, layer 1 and the listed widgets",
		"view: U3: imports session",
		"export: U3: only view imports tab/chat-tab",
		"bash: U6: no network API",
		"protocol/client: A5: protocol imports only protocol, timers, json and node:child_process",
		"session: A6: session imports only protocol",
		"mcp/query: A7: imports nothing",
		"ui/shell: A8: node:fs, node:os and node:path only in cli",
		"settings: A11: externals are Obsidian's modules and Node builtins",
		"suggest: A11: only fonts imports the admitted font files",
		"ui/header: P5: exactly one importer",
		"usage-core: G1: usage-core imports only settings-core and timers",
		"export: G2: only main imports usage-core",
	])
		assert.ok(rules.has(expected), expected);
	const cycle = found.find((v) => v.rule === "U7: no runtime import cycles");
	assert.ok(cycle && cycle.detail.includes("models") && cycle.detail.includes("state/tab"), "the models and state/tab cycle");
	assert.ok(!rules.has("ui/dom: P5: exactly one importer"), "ui/dom may have several importers");
	assert.ok(!rules.has("fonts: A11: only fonts imports the admitted font files"), "fonts imports the admitted files");
	assert.ok(!rules.has("main: G2: only main imports usage-core"), "main builds the usage service");
});

test("ADR-016: the symbol rules find each kind of breach, through a namespace import too", (t) => {
	const dir = mkdtempSync(path.join(os.tmpdir(), "ai-agent-panel-arch-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "junction");
	const files = {
		"src/state/bad.ts": "export const width = window.innerWidth;\n",
		"src/timers.ts": "export function setRepeatingTimer(callback: () => void, ms: number): number {\n\treturn ms;\n}\n",
		"src/tab/ticking.ts": 'import { setRepeatingTimer } from "../timers";\nexport const handle = setRepeatingTimer(() => undefined, 1000);\n',
		"src/ui/widget.ts": [
			'import { MarkdownRenderer, type DropdownComponent } from "obsidian";',
			"export type Picker = DropdownComponent;",
			"export function misuse(el: HTMLElement): void {",
			"\tel.getBoundingClientRect();",
			"\twindow.setInterval(() => undefined, 1000);",
			'\twindow.open("https://example.com");',
			'\tvoid navigator.clipboard.writeText("x");',
			'\tel.setAttribute("aria-live", "polite");',
			'\tel.ariaLive = "polite";',
			'\tvoid fetch("https://example.com");',
			"\tvoid MarkdownRenderer;",
			"}",
			"",
		].join("\n"),
		"src/ui/namespace.ts": [
			'import * as obsidian from "obsidian";',
			"export const renderer = obsidian.MarkdownRenderer;",
			"export class Bare extends obsidian.Modal {}",
			"declare const app: obsidian.App;",
			"export const prompt = new obsidian.Modal(app);",
			"",
		].join("\n"),
		"src/theme-scope.ts": "export function themeModal(modal: object): () => void {\n\treturn () => modal;\n}\n",
		"src/modals.ts": [
			'import { FuzzySuggestModal, Modal, type App } from "obsidian";',
			'import { themeModal } from "./theme-scope";',
			"export class Themed extends Modal {",
			"\tprivate detach: (() => void) | null = null;",
			"\tonOpen(): void {",
			"\t\tthis.detach = themeModal(this);",
			"\t}",
			"\tonClose(): void {",
			"\t\tthis.detach?.();",
			"\t}",
			"}",
			"export class Unthemed extends Modal {",
			"\tprivate detach: (() => void) | null = null;",
			"\tonOpen(): void {",
			"\t\tthis.detach = themeModal(this.contentEl);",
			"\t}",
			"\tonClose(): void {",
			"\t\tthis.detach?.();",
			"\t}",
			"}",
			"export class NeverDetached extends Modal {",
			"\tprivate detach: (() => void) | null = null;",
			"\tonOpen(): void {",
			"\t\tthis.detach = themeModal(this);",
			"\t}",
			"\tonClose(): void {}",
			"}",
			"export const Anonymous = class extends Modal {};",
			"export class NoOpen extends FuzzySuggestModal<string> {",
			"\tgetItems(): string[] {",
			"\t\treturn [];",
			"\t}",
			"\tgetItemText(item: string): string {",
			"\t\treturn item;",
			"\t}",
			"\tonChooseItem(): void {}",
			"}",
			"export class Inherits extends Themed {}",
			"export class Overrides extends Themed {",
			"\tonOpen(): void {}",
			"}",
			"export class CallsSuper extends Themed {",
			"\tonOpen(): void {",
			"\t\tsuper.onOpen();",
			"\t}",
			"\tonClose(): void {",
			"\t\tsuper.onClose();",
			"\t}",
			"}",
			"export class SkipsSuperClose extends Themed {",
			"\tonClose(): void {}",
			"}",
			"declare const app: App;",
			"export const raw = new Modal(app);",
			"export const themed = new Themed(app);",
			"",
		].join("\n"),
		// A geometry name that is not the DOM's: no read.
		"src/ui/quiet.ts": "const pane = { scrollTop: 0 };\nexport const top = pane.scrollTop;\n",
		"src/ui/popovers/rogue.ts": [
			'export const root = "ai-agent-panel-popover";',
			"export const card = (state: string): string => `ai-agent-panel-hover-card ${state}`;",
			"",
		].join("\n"),
		// A part of a popover, and the host itself: no breach.
		"src/ui/popovers/part.ts": 'export const label = "ai-agent-panel-popover-label";\n',
		"src/ui/popover-host.ts": 'export const root = ".ai-agent-panel-popover";\n',
		// The live region itself, and a name that only contains the attribute's: no breach.
		"src/ui/announcer.ts": 'export function live(el: HTMLElement): void {\n\tel.setAttribute("aria-live", "polite");\n\tel.ariaLive = "polite";\n}\n',
		"src/ui/quiet-live.ts": 'export const cls = "ai-agent-panel-aria-live-note";\n',
	};
	for (const [name, text] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
		writeFileSync(path.join(dir, name), text);
	}
	const fixture = ts.createProgram(
		Object.keys(files).map((name) => path.join(dir, name)),
		{ ...parsed.options, noEmit: true }
	);
	const found = symbolViolations(fixture, path.join(dir, "src"));
	const rules = new Set(found.map((v) => `${v.file}: ${v.rule}`));
	for (const expected of [
		"state/bad: U1: no DOM or Obsidian symbol in state",
		"tab/ticking: P3: repeating timer",
		"ui/widget: P3: repeating timer",
		"ui/widget: P4: geometry reads only in the measuring components",
		"ui/widget: U5: window.open",
		"ui/widget: U5: navigator.clipboard",
		"ui/widget: U5: MarkdownRenderer",
		"ui/widget: U5: no dropdown outside settings",
		"ui/widget: U6: no network API",
		"ui/namespace: U5: MarkdownRenderer",
		"ui/popovers/rogue: P1: popover and hover-card root classes only in their hosts",
	])
		assert.ok(rules.has(expected), expected);
	assert.ok(!rules.has("ui/quiet: P4: geometry reads only in the measuring components"), "a geometry name declared outside the DOM");
	assert.deepEqual(
		found
			.filter((v) => v.rule === "U5: every modal calls themeModal")
			.map((v) => `${v.file}: ${v.detail.replace(/, line \d+$/, "")}`)
			.sort(),
		[
			"modals: NeverDetached",
			"modals: NoOpen",
			"modals: Overrides",
			"modals: SkipsSuperClose",
			"modals: Unthemed",
			"modals: class",
			"modals: new Modal",
			"ui/namespace: Bare",
			"ui/namespace: new Modal",
		]
	);
	const p2 = found.filter((v) => v.rule.startsWith("P2:")).map((v) => v.file);
	assert.deepEqual(p2, ["ui/widget", "ui/widget"], "the attribute and the property, outside the announcer only");
	const p1 = found.filter((v) => v.rule.startsWith("P1:")).map((v) => `${v.file}, ${v.detail}`);
	assert.deepEqual(p1, ["ui/popovers/rogue, line 1", "ui/popovers/rogue, line 2"], "both root classes, and no part or host");
});
