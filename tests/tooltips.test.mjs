/**
 * Tooltips only on icon-only controls and where a requirement asks for one
 * (PRD-001.R32, DES-003 Popovers, hover cards and tooltips): Obsidian shows
 * a text tooltip for every element with an `aria-label`, and `setTooltip`
 * sets one. So every `aria-label`, `ariaLabel` and `setTooltip` or
 * `writeTooltip` call in `src/` is one of the sites below, and a control
 * that is icon-only only at some sizes suppresses its tooltip with
 * `--no-tooltip` in `styles.css` while its text shows.
 *
 * Counts are per file and kind, so removing one site while adding another
 * of the same kind in the same file passes unnoticed; review the file's
 * sites when its count stays the same.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

const TOOLTIP_CALLS = new Set(["setTooltip", "writeTooltip"]);

/**
 * Each file's allowed sites, by kind and count. Every one is an icon-only
 * control or a graphic without text, unless its comment names the
 * requirement that asks for a tooltip on visible text.
 */
const ALLOWED = {
	// The icon-only helpers: `writeMark`'s image and its removal, `writeGlyph`'s tooltip and its removal,
	// `writeTooltip`'s `setTooltip`, `iconButton`, `drawOpenRow`'s close button; an image thumbnail,
	// a graphic without text: "View <name>" (PRD-001.R14).
	"src/ui/dom.ts": { "aria-label": 3, tooltip: 5 },
	// A compaction divider's rule, named "Compacted at 14:20, 131k to 18k tokens" (PRD-001.R28, R37).
	"src/ui/event-divider.ts": { "aria-label": 1 },
	// The delete button, a trash icon in the history modal (layer 3: no `ui/dom`).
	"src/history.ts": { "aria-label": 1 },
	// Not a label: the attributes the sanitizer keeps on rendered Markdown.
	"src/inert-markdown.ts": { "aria-label": 1 },
	// Obsidian's extra buttons: the sync badge's cloud, a row's reset; "Reset all…", only while its
	// label hides (`--no-tooltip`); the icon-only color picker's label.
	"src/settings.ts": { "aria-label": 1, tooltip: 3 },
	// A report's icon buttons, and its status dot, an image (layer 3: no `ui/dom`); "/compact now"'s cost note (PRD-005.R11).
	"src/report-view.ts": { "aria-label": 1, tooltip: 2 },
	// A tab's close button, an x.
	"src/ui/tab-strip.ts": { tooltip: 1 },
	// A row's pin button (its close button's is `drawOpenRow`'s).
	"src/ui/conversation-column.ts": { tooltip: 1 },
	// A background task's Stop, a square.
	"src/ui/run-bar.ts": { tooltip: 1 },
	// The copy button: its label, "Copied", its label again.
	"src/ui/copy.ts": { tooltip: 3 },
	// A rail tick (PRD-001.R33).
	"src/ui/jump-rail.ts": { tooltip: 1 },
	// Send's changing label, and an attached item's remove button, an x.
	"src/ui/composer.ts": { tooltip: 2 },
	// The context bar and the prompt cache bar, images; Compact's cost note (PRD-005.R11), which "Show tooltips" off hides.
	"src/ui/popovers/context.ts": { "aria-label": 2, tooltip: 1 },
	// Every menu segment: the model's full id (PRD-001.R22) and the mode's hover text (PRD-002.R8), which
	// "Show tooltips" off hides; effort's and profile's also only while icon-only (`--no-tooltip`).
	"src/ui/status-line.ts": { tooltip: 1 },
	// Restore files and Branch: their label, only while it hides below 360 px (`--no-tooltip`).
	"src/ui/turn.ts": { tooltip: 1 },
	// Transcript: its label, only while it hides in the header row (`--no-tooltip`).
	"src/ui/changes-bar.ts": { tooltip: 1 },
	// Visible text: "Restore to before turn N"'s title (PRD-002.R18).
	"src/ui/popovers/changed-files.ts": { tooltip: 1 },
};

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith(".ts") ? [path.join(dir, entry.name)] : []
	);
}

/** The name a call goes to: `f(…)` and `x.f(…)` alike. */
function calleeName(call) {
	const callee = call.expression;
	if (ts.isIdentifier(callee)) return callee.text;
	if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
	return null;
}

