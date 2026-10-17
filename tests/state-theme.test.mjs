import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModeClasses, Registrations, resolveMode, setModeClass } from "./.build/state/theme.mjs";
import { THEME_CHOICES, THEME_LABELS } from "./.build/settings-core.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

test("PRD-001.R34: Theme offers Auto, Light and Dark in Settings and as checkable items in the panel's menu", () => {
	assert.deepEqual(
		THEME_CHOICES.map((choice) => THEME_LABELS[choice]),
		["Auto", "Light", "Dark"]
	);
	const view = readFileSync(path.join(SRC, "view.ts"), "utf8");
	const menu = view.slice(view.indexOf("onPaneMenu(menu: Menu"), view.indexOf("async onOpen()"));
	assert.match(
		menu,
		/for \(const choice of THEME_CHOICES\)[\s\S]*?\.setSection\("view"\)[\s\S]*?\.setTitle\(`Theme: \$\{THEME_LABELS\[choice\]\}`\)[\s\S]*?\.setChecked\(settings\.theme === choice\)[\s\S]*?\.onClick\(\(\) => void this\.plugin\.setTheme\(choice\)\)/
	);
	const settings = readFileSync(path.join(SRC, "settings.ts"), "utf8");
	// The three cards: one radiogroup named by the row, each card a radio named by its name; a pick takes the menu's path.
	assert.match(settings, /drawRadioCards<ThemeChoice>\([\s\S]*?\(choice\) => void this\.plugin\.setTheme\(choice\)/);
	assert.doesNotMatch(settings, /addOptions\(THEME_LABELS\)/);
	assert.doesNotMatch(settings, /THEME_NOTES/);
});

test("PRD-001.R34: the Theme, Conversation tabs, Prompt style and Prompt color cards are one radiogroup of native radios sharing a name, so the arrow keys move the choice", () => {
	const settings = readFileSync(path.join(SRC, "settings.ts"), "utf8");
	const draw = settings.slice(settings.indexOf("function drawRadioCards"), settings.indexOf("function drawThemePreview"));
	assert.match(draw, /role: "radiogroup", "aria-labelledby": rowNameEl\.id/);
	assert.match(draw, /type: "radio",\s*name: `ai-agent-panel-style-\$\{draw\}`/);
	assert.match(draw, /"aria-labelledby": `\$\{id\}-name`/);
	assert.match(draw, /caption === undefined \? \{\} : \{ "aria-describedby"/);
	assert.equal(settings.match(/drawRadioCards</g)?.length, 5, "the function and its four rows, no second copy of the cards");
	assert.match(settings, /preview: \(el\) => drawThemePreview\(el, choice\)/);
	assert.match(settings, /preview: \(el\) => drawTabsPreview\(el, position\)/);
	// A preview draws its palette by its own mode class, never by the tab's.
	const preview = settings.slice(settings.indexOf("function drawThemePreview"), settings.indexOf("function drawThemeSample"));
	assert.match(preview, /MODE_CLASS\[choice\]/);
	assert.match(preview, /for \(const mode of \["dark", "light"\] as const\)/);
});

test("PRD-001.R34: Auto's caption follows Obsidian's mode while the tab is open, and the listener goes with the tab", () => {
	const settings = readFileSync(path.join(SRC, "settings.ts"), "utf8");
	assert.match(settings, /workspace\.on\("css-change", \(\) =>\s*caption\.setText\(themeCardCaption\("match", this\.plugin\.theme\.mode\("host"\) === "dark"\) \?\? ""\)/);
	assert.match(settings, /this\.scopes\.set\("autoCaption", \(\) => this\.app\.workspace\.offref\(ref\)\)/);
	const hide = settings.slice(settings.indexOf("hide(): void {"), settings.indexOf("private scoped("));
	assert.match(hide, /this\.scopes\.releaseAll\(\);/);
});

test("PRD-001.R34: resolveMode gives Light and Dark as set and Auto Obsidian's mode", () => {
	for (const hostDark of [false, true]) {
		assert.equal(resolveMode("light", hostDark), "light", `light, host dark ${hostDark}`);
		assert.equal(resolveMode("dark", hostDark), "dark", `dark, host dark ${hostDark}`);
	}
	assert.equal(resolveMode("match", false), "light");
	assert.equal(resolveMode("match", true), "dark");
});

/** A root with Obsidian's class helpers, recording every class change and style read. */
function fakeRoot(name, log) {
	const classes = new Set(["ai-agent-panel-scope"]);
	const props = new Map();
	return {
		name,
		classes,
		props,
		hasClass: (cls) => classes.has(cls),
		setCssProps: (values) => {
			for (const [prop, value] of Object.entries(values)) {
				if (value === "") props.delete(prop);
				else props.set(prop, value);
				log.push(`${name} css ${prop}=${value}`);
			}
		},
		style: { getPropertyValue: (prop) => props.get(prop) ?? "" },
		addClass: (...names) => {
			for (const cls of names) classes.add(cls);
			log.push(`${name} +${names.join(" +")}`);
		},
		removeClass: (...names) => {
			for (const cls of names) classes.delete(cls);
			log.push(`${name} -${names.join(" -")}`);
		},
		mode: () => (classes.has("is-dark") ? (classes.has("is-light") ? "both" : "dark") : classes.has("is-light") ? "light" : null),
	};
}

/** An event source shaped like Obsidian's workspace or the plugin's `Events`. */
function fakeEvents() {
	const listeners = new Map();
	return {
		on: (name, callback) => {
			const ref = { name, callback };
			listeners.set(ref, callback);
			return ref;
		},
		offref: (ref) => listeners.delete(ref),
		trigger: (name) => {
			for (const ref of [...listeners.keys()]) if (ref.name === name) ref.callback();
		},
		count: (name) => [...listeners.keys()].filter((ref) => ref.name === name).length,
	};
}

/**
 * The scope over a main window and a pop-out: two roots, the main body's
 * mode class, and a pop-out body that Obsidian syncs later.
 */
function setup({ setting = "match", mainDark = false } = {}) {
	const log = [];
	const main = { dark: mainDark };
	const popout = { dark: mainDark };
	const state = { setting };
	const prompt = { className: null, custom: null };
	const workspace = fakeEvents();
	const settingsEvents = fakeEvents();
	const scope = new ModeClasses({
		workspace,
		settingsEvents,
		setting: () => state.setting,
		hostDark: () => main.dark,
		prompt: () => ({ ...prompt }),
		flush: (root) => log.push(`${root.name} read`),
	});
	scope.load();
	const mainRoot = fakeRoot("main", log);
	const popoutRoot = fakeRoot("popout", log);
	scope.attach(mainRoot);
	scope.attach(popoutRoot);
	log.length = 0;
	return { log, main, popout, state, prompt, workspace, settingsEvents, scope, mainRoot, popoutRoot };
}

test("PRD-001.R34: attach classes a new root at once, inside the switch fence", () => {
	const { scope, log } = setup({ setting: "match", mainDark: true });
	const root = fakeRoot("new", log);
	scope.attach(root);
	assert.equal(root.mode(), "dark");
	assert.ok(!root.classes.has("is-switching-theme"), "the fence is removed");
	assert.deepEqual(log, ["new +is-switching-theme", "new -is-light -is-dark", "new +is-dark", "new read", "new -is-switching-theme"]);
});

test("PRD-001.R34: css-change reads the main body only, so a stale pop-out body leaves its root in the main mode", () => {
	const { main, popout, workspace, mainRoot, popoutRoot } = setup({ setting: "match", mainDark: false });
	assert.equal(mainRoot.mode(), "light");
	main.dark = true;
	popout.dark = false;
	workspace.trigger("css-change");
	assert.equal(mainRoot.mode(), "dark");
	assert.equal(popoutRoot.mode(), "dark");
	assert.notEqual(popoutRoot.mode(), popout.dark ? "dark" : "light", "the pop-out root does not take its stale body's mode");
	// theme-scope gives ModeClasses the main window's body, never the root's or the active one.
	const scope = readFileSync(path.join(SRC, "theme-scope.ts"), "utf8");
	const hostDark = scope.slice(scope.indexOf("function hostDark()"), scope.indexOf("export function themeModal"));
	assert.match(hostDark, /return window\.document\.body\.hasClass\("theme-dark"\);/);
	assert.doesNotMatch(scope, /activeDocument|activeWindow|\.doc\.body|ownerDocument/);
	assert.match(scope, /new ModeClasses<HTMLElement>\(\{[\s\S]*?\n\t\t\thostDark,\n/);
});

test("PRD-001.R34: a root that follows the host keeps Obsidian's mode under Light and Dark", () => {
	const { scope, state, settingsEvents, workspace, main, log } = setup({ setting: "match", mainDark: false });
	const settingsRoot = fakeRoot("settings", log);
	scope.attach(settingsRoot, "host");
	assert.equal(settingsRoot.mode(), "light");
	log.length = 0;
	for (const setting of ["dark", "light", "dark"]) {
		state.setting = setting;
		settingsEvents.trigger("settings");
	}
	assert.equal(settingsRoot.mode(), "light");
	assert.deepEqual(log.filter((line) => line.startsWith("settings ")), [], "Light and Dark write nothing to it");
	main.dark = true;
	workspace.trigger("css-change");
	assert.equal(settingsRoot.mode(), "dark", "it follows Obsidian's mode");
	const settings = readFileSync(path.join(SRC, "settings.ts"), "utf8");
	assert.deepEqual(settings.match(/theme\.attach\([^)]*\)/g), ['theme.attach(el, "host")'], "every settings scope follows the host");
});

test("PRD-001.R34: definitions fetched once, then hide, a mode change and a re-render: the card roots drawn by the re-render follow the new mode", () => {
	const settings = readFileSync(path.join(SRC, "settings.ts"), "utf8");
	// The roots are attached as each row renders, never when the definitions are fetched.
	const definitions = settings.slice(settings.indexOf("getSettingDefinitions()"), settings.indexOf("hide(): void {"));
	assert.doesNotMatch(definitions, /attach\(|scoped\(/);
	assert.equal(settings.match(/this\.scoped\("(?:theme|promptStyle|promptColor)", cards\)/g)?.length, 3);

	const { scope, workspace, main, log } = setup({ setting: "light", mainDark: false });
	const rows = new Registrations();
	const render = (name) => {
		// What a row's render closure does (Obsidian re-runs it each time the tab opens).
		const cards = fakeRoot(name, log);
		rows.set("promptStyle", scope.attach(cards, "host"));
		return cards;
	};
	const first = render("cards 1");
	assert.equal(first.mode(), "light");
	rows.releaseAll(); // hide()
	main.dark = true;
	workspace.trigger("css-change"); // Obsidian's mode changes while the tab is closed
	const second = render("cards 2"); // the stored row renders again
	assert.equal(second.mode(), "dark", "a new root takes Obsidian's mode as it is now");
	main.dark = false;
	workspace.trigger("css-change");
	assert.equal(second.mode(), "light", "and follows it while open");
	assert.equal(first.mode(), "light", "the released root is left alone");
});

test("PRD-001.R34: a second load adds no listeners", () => {
	const { scope, workspace, settingsEvents } = setup();
	scope.load();
	assert.equal(workspace.count("css-change"), 1);
	assert.equal(settingsEvents.count("settings"), 1);
	scope.unload();
	assert.equal(workspace.count("css-change"), 0);
	assert.equal(settingsEvents.count("settings"), 0);
});

test("PRD-001.R34: a root attached twice stays classed until both owners detach", () => {
	const { scope, state, settingsEvents, log } = setup({ setting: "light" });
	const root = fakeRoot("shared", log);
	const first = scope.attach(root);
	const second = scope.attach(root);
	first();
	first();
	state.setting = "dark";
	settingsEvents.trigger("settings");
	assert.equal(root.mode(), "dark", "one owner's detach, even twice, leaves the other's registration");
	second();
	state.setting = "light";
	settingsEvents.trigger("settings");
	assert.equal(root.mode(), "dark", "released once both detached");
});

test("PRD-001.R34: a detach from before unload does not release a later attach", () => {
	const { scope, state, settingsEvents, log } = setup({ setting: "light" });
	const root = fakeRoot("modal", log);
	const stale = scope.attach(root);
	scope.unload();
	scope.load();
	scope.attach(root);
	stale();
	state.setting = "dark";
	settingsEvents.trigger("settings");
	assert.equal(root.mode(), "dark");
});

test("PRD-001.R34: a settings row redrawn releases the root it drew before, and a full redraw or closing the tab releases all", () => {
	const released = [];
	const rows = new Registrations();
	rows.set("promptStyle", () => released.push("cards 1"));
	rows.set("launchArgs:a", () => released.push("args a"));
	rows.set("promptStyle", () => released.push("cards 2"));
	assert.deepEqual(released, ["cards 1"]);
	assert.equal(rows.size, 2);
	rows.releaseAll();
	assert.deepEqual(released, ["cards 1", "cards 2", "args a"]);
	assert.equal(rows.size, 0);
	const settings = readFileSync(path.join(SRC, "settings.ts"), "utf8");
	const legacy = settings.slice(settings.indexOf("private renderLegacy(): void {"), settings.indexOf("private definitionFor("));
	assert.match(legacy, /this\.scopes\.releaseAll\(\);\s*containerEl\.empty\(\);/);
	const rerender = settings.slice(settings.indexOf("private rerender(): void {"), settings.indexOf("private refreshVisibility(): void {"));
	// update() keeps the rows it does not rebuild, and their roots must keep following Obsidian; a row it rebuilds releases its own.
	assert.doesNotMatch(rerender, /releaseAll/);
	const hide = settings.slice(settings.indexOf("hide(): void {"), settings.indexOf("private scoped("));
	assert.match(hide, /this\.scopes\.releaseAll\(\);/);
});

test("PRD-001.R34: the scope loads before any view, command or settings tab, and a modal without one takes Obsidian's mode", () => {
	const main = readFileSync(path.join(SRC, "main.ts"), "utf8");
	const scope = main.indexOf("this.theme = this.addChild(new ThemeScope(");
	assert.ok(scope > 0);
	for (const first of ["this.registerView(", "this.addCommand(", "this.addSettingTab(", "this.addRibbonIcon("]) {
		const at = main.indexOf(first);
		assert.ok(at === -1 || at > scope, `${first} comes after the scope`);
	}
	const themeScope = readFileSync(path.join(SRC, "theme-scope.ts"), "utf8");
	const modal = themeScope.slice(themeScope.indexOf("export function themeModal"), themeScope.indexOf("export class ThemeScope"));
	assert.match(modal, /if \(loaded\.scope\) return loaded\.scope\.attach\(modal\.modalEl\);\s*setModeClass\(modal\.modalEl, resolveMode\("match", hostDark\(\)\)\);/);
});

test("PRD-001.R34: a retained modal reopened without a scope after Obsidian changes mode keeps only the new mode class", () => {
	const log = [];
	const modal = fakeRoot("modal", log);
	setModeClass(modal, resolveMode("match", false));
	setModeClass(modal, resolveMode("match", true));
	assert.equal(modal.mode(), "dark");
	assert.deepEqual([...modal.classes].sort(), ["ai-agent-panel-scope", "is-dark"]);
	setModeClass(modal, "light");
	assert.equal(modal.mode(), "light");
});

test("PRD-001.R34: the settings event switching Auto, Light, Dark, Auto re-classes every root in both windows", () => {
	const { state, settingsEvents, mainRoot, popoutRoot } = setup({ setting: "match", mainDark: true });
	const modes = [];
	for (const setting of ["light", "dark", "match"]) {
		state.setting = setting;
		settingsEvents.trigger("settings");
		modes.push([mainRoot.mode(), popoutRoot.mode()]);
	}
	assert.deepEqual(modes, [
		["light", "light"],
		["dark", "dark"],
		["dark", "dark"],
	]);
});

test("PRD-001.R34: an event that leaves a root's mode as it is writes nothing", () => {
	const { log, state, settingsEvents, workspace } = setup({ setting: "light", mainDark: true });
	workspace.trigger("css-change");
	state.setting = "match";
	settingsEvents.trigger("settings");
	const written = log.length;
	state.setting = "dark";
	settingsEvents.trigger("settings");
	assert.ok(written > 0, "Auto under a dark host switches the light roots");
	assert.equal(log.length, written, "Dark under a dark host is already in place");
});

test("PRD-001.R34: a detached root is no longer classed", () => {
	const { scope, state, settingsEvents, log } = setup({ setting: "light" });
	const root = fakeRoot("modal", log);
	const detach = scope.attach(root);
	detach();
	state.setting = "dark";
	settingsEvents.trigger("settings");
	assert.equal(root.mode(), "light", "keeps its last class until it is removed with its element");
});

test("PRD-001.R34: unload detaches both listeners", () => {
	const { scope, workspace, settingsEvents, state, mainRoot } = setup({ setting: "light" });
	assert.equal(workspace.count("css-change"), 1);
	assert.equal(settingsEvents.count("settings"), 1);
	scope.unload();
	assert.equal(workspace.count("css-change"), 0);
	assert.equal(settingsEvents.count("settings"), 0);
	state.setting = "dark";
	settingsEvents.trigger("settings");
	assert.equal(mainRoot.mode(), "light");
});

const SAGE = { className: "mod-prompt-color-sage", custom: null };
const ROSE = { className: "mod-prompt-color-rose", custom: null };

test("PRD-001.R33: attach classes a root with the prompt color in effect, inside the same fence, and Mist adds no class", () => {
	const { scope, prompt, log } = setup({ setting: "match", mainDark: true });
	Object.assign(prompt, SAGE);
	const root = fakeRoot("new", log);
	scope.attach(root);
	assert.ok(root.classes.has("mod-prompt-color-sage"));
	assert.deepEqual(log, [
		"new +is-switching-theme",
		"new -is-light -is-dark",
		"new +is-dark",
		"new +mod-prompt-color-sage",
		"new read",
		"new -is-switching-theme",
	]);
	const mist = fakeRoot("mist", log);
	Object.assign(prompt, { className: null, custom: null });
	log.length = 0;
	scope.attach(mist);
	assert.ok(![...mist.classes].some((cls) => cls.startsWith("mod-prompt-color-")));
	assert.ok(!log.some((line) => line.includes("mod-prompt-color")), "no class write for Mist");
});

test("PRD-001.R33: the settings event re-applies the prompt color to every root though the mode is unchanged", () => {
	const { prompt, settingsEvents, mainRoot, popoutRoot, log } = setup({ setting: "dark" });
	Object.assign(prompt, SAGE);
	settingsEvents.trigger("settings");
	for (const root of [mainRoot, popoutRoot]) assert.ok(root.classes.has("mod-prompt-color-sage"), root.name);
	assert.deepEqual(log.filter((line) => line.startsWith("main ")), ["main +is-switching-theme", "main +mod-prompt-color-sage", "main read", "main -is-switching-theme"], "no mode write, one fence");
	log.length = 0;
	Object.assign(prompt, ROSE);
	settingsEvents.trigger("settings");
	assert.deepEqual([...mainRoot.classes].filter((cls) => cls.startsWith("mod-prompt-color-")), ["mod-prompt-color-rose"], "one prompt class at a time");
	assert.deepEqual(log.filter((line) => line.startsWith("main ")), ["main +is-switching-theme", "main -mod-prompt-color-sage", "main +mod-prompt-color-rose", "main read", "main -is-switching-theme"]);
	Object.assign(prompt, { className: null, custom: null });
	settingsEvents.trigger("settings");
	assert.ok(![...mainRoot.classes].some((cls) => cls.startsWith("mod-prompt-color-")), "back to Mist");
});

test("PRD-001.R33: an event that leaves the prompt color and the mode as they are writes nothing", () => {
	const { prompt, settingsEvents, workspace, log } = setup({ setting: "light" });
	Object.assign(prompt, { className: "mod-prompt-color-custom", custom: "#4d91b3" });
	settingsEvents.trigger("settings");
	log.length = 0;
	settingsEvents.trigger("settings");
	workspace.trigger("css-change");
	assert.deepEqual(log, []);
});

test("PRD-001.R33, ADR-017: the Custom property is set whichever color is picked, replaced on a change and cleared with none", () => {
	const { prompt, settingsEvents, mainRoot, popoutRoot } = setup({ setting: "light" });
	Object.assign(prompt, { className: "mod-prompt-color-sage", custom: "#4d91b3" });
	settingsEvents.trigger("settings");
	for (const root of [mainRoot, popoutRoot]) assert.equal(root.props.get("--ai-agent-panel-prompt-custom"), "#4d91b3", root.name);
	Object.assign(prompt, { className: "mod-prompt-color-custom", custom: "rgb(1, 2, 3)" });
	settingsEvents.trigger("settings");
	assert.equal(mainRoot.props.get("--ai-agent-panel-prompt-custom"), "rgb(1, 2, 3)");
	assert.ok(mainRoot.classes.has("mod-prompt-color-custom") && !mainRoot.classes.has("mod-prompt-color-sage"));
	Object.assign(prompt, { className: null, custom: null });
	settingsEvents.trigger("settings");
	assert.equal(mainRoot.props.size, 0, "cleared");
	assert.ok(!mainRoot.classes.has("mod-prompt-color-custom"));
});

test("PRD-001.R33: a root attached again takes the prompt color as it is now, whatever classes and property it kept", () => {
	const { scope, prompt, settingsEvents, log } = setup({ setting: "light" });
	Object.assign(prompt, { className: "mod-prompt-color-custom", custom: "#4d91b3" });
	const root = fakeRoot("released", log);
	const detach = scope.attach(root);
	detach();
	Object.assign(prompt, ROSE);
	settingsEvents.trigger("settings");
	assert.ok(root.classes.has("mod-prompt-color-custom"), "a released root is left alone");
	scope.attach(root);
	assert.deepEqual([...root.classes].filter((cls) => cls.startsWith("mod-prompt-color-")), ["mod-prompt-color-rose"]);
	assert.equal(root.props.size, 0, "the stale property is cleared");
});

test("PRD-001.R33: a second attach of a root in the same mode applies a changed prompt color", () => {
	const { scope, prompt, log } = setup({ setting: "light" });
	const root = fakeRoot("shared", log);
	scope.attach(root);
	Object.assign(prompt, SAGE);
	scope.attach(root);
	assert.ok(root.classes.has("mod-prompt-color-sage"));
});

test("PRD-001.R33, ADR-017: the scope gives ModeClasses the whitelisted selection, and CSS decides what a Custom color is", () => {
	const scope = readFileSync(path.join(SRC, "theme-scope.ts"), "utf8");
	assert.match(scope, /promptSelection\(settings\(\)\.promptColor, settings\(\)\.promptCustomColor, supportsColor\)/);
	assert.match(scope, /function supportsColor\(value: string\): boolean \{\s*return CSS\.supports\("color", value\);\s*\}/);
	const main = readFileSync(path.join(SRC, "main.ts"), "utf8");
	assert.match(main, /new ThemeScope\(this\.app, this\.events, \(\) => this\.settings\)/);
	// A migration persists at the device's next save (DES-005); the load's one save is the 0.5.0 upgrade's (PRD-001.R24).
	const load = main.slice(main.indexOf("async loadSettings()"), main.indexOf("async saveSettings()"));
	const upgrade = /if \(isUpgradeShape\(local\)\) \{[\s\S]*?\n\t\t\}\n/;
	assert.ok(load.length > 0 && upgrade.test(load), "loadSettings saves after an upgrade");
	assert.ok(!load.replace(upgrade, "").includes("saveSettings"), "loadSettings saves only after an upgrade");
	// The only way a stored value reaches the DOM: one custom property of the roots, never markup, a selector or a stylesheet.
	const sources = ["theme-scope.ts", "state/theme.ts", "state/prompt-color.ts"].map((file) => readFileSync(path.join(SRC, file), "utf8")).join("\n");
	assert.doesNotMatch(sources, /innerHTML|outerHTML|insertAdjacentHTML|createEl\("style"|cssText|setAttribute\("style"/);
	assert.equal(sources.match(/\.setCssProps\(/g)?.length, 1, "one writer of the property");
});