/** Every `aria-label` (a string, an attribute key, `ariaLabel`) and tooltip call in one source, as { kind, line }. */
export function labelSites(fileName, text) {
	const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
	const sites = [];
	const add = (kind, node) => sites.push({ kind, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
	const visit = (node) => {
		if (ts.isStringLiteralLike(node) && node.text === "aria-label") add("aria-label", node);
		else if (ts.isPropertyAccessExpression(node) && node.name.text === "ariaLabel") add("aria-label", node);
		else if (ts.isCallExpression(node) && TOOLTIP_CALLS.has(calleeName(node))) add("tooltip", node);
		ts.forEachChild(node, visit);
	};
	visit(source);
	return sites;
}

/** Each file's sites, counted by kind, with their lines for the failure message. */
function scanSrc() {
	const counts = {};
	const lines = [];
	for (const file of walk(SRC)) {
		const rel = path.relative(ROOT, file).replace(/\\/g, "/");
		for (const site of labelSites(rel, readFileSync(file, "utf8"))) {
			counts[rel] ??= {};
			counts[rel][site.kind] = (counts[rel][site.kind] ?? 0) + 1;
			lines.push(`${rel}:${site.line} ${site.kind}`);
		}
	}
	return { counts, lines };
}

test("PRD-001.R32, R28: only icon-only controls, graphics and the tooltips a requirement names carry an aria-label or a tooltip", () => {
	const { counts, lines } = scanSrc();
	assert.deepEqual(
		counts,
		ALLOWED,
		`Name an element that is not icon-only with a <label>, aria-labelledby or its content (DES-003); sites found:\n${lines.join("\n")}`
	);
});

/** What a rule that lets a tooltip show resets `--no-tooltip` to: the panel's token, which "Show tooltips" sets. */
const TOKEN = "var(--ai-agent-panel-no-tooltip)";

/**
 * The tooltips that show only while their control is icon-only, and the rules that let them show then
 * (to the token, so "Show tooltips" off wins); the scope's own rule, which reads the token, and with it
 * the model and permission segments, whose content tooltips (PRD-001.R22, PRD-002.R8) inherit it; and
 * the tooltips a requirement asks for as content, which show whatever "Show tooltips" says while the
 * control shows its label (a rail tick has none, and always shows).
 */
const NO_TOOLTIP = {
	".ai-agent-panel-scope": TOKEN,
	".ai-agent-panel-text-button.mod-restore-before": "false",
	".ai-agent-panel-rail-tick": "false",
	// A step mark is an image named for screen readers, not a control.
	".ai-agent-panel-step-mark": "true",
	".ai-agent-panel-changes-transcript": "true",
	".ai-agent-panel.is-column .ai-agent-panel-changes-transcript": TOKEN,
	".ai-agent-panel .ai-agent-panel-changes-transcript": TOKEN,
	".ai-agent-panel-turn-action": "true",
	".ai-agent-panel-turn-footer .ai-agent-panel-turn-action": TOKEN,
	".ai-agent-panel-status-segment:is(.mod-effort, .mod-profile)": "true",
	".ai-agent-panel-status-line:is(.is-fit-1, .is-fit-2, .is-fit-3, .is-fit-4, .is-fit-5) .ai-agent-panel-status-segment.mod-profile":
		TOKEN,
	".ai-agent-panel-status-line:is(.is-fit-2, .is-fit-3, .is-fit-4, .is-fit-5) .ai-agent-panel-status-segment.mod-effort":
		TOKEN,
	".ai-agent-panel-status-line .ai-agent-panel-status-segment:is(.mod-profile, .mod-effort)": TOKEN,
	".ai-agent-panel-settings-reset-all": "true",
	".ai-agent-panel-settings-tab .ai-agent-panel-settings-reset-all": TOKEN,
	// A tab's ×, under a stacked group's header that sets `--no-tooltip: true` (ADR-017 Tabs).
	".ai-agent-panel-board .workspace-tab-header-inner-close-button": TOKEN,
};

/** Every `--no-tooltip` declaration in a stylesheet, as { selector: value }. */
export function noTooltipRules(css) {
	const found = {};
	const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, "");
	for (const [, prelude, body] of uncommented.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
		const value = /--no-tooltip\s*:\s*([^;]+);/.exec(body)?.[1].trim();
		if (value === undefined) continue;
		for (const selector of prelude.split(/,(?![^(]*\))/)) found[selector.trim().replace(/\s+/g, " ")] = value;
	}
	return found;
}

test("PRD-001.R32: a tooltip on a label shows only while the label hides", () => {
	assert.deepEqual(noTooltipRules(readFileSync(path.join(ROOT, "styles.css"), "utf8")), NO_TOOLTIP);
});

test("PRD-001.R32: the stylesheet scan splits selector lists, reads container rules and skips comments", () => {
	const css = [
		"/* .x { --no-tooltip: true; } */",
		"@container q (max-width: 1px) {",
		"\t.a:is(.b, .c),",
		"\t.d .e { color: red; --no-tooltip: initial; }",
		"}",
		".f { --no-tooltip: true; }",
		".g { color: red; }",
	].join("\n");
	assert.deepEqual(noTooltipRules(css), { ".a:is(.b, .c)": "initial", ".d .e": "initial", ".f": "true" });
});

test("PRD-001.R32: the scan finds a planted aria-label, ariaLabel and tooltip calls, and not aria-labelledby", () => {
	const planted = [
		'const a = parent.createDiv({ attr: { role: "region", "aria-label": "Messages" } });',
		'a.setAttribute("aria-label", "Messages");',
		"a.ariaLabel = 'Messages';",
		'setTooltip(a, "Messages");',
		'writeTooltip(a, "Messages", "left");',
		'btn.setIcon("trash").setTooltip("Remove");',
		'const b = parent.createDiv({ attr: { "aria-labelledby": "x", "aria-describedby": "y" } });',
		"// a comment naming aria-label and setTooltip(a) is no site",
	].join("\n");
	assert.deepEqual(labelSites("planted.ts", planted), [
		{ kind: "aria-label", line: 1 },
		{ kind: "aria-label", line: 2 },
		{ kind: "aria-label", line: 3 },
		{ kind: "tooltip", line: 4 },
		{ kind: "tooltip", line: 5 },
		{ kind: "tooltip", line: 6 },
	]);
});

/** The `--ai-agent-panel-no-tooltip` declarations in a stylesheet, as { selector: value }. */
export function noTooltipTokens(css) {
	const found = {};
	const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, "");
	for (const [, prelude, body] of uncommented.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
		const value = /(?<![\w-])--ai-agent-panel-no-tooltip\s*:\s*([^;]+);/.exec(body)?.[1].trim();
		if (value !== undefined) found[prelude.trim().replace(/\s+/g, " ")] = value;
	}
	return found;
}

test("PRD-001.R32: the no-tooltip token is false on the scope and true on a scope with Show tooltips off", () => {
	assert.deepEqual(noTooltipTokens(readFileSync(path.join(ROOT, "styles.css"), "utf8")), {
		".ai-agent-panel-scope": "false",
		".ai-agent-panel-scope.mod-no-tooltips": "true",
	});
});

test("PRD-001.R32: the token scan reads a declaration and not the --no-tooltip it feeds", () => {
	const css = ".s { --ai-agent-panel-no-tooltip: false; --no-tooltip: var(--ai-agent-panel-no-tooltip); }\n.t .u { color: red; }";
	assert.deepEqual(noTooltipTokens(css), { ".s": "false" });
	assert.deepEqual(noTooltipRules(css), { ".s": TOKEN });
});

test("PRD-001.R32: the panel's menu offers a checkable Show tooltips, and Settings > Appearance a toggle after Theme", () => {
	const view = readFileSync(path.join(SRC, "view.ts"), "utf8");
	assert.match(view, /onPaneMenu\(menu: Menu, source: string\)[\s\S]*?\.setTitle\("Show tooltips"\)[\s\S]*?\.setChecked\(settings\.showTooltips\)/);
	const settings = readFileSync(path.join(SRC, "settings.ts"), "utf8");
	const appearance = settings.slice(settings.indexOf("private appearanceRows"), settings.indexOf("private usageRows"));
	assert.ok(appearance.indexOf('name: "Theme"') >= 0 && appearance.indexOf('name: "Theme"') < appearance.indexOf('name: "Show tooltips"'));
});
