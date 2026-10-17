import {
	AbstractInputSuggest,
	App,
	debounce,
	Notice,
	PluginSettingTab,
	requireApiVersion,
	setIcon,
	setTooltip,
	Setting,
	TFolder,
	type ExtraButtonComponent,
	type SettingDefinitionItem,
	type SettingGroupItem,
} from "obsidian";
import { detectClaudeCli } from "./cli";
import { ResetModal } from "./confirm-modal";
import { profileLaunchArgs, sandboxAvailable } from "./cli-args";
import { drawIcon } from "./icon";
import { effortLabel, effortLevels } from "./models";
import {
	DEFAULT_MODE_CHOICES,
	DEFAULT_MODE_LABELS,
	defaultProfile,
	formatDurationSeconds,
	MIN_USAGE_REFRESH_SECONDS,
	newProfile,
	newProfileId,
	parseDurationSeconds,
	profileLabel,
	PROMPT_COLOR_LABELS,
	PROMPT_COLORS,
	PROMPT_STYLE_CARDS,
	PROMPT_STYLES,
	promptLayout,
	TAB_POSITION_CARDS,
	TAB_POSITIONS,
	THEME_LABELS,
	THEME_CHOICES,
	themeCardCaption,
	validDefaultPermissionMode,
	type CliProfile,
	type LaunchToggle,
	type PromptColor,
	type PromptStyle,
	type TabPosition,
	type ThemeChoice,
} from "./settings-core";
import type AgentPanelPlugin from "./main";
import { acceptCustomColor, customColorMessage, customColorProblem, pickerHex } from "./state/prompt-color";
import { bannerText, noticeText } from "./state/cli-missing";
import { currentSection, jumpTarget, stuckBarBottom } from "./state/section-spy";
import { filterLine, filterPage, matchRanges, type FilterRow, type PageView } from "./state/settings-filter";
import { rowFacts, supportLinks, type RowSettings } from "./state/settings-rows";
import {
	applyPatches,
	failureNotice,
	planReset,
	resetCounts,
	resetNotice,
	startUndo,
	undoneNotice,
	undoReset,
	type PlanRow,
	type ResetOptions,
	type ResetPlan,
	type ResetScope,
	type UndoRecord,
} from "./state/settings-reset";
import { supportsColor } from "./theme-scope";
import { MODE_CLASS, Registrations } from "./state/theme";

export {
	DEFAULT_SETTINGS,
	MENU_MODES,
	SYNC_UNITS,
	allowAfterRead,
	allowResult,
	cliPermissionMode,
	defaultProfile,
	keptProfileNotice,
	permissionDecision,
	profilePick,
	reopenMode,
	reopenPicks,
	validDefaultPermissionMode,
	profileById,
	profileLabel,
	settingsFromStores,
	isUpgradeShape,
	writeStores,
	settingsLaunchOptions,
	splitSettings,
	type AgentPanelSettings,
	type ChatPermissionMode,
	type CliProfile,
	type MenuMode,
	type TabPosition,
} from "./settings-core";

/** One radio card: its choice, name, optional caption, and how it draws its decorative preview. */
interface RadioCard<T extends string> {
	value: T;
	name: string;
	caption?: string;
	preview: (el: HTMLElement) => void;
}

/** Gives each drawn set of cards its own radio group name and element ids. */
let styleCardsDrawn = 0;

/** Classes a row's build adds to its `settingEl`; cleared before each render so a redraw starts bare. */
const ROW_CLASSES = [
	"ai-agent-panel-settings-sub",
	"ai-agent-panel-settings-cards",
	"ai-agent-panel-settings-colors",
	"ai-agent-panel-settings-stack",
	"ai-agent-panel-settings-section",
	"ai-agent-panel-settings-bar-row",
	"mod-first",
	"is-filtered",
	"is-modified",
];

/**
 * Radio cards in `parent` (the "Theme", "Conversation tabs", "Prompt style" and "Prompt color" rows): a mini preview
 * over the name and its caption, in `cards` order. The previews are decoration;
 * a card is named by its name and described by its caption, and the group by the
 * row's name element, `rowNameEl`. The radios share one name, so the arrow keys
 * move the choice. `refocus` puts focus on the checked radio, for a redraw that
 * dropped it. Returns the group, a scope root for the caller to attach.
 */
function drawRadioCards<T extends string>(
	parent: HTMLElement,
	rowNameEl: HTMLElement,
	cards: RadioCard<T>[],
	current: T,
	refocus: boolean,
	onPick: (value: T) => void | Promise<void>
): HTMLElement {
	const draw = ++styleCardsDrawn;
	rowNameEl.id = `ai-agent-panel-style-${draw}-row`;
	// Its own token scope (ADR-017 Tokens): the page keeps Obsidian's colors, the cards draw the panel's.
	const group = parent.createDiv({
		cls: "ai-agent-panel-scope ai-agent-panel-style-cards ai-agent-panel-row-extra",
		attr: { role: "radiogroup", "aria-labelledby": rowNameEl.id },
	});
	const labels: HTMLElement[] = [];
	for (const { value, name, caption, preview } of cards) {
		const id = `ai-agent-panel-style-${draw}-${value}`;
		const label = group.createEl("label", { cls: "ai-agent-panel-style-card" });
		label.toggleClass("is-selected", value === current);
		labels.push(label);
		preview(label.createDiv({ cls: "ai-agent-panel-style-preview", attr: { "aria-hidden": "true" } }));
		const pick = label.createDiv({ cls: "ai-agent-panel-style-pick" });
		const input = pick.createEl("input", {
			attr: {
				type: "radio",
				name: `ai-agent-panel-style-${draw}`,
				"aria-labelledby": `${id}-name`,
				...(caption === undefined ? {} : { "aria-describedby": `${id}-caption` }),
			},
		});
		input.checked = value === current;
		if (refocus && value === current) input.focus();
		const text = pick.createDiv({ cls: "ai-agent-panel-style-text" });
		text.createSpan({ cls: "ai-agent-panel-style-name", text: name, attr: { id: `${id}-name` } });
		if (caption !== undefined) text.createSpan({ cls: "ai-agent-panel-style-caption", text: caption, attr: { id: `${id}-caption` } });
		input.addEventListener("change", () => {
			for (const other of labels) other.toggleClass("is-selected", other === label);
			void onPick(value);
		});
	}
	return group;
}

/** The "Theme" cards' previews: a mini transcript in the palette's own mode, and Auto's split of both. */
function drawThemePreview(preview: HTMLElement, choice: ThemeChoice): void {
	preview.addClass("mod-theme");
	if (choice !== "match") {
		preview.addClass("ai-agent-panel-scope", MODE_CLASS[choice]);
		drawThemeSample(preview);
		return;
	}
	preview.addClass("mod-split");
	for (const mode of ["dark", "light"] as const) {
		drawThemeSample(preview.createDiv({ cls: `ai-agent-panel-scope ai-agent-panel-theme-half ${MODE_CLASS[mode]}` }));
	}
}

/** A prompt, three reply lines and the composer, drawn in whatever palette the element carries. */
function drawThemeSample(el: HTMLElement): void {
	el.createDiv({ cls: "ai-agent-panel-style-bubble" });
	for (let line = 0; line < 3; line++) el.createDiv({ cls: "ai-agent-panel-style-line" });
	el.createDiv({ cls: "ai-agent-panel-theme-composer" });
}

/** The card's mini transcript: a prompt, three reply lines, a prompt. */
function drawPromptStylePreview(preview: HTMLElement, style: PromptStyle): void {
	const prompt = (): void => {
		if (style === "bubble") {
			preview.createDiv({ cls: "ai-agent-panel-style-bubble" });
			return;
		}
		const bar = preview.createDiv({ cls: "ai-agent-panel-style-bar" });
		bar.createSpan({ cls: "ai-agent-panel-style-badge" });
		bar.createSpan({ cls: "ai-agent-panel-style-dash" });
	};
	prompt();
	for (let line = 0; line < 3; line++) preview.createDiv({ cls: "ai-agent-panel-style-line" });
	prompt();
}

/**
 * A "Prompt color" card's preview: a small prompt (a number box and a text bar) over two reply lines, in that
 * card's own color whatever is picked. Custom shows the accepted Custom color, or a plus icon while none is
 * accepted; the swatch it returns is the one to update when that changes.
 */
function drawPromptColorPreview(preview: HTMLElement, color: PromptColor, customAccepted: boolean): HTMLElement {
	preview.addClass("mod-color");
	const swatch = preview.createDiv({ cls: `ai-agent-panel-color-swatch mod-${color}` });
	swatch.createSpan({ cls: "ai-agent-panel-color-box" });
	swatch.createSpan({ cls: "ai-agent-panel-color-bar" });
	if (color === "custom") {
		setIcon(swatch.createSpan({ cls: "ai-agent-panel-color-plus" }), "plus");
		swatch.toggleClass("is-empty", !customAccepted);
	}
	preview.createDiv({ cls: "ai-agent-panel-style-line" });
	preview.createDiv({ cls: "ai-agent-panel-style-line" });
	return swatch;
}

/**
 * The "Conversation tabs" card's preview (board TabThumbB): a textless miniature
 * of the panel, grey except where the conversations are listed. `top` draws the
 * strip above the transcript, `side` the column on the right, `auto` a narrow
 * panel with the strip, an arrow, and a wide panel with the column.
 */
function drawTabsPreview(preview: HTMLElement, position: TabPosition): void {
	preview.addClass("mod-tabs");
	if (position !== "auto") {
		drawMiniPanel(preview, position);
		return;
	}
	const narrow = preview.createDiv({ cls: "ai-agent-panel-mini-fig" });
	drawMiniPanel(narrow, "top");
	narrow.createDiv({ cls: "ai-agent-panel-mini-label", text: "narrow" });
	const arrow = preview.createDiv({ cls: "ai-agent-panel-mini-arrow" });
	setIcon(arrow.createSpan({ cls: "ai-agent-panel-mini-arrow-icon" }), "arrow-right");
	arrow.appendText("wider");
	const wide = preview.createDiv({ cls: "ai-agent-panel-mini-fig" });
	drawMiniPanel(wide, "side");
	wide.createDiv({ cls: "ai-agent-panel-mini-label", text: "wide" });
}

/** A miniature panel: a prompt, reply lines and the composer, with the tab strip above or the column beside. */
function drawMiniPanel(parent: HTMLElement, form: "top" | "side"): void {
	const panel = parent.createDiv({ cls: `ai-agent-panel-mini mod-${form}` });
	if (form === "top") {
		const strip = panel.createDiv({ cls: "ai-agent-panel-mini-strip" });
		for (let tab = 0; tab < 3; tab++) {
			strip.createSpan({ cls: tab === 0 ? "ai-agent-panel-mini-tab mod-active" : "ai-agent-panel-mini-tab" }).createSpan({ cls: "ai-agent-panel-mini-bar" });
		}
	}
	const body = panel.createDiv({ cls: "ai-agent-panel-mini-body" });
	body.createDiv({ cls: "ai-agent-panel-mini-prompt" }).createSpan();
	for (let line = 0; line < 4; line++) body.createDiv({ cls: "ai-agent-panel-mini-line" });
	body.createDiv({ cls: "ai-agent-panel-mini-composer" });
	if (form === "side") {
		const column = panel.createDiv({ cls: "ai-agent-panel-mini-column" });
		column.createDiv({ cls: "ai-agent-panel-mini-new" }).createSpan({ cls: "ai-agent-panel-mini-bar" });
		const dots = ["mod-busy", "mod-wait", "", ""];
		dots.forEach((dot, row) => {
			const el = column.createDiv({ cls: row === 0 ? "ai-agent-panel-mini-row mod-active" : "ai-agent-panel-mini-row" });
			el.createSpan({ cls: dot === "" ? "ai-agent-panel-mini-dot" : `ai-agent-panel-mini-dot ${dot}` });
			el.createSpan({ cls: "ai-agent-panel-mini-bar" });
		});
	}
}

/** The settings fields a `control` row binds to: all plain strings, so one read/write pair covers every one of them. */
type BoundKey = "exportFilePattern" | "exportDateFormat";

/** The controls a `control` row draws, in the subset both renderers support. */
type PanelControl =
	| { type: "text"; key: BoundKey; placeholder?: string }
	| { type: "dropdown"; key: BoundKey; options: Record<string, string> };

interface PanelRowBase {
	/** Keys the row between renders (Obsidian 1.13+) and names it for the page; stable while the setting exists. */
	id: string;
	name: string;
	desc?: string;
	/** A SYNC_UNITS key: gives the row its cloud badge. */
	unit?: string;
	visible?: () => boolean;
	/** False for rows that are structure rather than settings: the bar, a section or profile heading. */
	searchable?: boolean;
	/** A row under its parent row's setting, drawn indented. */
	sub?: boolean;
	/** The section the row belongs to; set by `groups()`. */
	section?: SectionKey;
	/** The Claude Code profile the row belongs to; set by `groups()`. */
	profile?: string;
}

/** A row whose controls are built imperatively against a `Setting`; the cleanup it returns runs before the row is torn down. */
interface PanelBuiltRow extends PanelRowBase {
	kind: "build";
	build: (setting: Setting) => void | (() => void);
}

/** A row that is one control bound to one settings field. */
interface PanelControlRow extends PanelRowBase {
	kind: "control";
	control: PanelControl;
}

type PanelRow = PanelBuiltRow | PanelControlRow;

/** A group of rows; the page's bar is the first, each section after it. */
interface PanelGroup {
	id: string;
	/** Classes on the group element. */
	cls?: string;
	visible?: () => boolean;
	rows: PanelRow[];
}

/** The page's sections in order (PRD-001.R39): each draws its heading and lead in its first row, and the bar links to it. */
const SECTIONS = [
	{ key: "general", label: "General", lead: "What a new conversation starts with." },
	{ key: "permissions", label: "Permissions", lead: "Stored on this device by default, so a synced vault cannot loosen them elsewhere." },
	{ key: "appearance", label: "Appearance", lead: "How the panel and its transcript look." },
	{ key: "usage", label: "Usage", lead: "Plan usage on the status line. Read from the running session; no tokens spent." },
	{ key: "export", label: "Export", lead: "A Markdown note per conversation, kept in the vault." },
	{ key: "cli", label: "Claude Code", lead: "How the panel launches the Claude Code CLI on this device." },
] as const;
type Section = (typeof SECTIONS)[number];
type SectionKey = Section["key"];

/** What each choice of "Default permission mode" means, under the row's "Details". */
const PERMISSION_DETAILS: readonly (readonly [string, string])[] = [
	["Claude Code default", "the mode set in Claude Code’s own settings"],
	["Accept edits", "file edits in the vault run without asking"],
	["Plan", "read-only until you approve the plan"],
	["Auto-approve", "every call runs without a card, except calls Claude Code flags"],
];

/** The element id of a section's heading: the bar's link target. */
function headingId(key: SectionKey): string {
	return `ai-agent-panel-section-${key}`;
}

/** The element id of a profile's sub-heading: the banner's "Fix it" target. */
function profileHeadingId(id: string): string {
	return `ai-agent-panel-profile-${id}`;
}

/**
 * The page's scroll (DES-001 Settings page): the bar's links, the section headings and the tab element's
 * scroll. Marks the link of the current section, and jumps to a heading under the bar; the numbers are
 * `state/section-spy`'s. Rows register what they draw as they render and take it back in their cleanup, so
 * a structural redraw keeps this running; `stop` ends it.
 */
class PageScroll {
	/** The bar row's element; the bar proper is its group, once the row is in one. */
	private barRow: HTMLElement | null = null;
	private readonly links = new Map<SectionKey, HTMLAnchorElement>();
	private readonly headings = new Map<SectionKey, HTMLElement>();
	private readonly observed = new Set<Element>();
	private readonly observer: ResizeObserver;
	private frame = 0;
	private height = -1;
	private current: SectionKey | null = null;
	private readonly onScroll = (): void => this.schedule();

	constructor(private readonly tab: HTMLElement) {
		this.observer = new (tab.win as typeof window).ResizeObserver(() => this.schedule());
		tab.addClass("ai-agent-panel-settings-page");
		tab.addEventListener("scroll", this.onScroll, { passive: true });
		this.schedule();
	}

	/** The bar row and its links, drawn by the bar row; returns what takes them back. */
	setBar(row: HTMLElement, links: Map<SectionKey, HTMLAnchorElement>): () => void {
		this.links.clear();
		for (const [key, link] of links) this.links.set(key, link);
		this.current = null;
		this.barRow = row;
		this.schedule();
		return () => {
			if (this.barRow !== row) return;
			this.barRow = null;
			this.links.clear();
		};
	}

	/** The sticky element: the bar row's group. */
	private barEl(): HTMLElement | null {
		return this.barRow?.closest<HTMLElement>(".setting-group") ?? this.barRow;
	}

	/** A section's heading, drawn by its first row; returns what takes it back. */
	setHeading(key: SectionKey, heading: HTMLElement): () => void {
		this.headings.set(key, heading);
		this.schedule();
		return () => {
			if (this.headings.get(key) === heading) this.headings.delete(key);
		};
	}

	/** Measure again on the next frame: after a filter change or a structural redraw. */
	remeasure(): void {
		this.schedule();
	}

	/** Scroll `key`'s heading to just under the bar and focus it; passive scrolling never does. A hidden section does not jump. */
	jump(key: SectionKey): void {
		const heading = this.headings.get(key);
		if (!heading || !this.drawn(heading)) return;
		if (this.reveal(heading)) heading.focus({ preventScroll: true });
	}

	/** Whether `el` takes up room: false while a filter hides its row or section. */
	private drawn(el: HTMLElement): boolean {
		return el.getClientRects().length > 0;
	}

	/** Scroll `el`'s top to just under the bar, smoothly unless reduced motion is asked for; false without a bar. */
	reveal(el: HTMLElement): boolean {
		const bar = this.barEl();
		if (!bar) return false;
		const top = jumpTarget({
			headingTop: el.getBoundingClientRect().top,
			barBottom: stuckBarBottom(this.tab.getBoundingClientRect().top, bar.getBoundingClientRect().height),
			scrollTop: this.tab.scrollTop,
			clientHeight: this.tab.clientHeight,
			scrollHeight: this.tab.scrollHeight,
		});
		const reduced = this.tab.win.matchMedia("(prefers-reduced-motion: reduce)").matches;
		this.tab.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
		return true;
	}

	stop(): void {
		if (this.frame) this.tab.win.cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.tab.removeEventListener("scroll", this.onScroll);
		this.observer.disconnect();
		this.tab.removeClass("ai-agent-panel-settings-page");
		this.tab.setCssProps({ "--ai-agent-panel-settings-bar-height": "" });
	}

	/** One measure per animation frame, however many scrolls and resizes ask. */
	private schedule(): void {
		if (this.frame) return;
		this.frame = this.tab.win.requestAnimationFrame(() => {
			this.frame = 0;
			this.measure();
		});
	}

	private measure(): void {
		this.observeGroups();
		const bar = this.barEl();
		if (!bar) return;
		const height = bar.getBoundingClientRect().height;
		if (height !== this.height) {
			this.height = height;
			// The tab's `scroll-padding-block-start`, so a focus move or `scrollIntoView` lands under the bar.
			this.tab.setCssProps({ "--ai-agent-panel-settings-bar-height": `${height}px` });
		}
		const keys = SECTIONS.map((section) => section.key).filter((key) => {
			const heading = this.headings.get(key);
			return heading !== undefined && this.drawn(heading);
		});
		const at = currentSection({
			tops: keys.map((key) => this.headings.get(key)?.getBoundingClientRect().top ?? 0),
			barBottom: stuckBarBottom(this.tab.getBoundingClientRect().top, bar.getBoundingClientRect().height),
			scrollTop: this.tab.scrollTop,
			clientHeight: this.tab.clientHeight,
			scrollHeight: this.tab.scrollHeight,
		});
		const key = at < 0 ? null : keys[at];
		if (key === this.current) return;
		this.current = key;
		for (const [linkKey, link] of this.links) {
			if (linkKey === key) link.setAttr("aria-current", "location");
			else link.removeAttribute("aria-current");
		}
	}

	/** Resize observation follows the bar and every section's group, which a heading's row joins as it renders. */
	private observeGroups(): void {
		const groups = new Set<Element>();
		const bar = this.barEl();
		if (bar) groups.add(bar);
		for (const heading of this.headings.values()) {
			const group = heading.closest(".setting-group");
			if (group) groups.add(group);
		}
		for (const el of this.observed) {
			if (groups.has(el)) continue;
			this.observer.unobserve(el);
			this.observed.delete(el);
		}
		for (const el of groups) {
			if (this.observed.has(el)) continue;
			this.observer.observe(el);
			this.observed.add(el);
		}
	}
}

/** What the bar draws that the page's filters drive. */
interface BarParts {
	search: HTMLInputElement;
	clear: HTMLButtonElement;
	chip: HTMLButtonElement;
	chipCount: HTMLElement;
	links: Map<SectionKey, HTMLAnchorElement>;
}

/** One rendered row: the `Setting` Obsidian drew for it and the description it was drawn from. */
interface RowHandle {
	row: PanelRow;
	setting: Setting;
	el: HTMLElement;
	/** The row's reset button, drawn hidden and shown while the row is modified. */
	reset: ExtraButtonComponent | null;
	/** A section heading's "Reset N" button. */
	sectionReset: HTMLButtonElement | null;
}

/** Where focus was in the page before a reset: the element and the row that held it. */
interface FocusOrigin {
	el: HTMLElement;
	id: string;
}

/** Where focus was before a structural redraw: a row's control by role (its place in the row), or the page's search. */
interface FocusMark {
	/** The row's id; null for the page's search. */
	id: string | null;
	/** The row's place among the rendered rows, for the fallback when it is gone. */
	at: number;
	/** The control's place among the row's controls. */
	role: number;
	draft: string | null;
	selection: [number | null, number | null, "forward" | "backward" | "none" | null] | null;
}

const SUPPORT_DESC = "AI Agent Panel is free and open source. If it helps you, consider supporting it. No feature is gated behind it.";
const SHOW_CLASS = "ai-agent-panel-settings-show";
const DEFAULT_CLASS = "ai-agent-panel-settings-default";
const RESET_CLASS = "ai-agent-panel-settings-reset";
/** The visually hidden text that names a row's reset button (its tooltip is the shorter "Reset to default: <value>"). */
const RESET_NAME_CLASS = "ai-agent-panel-settings-reset-name";
/** The rows whose value shows or hides other rows (`visible`): a reset of one refreshes the page's visibility. */
const VISIBILITY_ROWS: readonly string[] = ["export", "prompt-style", "prompt-color"];
/** How long the notice after a reset offers Undo. */
const UNDO_NOTICE_MS = 10_000;
const NAME_CLASS = "ai-agent-panel-style-name";
/** Obsidian's own settings search, in the modal's tab list. */
const GLOBAL_SEARCH = ".vertical-tab-header .setting-search-container input";

/** The text each marked element held before its matches were wrapped, with the nodes that replaced it. */
const marked = new WeakMap<HTMLElement, { original: string; nodes: Node[] }>();

/** Put `el`'s text back as one text node. */
function unmark(el: HTMLElement): void {
	const was = marked.get(el);
	if (!was) return;
	marked.delete(el);
	const first = was.nodes[0];
	if (first?.parentNode === el) el.insertBefore(el.doc.createTextNode(was.original), first);
	for (const node of was.nodes) if (node.parentNode === el) el.removeChild(node);
}

/** Wrap each match of `query` in `el`'s own text (its first text node) in a `mark`; the row's other children stay as drawn. */
function mark(el: HTMLElement, query: string): void {
	unmark(el);
	const text = Array.from(el.childNodes).find((node) => node.nodeType === 3);
	if (query === "" || !text) return;
	const original = text.textContent ?? "";
	const ranges = matchRanges(original, query);
	if (ranges.length === 0) return;
	const nodes: Node[] = [];
	const put = (node: Node): void => {
		el.insertBefore(node, text);
		nodes.push(node);
	};
	let at = 0;
	for (const [start, end] of ranges) {
		if (start > at) put(el.doc.createTextNode(original.slice(at, start)));
		put(el.createEl("mark", { text: original.slice(start, end) }));
		at = end;
	}
	if (at < original.length) put(el.doc.createTextNode(original.slice(at)));
	el.removeChild(text);
	marked.set(el, { original, nodes });
}

/** A row's controls in tab order; the "Show" button is not one. */
function rowControls(el: HTMLElement): HTMLElement[] {
	return Array.from(el.querySelectorAll<HTMLElement>("input, select, textarea, button, summary, [tabindex='0']")).filter(
		(control) => !control.hasClass(SHOW_CLASS) && !(control as HTMLInputElement).disabled && control.getAttribute("type") !== "hidden"
	);
}

/** The control a row is for: the checked card of a card group, else the first outside the row's text and sync badge, else the first. */
function mainControl(el: HTMLElement): HTMLElement | null {
	const controls = rowControls(el);
	return (
		el.querySelector<HTMLElement>("input[type=radio]:checked") ??
		controls.find((control) => !control.closest(".setting-item-info, .extra-setting-button")) ??
		controls[0] ??
		null
	);
}

/** Whether `el` holds typed text, so it has a draft and a selection to keep. */
function isTextField(el: HTMLElement): boolean {
	if (el.tagName === "TEXTAREA") return true;
	return el.tagName === "INPUT" && ["", "text", "search", "url", "tel", "password"].includes(el.getAttribute("type") ?? "");
}

/** What the filter reads of the plugin: the rows as the page draws them now, and the settings they bind. */
interface FilterHost {
	rows(): FilterRow[];
	settings(): RowSettings;
	/** A row's name as a reset says it: a profile's rows lead with the profile once there are several. */
	label(row: PanelRow): string;
	/** Per section, the rows its reset changes, shown or not (DES-005 Reset and Undo). */
	resetCounts(): Record<string, number>;
}

/**
 * The page's search and Modified filter (DES-001 Settings page, ADR-019): holds the query, the Modified state and the
 * handle each rendered row registers, runs the page model (`state/settings-filter`) and applies it in place -
 * `is-filtered` on rows, profiles and sections, `mark` around matches, the counts, the "Default:" line and "Show". It never
 * touches `visible`, `update()` or the legacy redraw, so focus and typed text stay put. Rows register as they
 * render and take their handle back in their cleanup, so it keeps running across a structural redraw; `stop` ends it.
 */
class PageFilter {
	private query = "";
	private modifiedOnly = false;
	/** Rows edited since the filters last changed: they show whatever the filters say, so an edit never hides its own row. */
	private readonly keep = new Set<string>();
	private readonly handles = new Map<string, RowHandle>();
	private bar: BarParts | null = null;
	private view: PageView | null = null;
	/** Each heading's "Reset N", from the last model. */
	private resets: Record<string, number> = {};
	private frame = 0;
	private readonly onEdit = (event: Event): void => {
		const target = event.target as HTMLElement | null;
		if (!target || target.closest(`.ai-agent-panel-settings-bar, .${SHOW_CLASS}`)) return;
		for (const [id, handle] of this.handles) {
			if (!handle.el.contains(target)) continue;
			this.keep.add(id);
			this.schedule();
			return;
		}
	};
	private readonly onGlobalInput = (event: Event): void => {
		if ((event.target as HTMLElement | null)?.matches(GLOBAL_SEARCH)) this.clear();
	};
	private readonly onGlobalPick = (event: Event): void => {
		const target = event.target as HTMLElement | null;
		if (!target || this.tab.contains(target)) return;
		if (event.type === "keydown" && (event as KeyboardEvent).key !== "Enter") return;
		const modal = this.tab.closest(".modal");
		if (!modal?.contains(target)) return;
		const field = modal.querySelector<HTMLInputElement>(GLOBAL_SEARCH);
		if (field && field.value.trim() !== "") this.clear();
	};

	constructor(
		private readonly tab: HTMLElement,
		private readonly scroll: PageScroll,
		private readonly host: FilterHost
	) {
		for (const type of ["input", "change", "click"]) tab.addEventListener(type, this.onEdit);
		const doc = tab.doc;
		// Capture phase: the filters clear before Obsidian scrolls to the result picked.
		doc.addEventListener("input", this.onGlobalInput, true);
		for (const type of ["pointerdown", "click", "keydown"]) doc.addEventListener(type, this.onGlobalPick, true);
	}

	stop(): void {
		if (this.frame) this.tab.win.cancelAnimationFrame(this.frame);
		this.frame = 0;
		for (const type of ["input", "change", "click"]) this.tab.removeEventListener(type, this.onEdit);
		const doc = this.tab.doc;
		doc.removeEventListener("input", this.onGlobalInput, true);
		for (const type of ["pointerdown", "click", "keydown"]) doc.removeEventListener(type, this.onGlobalPick, true);
		this.handles.clear();
		this.bar = null;
		this.tab.removeClass("is-filtering");
	}

	/** The legacy redraw rebuilt every row without running a cleanup. */
	forget(): void {
		this.handles.clear();
	}

	/** The bar's filter controls, drawn by the bar row; returns what takes them back. */
	setBar(parts: BarParts): () => void {
		this.bar = parts;
		this.compute();
		this.paintBar();
		return () => {
			if (this.bar === parts) this.bar = null;
		};
	}

	/** A row's handle, from the start of its render; returns what takes it back. */
	register(row: PanelRow, setting: Setting): () => void {
		// A redraw of the same `Setting` keeps its handle, so the cleanup of any render takes it back.
		const known = this.handles.get(row.id);
		const handle: RowHandle = known?.setting === setting ? known : { row, setting, el: setting.settingEl, reset: null, sectionReset: null };
		handle.row = row;
		handle.reset = null;
		handle.sectionReset = null;
		// A reused `Setting` may still hold what its last render drew.
		unmark(setting.nameEl);
		unmark(setting.descEl);
		for (const stale of Array.from(handle.el.querySelectorAll(`.${DEFAULT_CLASS}, .${SHOW_CLASS}`))) stale.remove();
		this.handles.set(row.id, handle);
		this.schedule();
		return () => {
			if (this.handles.get(row.id) === handle) this.handles.delete(row.id);
		};
	}

	/** A row's reset button, drawn by its render. */
	setReset(id: string, button: ExtraButtonComponent): void {
		const handle = this.handles.get(id);
		if (handle) handle.reset = button;
	}

	/** A section heading's "Reset N" button, drawn by its render. */
	setSectionReset(id: string, button: HTMLButtonElement): void {
		const handle = this.handles.get(id);
		if (handle) handle.sectionReset = button;
	}

	/** Rows a reset or its Undo changed: like an edited row, they show whatever the filters say until the filters change. */
	keepRows(ids: readonly string[]): void {
		for (const id of ids) this.keep.add(id);
	}

	/** The handle of the row `id`, if it is rendered. */
	handleFor(id: string): RowHandle | undefined {
		return this.handles.get(id);
	}

	/** Where focus is in the page, with the row that holds it; null outside the page's rows. */
	origin(): FocusOrigin | null {
		const active = this.tab.doc.activeElement as HTMLElement | null;
		if (!active || !this.tab.contains(active)) return null;
		for (const [id, handle] of this.handles) if (handle.el.contains(active)) return { el: active, id };
		return null;
	}

	/**
	 * After a reset: focus stays where it was; when that element is gone or no longer takes up room (a reset button that
	 * disappeared with the change) it moves to the row's control, or to a section's heading.
	 */
	refocus(origin: FocusOrigin | null): void {
		if (!origin) return;
		if (origin.el.isConnected && origin.el.getClientRects().length > 0) {
			origin.el.focus({ preventScroll: true });
			return;
		}
		const handle = this.handles.get(origin.id);
		if (!handle) return;
		const target = handle.sectionReset ? handle.el.querySelector<HTMLElement>("[role=heading]") : mainControl(handle.el);
		target?.focus({ preventScroll: true });
	}

	/** Dress a row the moment it has rendered, from the last model, so it never shows unfiltered. */
	paintRow(id: string): void {
		const handle = this.handles.get(id);
		if (handle) this.paint(handle);
	}

	setQuery(query: string): void {
		if (query === this.query) return;
		this.query = query;
		this.keep.clear();
		this.apply();
	}

	setModified(on: boolean): void {
		if (on === this.modifiedOnly) return;
		this.modifiedOnly = on;
		this.keep.clear();
		this.apply();
	}

	/** Clear both filters; whether either was on. */
	clear(): boolean {
		if (this.query === "" && !this.modifiedOnly) return false;
		this.query = "";
		this.modifiedOnly = false;
		this.keep.clear();
		this.apply();
		return true;
	}

	/** "Show": clear the search, put the row under the bar and focus its control. */
	private show(id: string): void {
		this.setQuery("");
		const handle = this.handles.get(id);
		if (!handle) return;
		this.scroll.reveal(handle.el);
		mainControl(handle.el)?.focus({ preventScroll: true });
	}

	/** Apply the model on the next frame: for changes that arrive as DOM events or renders. */
	schedule(): void {
		if (this.frame) return;
		this.frame = this.tab.win.requestAnimationFrame(() => {
			this.frame = 0;
			this.apply();
		});
	}

	private compute(): void {
		this.view = filterPage({
			rows: this.host.rows(),
			sections: SECTIONS.map((section) => section.key),
			query: this.query,
			modifiedOnly: this.modifiedOnly,
			keep: this.keep,
		});
		this.resets = this.host.resetCounts();
	}

	/** Run the model and write it to every handle and the bar, then remeasure. */
	apply(): void {
		if (this.frame) this.tab.win.cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.compute();
		for (const handle of this.handles.values()) this.paint(handle);
		this.paintBar();
		this.tab.toggleClass("is-filtering", this.view?.filtering === true);
		this.scroll.remeasure();
	}

	private paint(handle: RowHandle): void {
		const { row, el, setting } = handle;
		const view = this.view;
		if (row.id === "filter-line") {
			const line = view ? filterLine(view) : null;
			el.closest(".setting-group")?.toggleClass("is-filtered", line === null);
			const text = el.querySelector<HTMLElement>(".ai-agent-panel-settings-filter-line");
			if (text && text.textContent !== (line ?? "")) text.setText(line ?? "");
			return;
		}
		if (row.searchable === false) {
			if (row.id.startsWith("heading-") && row.section) {
				el.closest(".setting-group")?.toggleClass("is-filtered", view?.hiddenSections.includes(row.section) === true);
				const count = setting.nameEl.querySelector<HTMLElement>(":scope > .ai-agent-panel-settings-count") ?? setting.nameEl.createSpan({ cls: "ai-agent-panel-settings-count" });
				const text = view?.searching ? String(view.shown[row.section] ?? 0) : "";
				if (count.textContent !== text) count.setText(text);
				this.paintSectionReset(handle, row.section, view?.searching !== true ? (this.resets[row.section] ?? 0) : 0);
			} else if (row.profile !== undefined && (row.id.endsWith(":heading") || row.id.endsWith(":notice"))) {
				el.toggleClass("is-filtered", view?.hiddenProfiles.includes(row.profile) === true);
			}
			return;
		}
		const facts = rowFacts(row.id, this.host.settings());
		const shown = view?.rows[row.id]?.shown ?? true;
		el.toggleClass("is-filtered", !shown);
		el.toggleClass("is-modified", facts.modified);
		this.paintDefault(handle, view?.modifiedOnly === true ? facts.defaultText : null);
		this.paintReset(handle, facts.modified ? facts.defaultText : null);
		const query = view?.searching && shown ? view.query : "";
		for (const target of [setting.nameEl, setting.descEl, ...Array.from(el.querySelectorAll<HTMLElement>(`.${NAME_CLASS}`))]) mark(target, query);
		const show = el.querySelector(`.${SHOW_CLASS}`);
		if (query !== "" && !show) this.drawShow(handle);
		else if (query === "") show?.remove();
	}

	/** A row's reset button: shown while the row is modified, named and tipped with its default. */
	private paintReset(handle: RowHandle, defaultText: string | null): void {
		const button = handle.reset;
		if (!button) return;
		button.extraSettingsEl.toggleClass("is-hidden", defaultText === null);
		if (defaultText === null) return;
		const name = button.extraSettingsEl.querySelector<HTMLElement>(`.${RESET_NAME_CLASS}`);
		const text = `Reset ${this.host.label(handle.row)} to default: ${defaultText}`;
		if (!name || name.textContent === text) return;
		name.setText(text);
		button.setTooltip(`Reset to default: ${defaultText}`);
	}

	/** A heading's "Reset N": shown while a reset of the section changes N rows, shown or not, and the search is empty. */
	private paintSectionReset(handle: RowHandle, section: SectionKey, count: number): void {
		const button = handle.sectionReset;
		if (!button) return;
		button.toggleClass("is-hidden", count === 0);
		if (count === 0) return;
		const title = SECTIONS.find((candidate) => candidate.key === section)?.label ?? "";
		const label = `Reset ${count}`;
		const rest = ` ${count === 1 ? "setting" : "settings"} in ${title}`;
		const shown = button.querySelector<HTMLElement>(`.${RESET_CLASS}-count`);
		const hidden = button.querySelector<HTMLElement>(`.${RESET_CLASS}-rest`);
		if (shown && shown.textContent !== label) shown.setText(label);
		if (hidden && hidden.textContent !== rest) hidden.setText(rest);
	}

	/**
	 * The "Default: <value>" line, last in the description, only while Modified is on: every row shown then has it, one
	 * edited back to its default included, so a pick never moves the row's control.
	 */
	private paintDefault(handle: RowHandle, value: string | null): void {
		const { descEl } = handle.setting;
		const line = descEl.querySelector<HTMLElement>(`:scope > .${DEFAULT_CLASS}`);
		if (value === null) {
			line?.remove();
			return;
		}
		if (line?.lastElementChild?.textContent === value) return;
		const target = line ?? descEl.createDiv({ cls: DEFAULT_CLASS });
		target.empty();
		target.createSpan({ text: "Default: " });
		target.createSpan({ cls: `${DEFAULT_CLASS}-value`, text: value });
	}

	private drawShow(handle: RowHandle): void {
		const button = handle.setting.infoEl.createEl("button", { cls: SHOW_CLASS, text: "Show" });
		drawIcon(button.createSpan({ cls: "ai-agent-panel-settings-show-icon", attr: { "aria-hidden": "true" } }), ["arrow-right"]);
		button.createSpan({ cls: "ai-agent-panel-visually-hidden", text: ` ${handle.row.name} on the full page` });
		button.addEventListener("click", () => this.show(handle.row.id));
	}

	private paintBar(): void {
		const { bar, view } = this;
		if (!bar || !view) return;
		if (bar.search.value !== this.query) bar.search.value = this.query;
		bar.clear.hidden = bar.search.value === "";
		bar.chip.setAttr("aria-pressed", String(this.modifiedOnly));
		bar.chipCount.setText(String(view.modifiedTotal));
		for (const [key, link] of bar.links) {
			const count = view.shown[key] ?? 0;
			link.querySelector<HTMLElement>(".ai-agent-panel-settings-count")?.setText(view.filtering ? String(count) : "");
			link.toggleClass("is-empty", view.filtering && count === 0);
		}
	}

	/** The rendered rows in page order. */
	private ordered(): RowHandle[] {
		return Array.from(this.handles.values()).sort((a, b) => (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1));
	}

	/** Where focus is, if it is in the page. */
	capture(): FocusMark | null {
		const active = this.tab.doc.activeElement as HTMLElement | null;
		if (!active || !this.tab.contains(active)) return null;
		const field = active as HTMLInputElement;
		const state: Pick<FocusMark, "draft" | "selection"> = isTextField(active)
			? { draft: field.value, selection: [field.selectionStart, field.selectionEnd, field.selectionDirection] }
			: { draft: null, selection: null };
		if (active === this.bar?.search) return { id: null, at: -1, role: 0, ...state };
		const ordered = this.ordered();
		const at = ordered.findIndex((handle) => handle.el.contains(active));
		if (at < 0) return null;
		return { id: ordered[at].row.id, at, role: Math.max(rowControls(ordered[at].el).indexOf(active), 0), ...state };
	}

	/**
	 * After a structural redraw: write the filter state again, then give focus back to the recorded control by row id and
	 * role, with its draft text and selection, or to the next shown control, the previous one, or the page's search.
	 * `settled` names a row whose value the redraw just changed, so its draft is not put back over it.
	 */
	restore(mark: FocusMark | null, settled?: string): void {
		this.apply();
		if (!mark) return;
		let target: HTMLElement | null = null;
		if (mark.id === null) target = this.bar?.search ?? null;
		else {
			const handle = this.handles.get(mark.id);
			if (handle && this.shown(handle)) target = rowControls(handle.el)[mark.role] ?? mainControl(handle.el);
		}
		const exact = target !== null;
		if (!target && mark.id !== null) {
			const ordered = this.ordered();
			const open = (handle: RowHandle): HTMLElement | null => (this.shown(handle) ? mainControl(handle.el) : null);
			const from = Math.min(Math.max(mark.at, 0), ordered.length);
			target =
				ordered.slice(from).map(open).find((control) => control !== null) ??
				ordered.slice(0, from).reverse().map(open).find((control) => control !== null) ??
				this.bar?.search ??
				null;
		}
		if (!target) return;
		target.focus({ preventScroll: true });
		if (!exact || mark.draft === null || mark.selection === null || !isTextField(target)) return;
		const field = target as HTMLInputElement;
		if (mark.id !== settled && field.value !== mark.draft) field.value = mark.draft;
		if (field.value === mark.draft) field.setSelectionRange(mark.selection[0], mark.selection[1], mark.selection[2] ?? undefined);
	}

	/** Whether a row takes up room: not filtered itself and not inside a hidden section. */
	private shown(handle: RowHandle): boolean {
		return handle.el.closest(".is-filtered") === null;
	}
}

/** Folder-path autocomplete for a text input. */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, private textInputEl: HTMLInputElement) {
		super(app, textInputEl);
	}

	protected getSuggestions(query: string): TFolder[] {
		const needle = query.toLowerCase();
		return this.app.vault
			.getAllLoadedFiles()
			.filter(
				(f): f is TFolder =>
					f instanceof TFolder &&
					f.path !== "/" &&
					f.path.toLowerCase().includes(needle)
			)
			.sort((a, b) => a.path.localeCompare(b.path))
			.slice(0, 20);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.textInputEl.value = folder.path;
		this.textInputEl.trigger("input");
		this.close();
	}
}

/**
 * The plugin's settings tab.
 *
 * Obsidian renders this two different ways. From 1.13 it builds the tab from
 * `getSettingDefinitions()`, which is also what puts these settings into the
 * settings search; before that it calls `display()`. Both walk the single
 * `groups()` description below, so the two renderings cannot drift and every
 * name, description and default is written once.
 *
 * Most rows stay imperative (`kind: "build"`). That is not reluctance about
 * the declarative API: nearly every row carries a per-row cloud badge, a
 * definition has nowhere to put one, and a `render:` row is still indexed for
 * search by its name and description - which is the whole point.
 */
export class AgentPanelSettingTab extends PluginSettingTab {
	/** Set around a redraw of the tab, so the "Prompt style" and "Prompt color" cards give focus back to the checked radio. */
	private refocusPromptStyle = false;
	private refocusPromptColor = false;
	/** The Custom card's swatch, which shows the accepted Custom color or a plus icon. */
	private customSwatch: HTMLElement | null = null;
	/** The tab's scope roots (ADR-017), one per row, and Auto's caption listener; released on redraw and when the tab closes. */
	private readonly scopes = new Registrations<string>();
	/** The page's scroll and its scope root, running from the bar's first render until the tab hides. */
	private scroll: PageScroll | null = null;
	/** The page's search and Modified filter, started and stopped with the scroll. */
	private filter: PageFilter | null = null;
	private readonly pageScope = new Registrations<string>();
	/** The live parts of each profile's rows, by row id, drawn again in place after a rename or a change of default. */
	private readonly profilePaint = new Map<string, () => void>();
	/** Each profile's sub-heading, the target of the banner's "Fix it". */
	private readonly profileTitles = new Map<string, HTMLElement>();
	/** The alert icons of the Claude Code link and heading, and the banner's element; set by the rows that draw them. */
	private linkAlert: HTMLElement | null = null;
	private headingAlert: HTMLElement | null = null;
	private bannerEl: HTMLElement | null = null;
	/** What the page last drew of the missing state, and whether a redraw of it is already asked for. */
	private paintedMissing = "";
	private missingAsked = false;
	private stopListening: (() => void) | null = null;
	/** Text composition is under way in the page (an IME): a redraw waits for it to end. */
	private composing = false;
	/** A redraw asked for during composition: the row whose draft the redraw must not restore, if any. */
	private pendingRedraw: { settled?: string } | null = null;
	private readonly onComposition = (event: Event): void => {
		this.composing = event.type === "compositionstart";
		if (this.composing || !this.pendingRedraw) return;
		const { settled } = this.pendingRedraw;
		this.pendingRedraw = null;
		this.rerender(settled);
	};

	constructor(app: App, private plugin: AgentPanelPlugin) {
		super(app, plugin);
		this.containerEl.addClass("ai-agent-panel-scope", "ai-agent-panel-settings-tab");
	}

	// -----------------------------------------------------------------------
	// Rendering - the two entry points, over one description
	// -----------------------------------------------------------------------

	getSettingDefinitions(): SettingDefinitionItem[] {
		return this.groups().map((group) => {
			// `id` keys the group between renders (1.13+); the types do not declare it (ADR-019).
			const definition = {
				type: "group" as const,
				id: group.id,
				cls: group.cls,
				visible: group.visible,
				items: group.rows.map((row) => this.definitionFor(row)),
			};
			return definition;
		});
	}

	/**
	 * Launch options apply to open chats when the tab closes rather than per
	 * keystroke, since each change restarts the chats' CLI processes.
	 */
	hide(): void {
		super.hide();
		this.stopPage();
		this.scopes.releaseAll();
		this.plugin.applyLaunchSettings();
	}

	/**
	 * Start the page's scroll and make the tab element a scope root (ADR-017), so the page draws in the
	 * panel's palette in Obsidian's mode. Run by the bar's first render, since a 1.13+ tab is not
	 * redrawn from `display()` when it reopens; `hide()` ends it.
	 */
	private startPage(): PageScroll {
		if (this.scroll) return this.scroll;
		this.scoped("page", this.containerEl, this.pageScope);
		this.scroll = new PageScroll(this.containerEl);
		this.filter = new PageFilter(this.containerEl, this.scroll, {
			rows: () => this.filterRows(),
			settings: () => this.plugin.settings,
			label: (row) => this.rowLabel(row),
			resetCounts: () => resetCounts({ rows: this.planRows(), sections: SECTIONS, settings: this.plugin.settings }),
		});
		for (const type of ["compositionstart", "compositionend"]) this.containerEl.addEventListener(type, this.onComposition);
		this.stopListening = this.plugin.cliMissing.onChange(() => this.askMissingRedraw());
		this.checkProfiles();
		return this.scroll;
	}

	private stopPage(): void {
		for (const type of ["compositionstart", "compositionend"]) this.containerEl.removeEventListener(type, this.onComposition);
		this.composing = false;
		this.pendingRedraw = null;
		this.filter?.stop();
		this.filter = null;
		this.scroll?.stop();
		this.scroll = null;
		this.stopListening?.();
		this.stopListening = null;
		this.paintedMissing = "";
		this.pageScope.releaseAll();
	}

	/** Each profile's CLI is looked for where that is free (a path on disk, one native auto-detect): the page shows, or profiles or paths changed. */
	private checkProfiles(): void {
		for (const profile of this.plugin.settings.cliProfiles) this.plugin.cliMissing.check(profile.id);
	}

	/** What the page draws of the missing state, to tell whether a change needs a redraw. */
	private missingSignature(): string {
		return JSON.stringify(this.plugin.cliMissing.missing().map((profile) => [profile.id, bannerText(profile)]));
	}

	/** The missing state changed: once per tick, whatever the number of changes, and only if what the page draws differs. */
	private askMissingRedraw(): void {
		if (this.missingAsked || this.scroll === null) return;
		this.missingAsked = true;
		this.containerEl.win.setTimeout(() => {
			this.missingAsked = false;
			if (this.scroll === null || this.missingSignature() === this.paintedMissing) return;
			this.paintMissing();
			// The banner and the notices show through `visible`.
			this.refreshVisibility();
		}, 0);
	}

	/** Draw the missing state in place: the alert icons, each profile's rows and the banner. */
	private paintMissing(): void {
		const none = this.plugin.cliMissing.missing().length === 0;
		if (this.linkAlert) this.linkAlert.hidden = none;
		if (this.headingAlert) this.headingAlert.hidden = none;
		this.paintProfiles();
		this.paintBanner();
		this.paintedMissing = this.missingSignature();
	}

	/** One line per profile whose CLI is missing: an alert icon, what is wrong and a "Fix it" link to the profile. */
	private paintBanner(): void {
		const el = this.bannerEl;
		if (!el) return;
		el.empty();
		for (const profile of this.plugin.cliMissing.missing()) {
			const line = el.createDiv({ cls: "ai-agent-panel-settings-banner-line" });
			drawIcon(line.createSpan({ cls: "ai-agent-panel-settings-alert", attr: { "aria-hidden": "true" } }), ["triangle-alert", "alert-triangle"]);
			const text = line.createSpan({ cls: "ai-agent-panel-settings-banner-text", text: `${bannerText(profile)} ` });
			const fix = text.createEl("a", { cls: "ai-agent-panel-settings-banner-link", text: "Fix it", href: `#${profileHeadingId(profile.id)}` });
			fix.addEventListener("click", (event) => {
				event.preventDefault();
				this.fixProfile(profile.id);
			});
		}
	}

	/** "Fix it": scroll the profile's sub-heading under the bar and focus it; with one profile (no sub-heading), its path. */
	private fixProfile(id: string): void {
		this.filter?.clear();
		const title = this.profileTitles.get(id);
		const drawn = title !== undefined && title.getClientRects().length > 0;
		const target = drawn ? title : (this.filter?.handleFor(`${id}:path`)?.el.querySelector<HTMLElement>("input") ?? null);
		if (!target || !this.scroll?.reveal(drawn ? title : (target.closest<HTMLElement>(".setting-item") ?? target))) return;
		target.focus({ preventScroll: true });
	}

	/**
	 * Give the scope root a row draws the panel's tokens in Obsidian's mode
	 * (ADR-017): the settings modal's background follows the host, not the
	 * Theme setting. Called as the row renders, since Obsidian re-renders the
	 * stored rows when the tab reopens; a redraw of the row releases the root
	 * it drew before.
	 */
	private scoped(row: string, el: HTMLElement, into = this.scopes): void {
		into.set(row, this.plugin.theme.attach(el, "host"));
	}

	/** Pre-1.13 fallback. Not called once getSettingDefinitions() has items. */
	display(): void {
		this.renderLegacy();
	}

	/** The imperative rendering; the fallbacks call it so no deprecated symbol is referenced. */
	private renderLegacy(): void {
		const { containerEl } = this;
		this.scopes.releaseAll();
		containerEl.empty();
		// No cleanup runs for a legacy redraw: the rows' handles are gone with their elements.
		this.filter?.forget();

		// The same group elements Obsidian 1.13+ draws, so the rules and the page's scroll are the same.
		for (const group of this.groups()) {
			if (group.visible?.() === false) continue;
			const groupEl = containerEl.createDiv({ cls: group.cls ? `setting-group ${group.cls}` : "setting-group" });
			const items = groupEl.createDiv({ cls: "setting-items" });
			for (const row of group.rows) {
				if (row.visible?.() === false) continue;
				this.renderRow(new Setting(items), row);
			}
		}
	}

	private definitionFor(row: PanelRow): SettingGroupItem {
		// Every row is a `render` row, so each can draw its badge and sub-row indent; `id` keys it between renders (1.13+).
		const definition = {
			id: row.id,
			name: row.name,
			desc: row.desc,
			visible: row.visible,
			searchable: row.searchable,
			render: (setting: Setting) => this.renderRow(setting, row),
		};
		return definition;
	}

	/** Fill one `Setting` from a row description; used by both renderings. Returns the row's cleanup. */
	private renderRow(setting: Setting, row: PanelRow): void | (() => void) {
		// A redraw empties only the control column: drop what the last build appended to the row and its classes.
		const rowEl = setting.settingEl;
		const release = this.filter?.register(row, setting);
		for (const extra of Array.from(rowEl.querySelectorAll(":scope > .ai-agent-panel-row-extra"))) extra.remove();
		rowEl.removeClass(...ROW_CLASSES);
		setting.setName(row.name);
		if (row.desc !== undefined) setting.setDesc(row.desc);
		rowEl.toggleClass("ai-agent-panel-settings-sub", row.sub === true);
		const cleanup = row.kind === "build" ? row.build(setting) : this.addControl(setting, row.control);
		// The reset button leads the controls, hidden until the row is modified (DES-001 Settings page, row anatomy).
		if (row.searchable !== false && rowFacts(row.id, this.plugin.settings).defaultText !== null) this.addResetButton(setting, row);
		// The badge after the control, on the inline end; rows without one keep its place, so controls line up.
		if (row.unit) setting.addExtraButton(this.syncBadge(row.unit));
		else if (row.searchable !== false) setting.controlEl.createSpan({ cls: "ai-agent-panel-sync-slot", attr: { "aria-hidden": "true" } });
		// The row's state classes, default line and marks, from the last model: toggled, never only added.
		this.filter?.paintRow(row.id);
		return () => {
			release?.();
			if (typeof cleanup === "function") cleanup();
		};
	}

	private addControl(setting: Setting, control: PanelControl): void {
		switch (control.type) {
			case "text":
				setting.addText((text) =>
					text
						.setPlaceholder(control.placeholder ?? "")
						.setValue(this.readBound(control.key))
						.onChange((value) => void this.writeBound(control.key, value))
				);
				return;
			case "dropdown":
				setting.addDropdown((dropdown) =>
					dropdown
						.addOptions(control.options)
						.setValue(this.readBound(control.key))
						.onChange((value) => void this.writeBound(control.key, value))
				);
				return;
		}
	}

	// -----------------------------------------------------------------------
	// Binding by key
	// -----------------------------------------------------------------------

	private readBound(key: BoundKey): string {
		return this.plugin.settings[key];
	}

	private async writeBound(key: BoundKey, value: string): Promise<void> {
		this.plugin.settings[key] = value.trim();
		await this.plugin.saveSettings();
	}

	// -----------------------------------------------------------------------
	// Re-rendering
	// -----------------------------------------------------------------------

	/**
	 * Re-render after a change to the tab's structure (a profile added, a badge
	 * flipped). update() arrived with the declarative API in 1.13; before that
	 * the tab has only display(). The version is spelled out rather than named
	 * as a constant because obsidianmd/no-unsupported-api reads the literal.
	 */
	private rerender(settled?: string): void {
		// An IME's composition would end with the redraw: wait for it.
		if (this.composing) {
			this.pendingRedraw = { settled };
			return;
		}
		// The focus is read when the redraw runs, so a Detect that lands late keeps whichever control has it by then.
		const focus = this.filter?.capture() ?? null;
		if (requireApiVersion("1.13.0")) this.update();
		else this.renderLegacy();
		this.filter?.restore(focus, settled);
	}

	/**
	 * Re-evaluate the `visible` predicates after a change that only shows or
	 * hides rows. Cheap where the API exists; a full redraw where it does not.
	 */
	private refreshVisibility(): void {
		if (requireApiVersion("1.13.0")) {
			this.refreshDomState();
			this.filter?.schedule();
		} else this.rerender();
	}

	// -----------------------------------------------------------------------
	// Reset to default and its Undo (DES-001 Settings page Reset, DES-005 Reset and Undo)
	// -----------------------------------------------------------------------

	/** A row's name as a reset says it: a profile's rows lead with the profile's name once there are several. */
	private rowLabel(row: PanelRow): string {
		const profiles = this.plugin.settings.cliProfiles;
		const profile = profiles.length > 1 && row.profile !== undefined ? profiles.find((candidate) => candidate.id === row.profile) : undefined;
		return profile ? `${profileLabel(profile)}: ${row.name}` : row.name;
	}

	/** The rows a reset may touch: every searchable row, shown or not (DES-005 Reset and Undo), named as the dialog names them. */
	private planRows(): PlanRow[] {
		const rows: PlanRow[] = [];
		for (const row of this.groups().flatMap((group) => group.rows)) {
			if (row.searchable === false || row.section === undefined) continue;
			rows.push({ id: row.id, section: row.section, name: this.rowLabel(row) });
		}
		return rows;
	}

	private planFor(scope: ResetScope, options?: Partial<ResetOptions>): ResetPlan {
		return planReset({ rows: this.planRows(), sections: SECTIONS, settings: this.plugin.settings, scope, options });
	}

	/** A modified row's reset button: icon only, named "Reset <name> to default: <value>", resets at once (decision 6). */
	private addResetButton(setting: Setting, row: PanelRow): void {
		setting.addExtraButton((button) => {
			const el = button.extraSettingsEl;
			el.addClass(RESET_CLASS, "is-hidden");
			el.setAttr("role", "button");
			button.setIcon("rotate-ccw").onClick(() => this.resetRow(row.id));
			const name = el.createSpan({ cls: `${RESET_NAME_CLASS} ai-agent-panel-visually-hidden`, attr: { id: `ai-agent-panel-reset-${++styleCardsDrawn}` } });
			el.setAttr("aria-labelledby", name.id);
			// First among the controls, before the control and the badge.
			setting.controlEl.prepend(el);
			this.filter?.setReset(row.id, button);
		});
	}

	/** A section heading's "Reset N" button, on the inline end before the sync badge; the page filter shows it and writes N. */
	private addSectionReset(setting: Setting, section: Section): void {
		const button = setting.controlEl.createEl("button", { cls: `${RESET_CLASS}-section is-hidden`, attr: { type: "button" } });
		drawIcon(button.createSpan({ cls: `${RESET_CLASS}-icon`, attr: { "aria-hidden": "true" } }), ["rotate-ccw"]);
		button.createSpan({ cls: `${RESET_CLASS}-count` });
		button.createSpan({ cls: `${RESET_CLASS}-rest ai-agent-panel-visually-hidden` });
		button.addEventListener("click", () => this.openReset({ kind: "section", section: section.key }));
		this.filter?.setSectionReset(`heading-${section.key}`, button);
	}

	private resetRow(id: string): void {
		const plan = this.planFor({ kind: "row", id });
		if (plan.changes.length > 0) void this.applyReset(plan, this.filter?.origin() ?? null);
	}

	/** A section's or everything's reset: the dialog lists the changes first and nothing changes until it is confirmed. */
	private openReset(scope: ResetScope): void {
		const origin = this.filter?.origin() ?? null;
		new ResetModal(this.app, {
			build: (options) => this.planFor(scope, options),
			onConfirm: (plan) => void this.applyReset(plan, origin),
		}).open();
	}

	/**
	 * Apply a plan: the patches change the loaded settings, the touched rows redraw, one save writes each key where its
	 * unit says, the panels and (with the tab closed) the launch settings take it, then a Notice offers Undo.
	 */
	private async applyReset(plan: ResetPlan, origin: FocusOrigin | null): Promise<void> {
		const undo = startUndo(plan);
		applyPatches(this.plugin.settings, plan.patches);
		this.filter?.keepRows(undo.rows);
		this.redrawAfter(undo);
		const failure = await this.commit();
		this.filter?.refocus(origin);
		this.offerUndo(undo, failure === null ? resetNotice(plan) : failureNotice(failure), failure === null ? UNDO_NOTICE_MS : 0, "Undo");
	}

	/** Save, then hand the change to the open panels and, with the tab closed, to the open chats; the message of a failed save, else null. */
	private async commit(): Promise<string | null> {
		let failure: string | null = null;
		try {
			await this.plugin.saveSettings();
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
		// The loaded settings changed whether or not the save did.
		this.plugin.applyPanelSettings();
		if (this.scroll === null) this.plugin.applyLaunchSettings();
		return failure;
	}

	/**
	 * Show what a reset or its Undo changed in memory: each touched row redraws through its handle (a sync badge flipped
	 * is structural and redraws the page), then the visibility of rows that follow another row's value.
	 */
	private redrawAfter(record: Pick<UndoRecord, "rows" | "moved">): void {
		// The tab is closed: it draws from the settings when it opens, and a redraw now would reopen the page (legacy).
		if (this.scroll === null) return;
		// A path or WSL flag it changed is looked for again.
		this.checkProfiles();
		if (record.moved) {
			this.rerender();
			return;
		}
		for (const id of record.rows) {
			const handle = this.filter?.handleFor(id);
			if (!handle) continue;
			handle.setting.controlEl.empty();
			this.renderRow(handle.setting, handle.row);
		}
		if (record.rows.some((id) => VISIBILITY_ROWS.includes(id))) this.refreshVisibility();
		this.filter?.apply();
	}

	/**
	 * A Notice with a button: "Undo" after a reset (10 s; a failed save keeps it until dismissed), "Save again" after an
	 * Undo whose save failed. The button does not close the notice; the save does, once it has resolved.
	 */
	private offerUndo(undo: UndoRecord, text: string, duration: number, action: "Undo" | "Save again"): void {
		const message = createFragment((fragment) => {
			fragment.createSpan({ text });
			const button = fragment.createEl("button", { cls: "ai-agent-panel-notice-action", attr: { type: "button" } });
			drawIcon(button.createSpan({ cls: "ai-agent-panel-notice-action-icon", attr: { "aria-hidden": "true" } }), ["rotate-ccw"]);
			button.createSpan({ text: action });
			button.addEventListener("click", (event) => {
				event.stopPropagation();
				button.disabled = true;
				void this.runUndo(undo, notice);
			});
		});
		const notice = new Notice(message, duration);
	}

	/** Restore what still holds the reset value, redraw, save and apply; a failed save keeps the restore in memory and offers the save again. */
	private async runUndo(undo: UndoRecord, notice: Notice): Promise<void> {
		const restoring = undo.phase === "reset";
		const { skipped } = undoReset(this.plugin.settings, undo);
		if (restoring) {
			this.filter?.keepRows(undo.rows);
			this.redrawAfter(undo);
		}
		const failure = await this.commit();
		notice.hide();
		if (failure === null) new Notice(undoneNotice(skipped));
		else this.offerUndo(undo, failureNotice(failure), 0, "Save again");
	}

	// -----------------------------------------------------------------------
	// The sync badge
	// -----------------------------------------------------------------------

	private isLocal(unit: string): boolean {
		return this.plugin.settings.localGroups?.includes(unit) ?? false;
	}

	/**
	 * Notebook Navigator-style cloud badge: shows whether the row's settings
	 * sync across devices (cloud) or stay on this device (cloud-off); clicking
	 * the icon flips it. `unit` is a SYNC_UNITS key.
	 */
	private syncBadge(unit: string): (btn: ExtraButtonComponent) => void {
		const local = this.isLocal(unit);
		return (btn) => {
			btn
				.setIcon(local ? "cloud-off" : "cloud")
				.setTooltip(
					(local
						? "Stored on this device only. Click to sync across devices."
						: "Synced across devices. Click to store on this device only.") +
						(unit === "cli" ? " Covers every row in this section." : "")
				)
				.onClick(async () => {
					// Read now, not when drawn: a second click before the re-render
					// must flip it back, not repeat the first flip.
					const current = this.plugin.settings.localGroups ?? [];
					this.plugin.settings.localGroups = this.isLocal(unit)
						? current.filter((key) => key !== unit)
						: [...current, unit];
					await this.plugin.saveSettings();
					this.rerender();
				});
		};
	}

	// -----------------------------------------------------------------------
	// The settings themselves
	// -----------------------------------------------------------------------

	/**
	 * The "Custom color" row: a text field and a color picker side by side. A
	 * typed value is stored and drawn once `acceptCustomColor` takes it; a
	 * refused one (a blank field over a stored value too) is marked and
	 * explained under the description, nothing is stored, and the prompt keeps
	 * the last accepted color. The picker saves when its dialog settles and
	 * shows a typed #rrggbb value. A stored value that is refused shows its
	 * message as the page draws.
	 */
	private buildCustomColor(setting: Setting): void {
		const settings = this.plugin.settings;
		const nameId = `ai-agent-panel-custom-color-${++styleCardsDrawn}`;
		setting.nameEl.id = nameId;
		// Each is its own token scope (ADR-017 Tokens): Obsidian's settings modal is no panel root.
		const errorEl = setting.descEl.createDiv({ cls: "ai-agent-panel-scope ai-agent-panel-custom-error", attr: { id: `${nameId}-error` } });
		this.scoped("promptCustomColor:error", errorEl);
		setting.controlEl.addClass("ai-agent-panel-scope", "ai-agent-panel-custom-control");
		this.scoped("promptCustomColor:field", setting.controlEl);
		const picker = setting.controlEl.createEl("input", {
			cls: "ai-agent-panel-custom-picker",
			attr: { type: "color", "aria-label": "Pick a color" },
		});
		const syncPicker = (value: string): void => {
			picker.value = pickerHex(value, supportsColor) ?? picker.value;
		};
		picker.value = "#4d91b3";
		syncPicker(settings.promptCustomColor);
		setting.addText((text) => {
			const input = text.inputEl;
			input.addClass("ai-agent-panel-custom-field");
			input.setAttr("aria-labelledby", nameId);
			text.setPlaceholder("Hex, rgb(), hsl() or name").setValue(settings.promptCustomColor);
			const show = (typed: string): void => {
				const message = customColorMessage(typed, settings.promptCustomColor, supportsColor);
				errorEl.empty();
				errorEl.toggleClass("ai-agent-panel-hidden", message === null);
				if (message === null) {
					input.removeAttribute("aria-invalid");
					input.removeAttribute("aria-describedby");
					return;
				}
				drawIcon(errorEl.createSpan({ cls: "ai-agent-panel-custom-error-icon", attr: { "aria-hidden": "true" } }), ["triangle-alert", "alert-triangle"]);
				errorEl.createSpan({ text: message });
				// An empty field is no refusal: it is described, not invalid.
				if (customColorProblem(typed, settings.promptCustomColor, supportsColor) === "empty") input.removeAttribute("aria-invalid");
				else input.setAttr("aria-invalid", "true");
				input.setAttr("aria-describedby", errorEl.id);
			};
			const check = (value: string): void => {
				show(value);
				if (customColorProblem(value, settings.promptCustomColor, supportsColor) !== null || value.trim() === "") return;
				syncPicker(value);
				const accepted = acceptCustomColor(value, supportsColor);
				if (!accepted.ok || accepted.value === settings.promptCustomColor) return;
				settings.promptCustomColor = accepted.value;
				this.customSwatch?.removeClass("is-empty");
				void this.plugin.saveSettings();
				this.plugin.applyPanelSettings();
			};
			show(settings.promptCustomColor);
			text.onChange(check);
			picker.addEventListener("change", () => {
				text.setValue(picker.value);
				check(picker.value);
			});
		});
	}

	/** The bar: the first group, alone, sticky at the top of the page (`ai-agent-panel-settings-bar`). */
	private barGroup(): PanelGroup {
		return {
			id: "bar",
			cls: "ai-agent-panel-settings-bar",
			rows: [{ kind: "build", id: "bar", name: "Settings sections", searchable: false, build: (setting) => this.drawBar(setting) }],
		};
	}

	/**
	 * The bar's row: a first line of the search field and the Modified chip, then a navigation landmark of one link per
	 * section, the current one `aria-current="location"`; while a filter is on each link carries its section's count.
	 */
	private drawBar(setting: Setting): () => void {
		const page = this.startPage();
		const filter = this.filter;
		const row = setting.settingEl;
		row.addClass("ai-agent-panel-settings-bar-row");
		row.empty();
		const top = row.createDiv({ cls: "ai-agent-panel-settings-bar-top" });
		const field = top.createDiv({ cls: "ai-agent-panel-settings-search" });
		drawIcon(field.createSpan({ cls: "ai-agent-panel-settings-search-icon", attr: { "aria-hidden": "true" } }), ["search"]);
		const searchId = `ai-agent-panel-settings-search-${++styleCardsDrawn}`;
		field.createEl("label", { cls: "ai-agent-panel-visually-hidden", text: "Search settings", attr: { for: searchId } });
		const search = field.createEl("input", {
			cls: "ai-agent-panel-settings-search-input",
			attr: { id: searchId, type: "search", placeholder: "Search settings", autocomplete: "off", spellcheck: "false" },
		});
		const clear = field.createEl("button", { cls: "ai-agent-panel-settings-search-clear", attr: { type: "button" } });
		drawIcon(clear.createSpan({ attr: { "aria-hidden": "true" } }), ["x"]);
		clear.createSpan({ cls: "ai-agent-panel-visually-hidden", text: "Clear search" });
		clear.hidden = true;
		const chip = top.createEl("button", { cls: "ai-agent-panel-settings-chip", attr: { type: "button", "aria-pressed": "false" } });
		chip.createSpan({ cls: "ai-agent-panel-settings-chip-mark", attr: { "aria-hidden": "true" } });
		chip.createSpan({ cls: "ai-agent-panel-settings-chip-label", text: "Modified" });
		const chipCount = chip.createSpan({ cls: "ai-agent-panel-settings-count", text: "0" });
		search.addEventListener("input", () => {
			clear.hidden = search.value === "";
			filter?.setQuery(search.value);
		});
		search.addEventListener("keydown", (event) => {
			if (event.key !== "Escape" || event.isComposing || search.value === "") return;
			// The first Escape clears the search; the settings window stays open.
			event.preventDefault();
			event.stopPropagation();
			search.value = "";
			clear.hidden = true;
			filter?.setQuery("");
		});
		clear.addEventListener("click", () => {
			search.value = "";
			clear.hidden = true;
			filter?.setQuery("");
			search.focus();
		});
		chip.addEventListener("click", () => filter?.setModified(chip.getAttribute("aria-pressed") !== "true"));
		this.drawResetAll(top);
		const nav = row.createEl("nav", { cls: "ai-agent-panel-settings-nav" });
		const label = nav.createSpan({ cls: "ai-agent-panel-visually-hidden", text: "Settings sections" });
		label.id = "ai-agent-panel-settings-nav-label";
		nav.setAttr("aria-labelledby", label.id);
		const links = new Map<SectionKey, HTMLAnchorElement>();
		for (const section of SECTIONS) {
			const link = nav.createEl("a", { cls: "ai-agent-panel-settings-link", text: section.label, href: `#${headingId(section.key)}` });
			// The Claude Code link carries an alert icon while a profile's CLI is missing.
			if (section.key === "cli") this.linkAlert = this.drawAlert(link, "Claude Code was not found");
			link.createSpan({ cls: "ai-agent-panel-settings-count" });
			link.addEventListener("click", (event) => {
				event.preventDefault();
				page.jump(section.key);
			});
			links.set(section.key, link);
		}
		const releaseScroll = page.setBar(row, links);
		const releaseFilter = filter?.setBar({ search, clear, chip, chipCount, links });
		const alert = this.linkAlert;
		return () => {
			releaseScroll();
			releaseFilter?.();
			if (this.linkAlert === alert) this.linkAlert = null;
		};
	}

	/**
	 * The bar's "Reset all…", named by its label: below the page's narrow width the label is visually hidden (the container
	 * query), leaving the icon, and its `--no-tooltip` rule lets the tooltip show.
	 */
	private drawResetAll(parent: HTMLElement): void {
		const button = parent.createEl("button", { cls: "ai-agent-panel-settings-reset-all", attr: { type: "button" } });
		drawIcon(button.createSpan({ cls: "ai-agent-panel-settings-reset-all-icon", attr: { "aria-hidden": "true" } }), ["rotate-ccw"]);
		const label = button.createSpan({ cls: "ai-agent-panel-settings-reset-all-label", text: "Reset all…", attr: { id: `ai-agent-panel-reset-${++styleCardsDrawn}` } });
		button.setAttr("aria-labelledby", label.id);
		setTooltip(button, "Reset all settings to default");
		button.addEventListener("click", () => this.openReset({ kind: "all" }));
	}

	/** The banner under the bar while a profile's CLI is missing: its own group, always in the list and shown through `visible` (ADR-019). */
	private bannerGroup(): PanelGroup {
		return {
			id: "cli-banner",
			cls: "ai-agent-panel-settings-banner-group",
			visible: () => this.plugin.cliMissing.missing().length > 0,
			rows: [
				{
					kind: "build",
					id: "cli-banner",
					name: "Claude Code was not found",
					searchable: false,
					build: (setting) => {
						const row = setting.settingEl;
						row.addClass("ai-agent-panel-settings-banner-row");
						row.empty();
						const banner = row.createDiv({ cls: "ai-agent-panel-settings-banner", attr: { role: "status" } });
						this.bannerEl = banner;
						this.paintBanner();
						return () => {
							if (this.bannerEl === banner) this.bannerEl = null;
						};
					},
				},
			],
		};
	}

	/** The line under the bar while a filter is on: how many settings show; its own group, always in the list (ADR-019). */
	private filterGroup(): PanelGroup {
		return {
			id: "filter-line",
			cls: "ai-agent-panel-settings-filter",
			rows: [
				{
					kind: "build",
					id: "filter-line",
					name: "Filter",
					searchable: false,
					build: (setting) => {
						const row = setting.settingEl;
						row.addClass("ai-agent-panel-settings-filter-row");
						row.empty();
						row.createDiv({ cls: "ai-agent-panel-settings-filter-line", attr: { role: "status" } });
					},
				},
			],
		};
	}

	/** The searchable rows as the page model reads them: the rows drawn now, with their facts for the current settings. */
	private filterRows(): FilterRow[] {
		const settings = this.plugin.settings;
		const rows: FilterRow[] = [];
		for (const row of this.groups().flatMap((group) => group.rows)) {
			if (row.searchable === false || row.section === undefined || row.visible?.() === false) continue;
			const facts = rowFacts(row.id, settings);
			rows.push({ id: row.id, section: row.section, profile: row.profile, name: row.name, desc: row.desc, terms: facts.terms, modified: facts.modified });
		}
		return rows;
	}

	/** A section's first row: its heading (a role=heading level 2 element a jump can focus), its lead line and, for Claude Code, the sync badge. */
	private headingRow(section: Section): PanelRow {
		return {
			kind: "build",
			id: `heading-${section.key}`,
			name: section.label,
			desc: section.lead,
			unit: section.key === "cli" ? "cli" : undefined,
			searchable: false,
			build: (setting) => {
				setting.setHeading();
				setting.settingEl.addClass("ai-agent-panel-settings-section");
				if (section.key === SECTIONS[0].key) setting.settingEl.addClass("mod-first");
				setting.nameEl.empty();
				this.addSectionReset(setting, section);
				// The lint rule forbids an h2 element here; role and level give the same outline.
				const title = setting.nameEl.createDiv({
					cls: "ai-agent-panel-settings-title",
					text: section.label,
					attr: { role: "heading", "aria-level": "2", id: headingId(section.key), tabindex: "-1" },
				});
				// Claude Code's heading carries an alert icon while a profile's CLI is missing.
				const alert = section.key === "cli" ? this.drawAlert(title, "Claude Code was not found") : null;
				this.headingAlert = alert ?? this.headingAlert;
				const release = this.startPage().setHeading(section.key, title);
				return () => {
					release();
					if (alert && this.headingAlert === alert) this.headingAlert = null;
				};
			},
		};
	}

	/** "Default permission mode"'s "Details": what each choice means, under the description. */
	private drawModeDetails(setting: Setting): void {
		const details = setting.descEl.createEl("details", { cls: "ai-agent-panel-settings-more" });
		const summary = details.createEl("summary", { text: "Details" });
		setIcon(summary.createSpan({ cls: "ai-agent-panel-settings-more-icon", attr: { "aria-hidden": "true" } }), "chevron-down");
		const list = details.createEl("dl");
		for (const [term, meaning] of PERMISSION_DETAILS) {
			list.createEl("dt", { text: term });
			list.createEl("dd", { text: meaning });
		}
	}

	/** A 0 to 100 slider in steps of 5 with its value in text beside it: the usage thresholds. */
	private addPercentSlider(setting: Setting, current: number, apply: (value: number) => Promise<void>): void {
		const figure = setting.controlEl.createSpan({ cls: "ai-agent-panel-settings-value", text: `${current}%` });
		setting.addSlider((slider) =>
			slider
				.setLimits(0, 100, 5)
				.setValue(current)
				.onChange(async (value) => {
					figure.setText(`${value}%`);
					await apply(value);
				})
		);
		// The figure follows the slider, on its inline end.
		setting.controlEl.append(figure);
	}

	private groups(): PanelGroup[] {
		return [
			this.barGroup(),
			this.bannerGroup(),
			this.filterGroup(),
			...SECTIONS.map((section) => ({
				id: `section-${section.key}`,
				// Each row knows its section and, in Claude Code, its profile (the id before the colon), for the page model.
				rows: [this.headingRow(section), ...this.sectionRows(section.key)].map((row) => ({
					...row,
					section: section.key,
					profile: row.id.includes(":") ? row.id.slice(0, row.id.lastIndexOf(":")) : undefined,
				})),
			})),
			this.supportGroup(),
		];
	}

	/**
	 * The page's foot: "Support development", a button per `fundingUrl` link in
	 * the manifest, which the browser opens; the plugin requests nothing. Out
	 * of the search; absent with no links.
	 */
	private supportGroup(): PanelGroup {
		const links = supportLinks((this.plugin.manifest as { fundingUrl?: unknown }).fundingUrl);
		return {
			id: "support",
			cls: "ai-agent-panel-settings-support",
			visible: () => links.length > 0,
			rows: [
				{
					kind: "build",
					id: "support",
					name: "Support development",
					desc: SUPPORT_DESC,
					searchable: false,
					build: (setting) => {
						setting.settingEl.addClass("ai-agent-panel-settings-support-row");
						if (!setting.nameEl.querySelector(".ai-agent-panel-settings-support-heart")) {
							const heart = createSpan({ cls: "ai-agent-panel-settings-support-heart ai-agent-panel-settings-sponsor", attr: { "aria-hidden": "true" } });
							drawIcon(heart, ["heart"]);
							setting.nameEl.prepend(heart);
						}
						// Links styled as the page's buttons: Obsidian hands a `_blank` link to the browser.
						for (const link of links) {
							const anchor = setting.controlEl.createEl("a", {
								cls: "ai-agent-panel-settings-button",
								href: link.url,
								attr: { target: "_blank", rel: "noopener" },
							});
							const sponsor = link.icon === "heart" ? " ai-agent-panel-settings-sponsor" : "";
							drawIcon(anchor.createSpan({ cls: `ai-agent-panel-settings-button-icon${sponsor}`, attr: { "aria-hidden": "true" } }), [link.icon]);
							anchor.appendText(link.name);
						}
						// No sync badge: an empty slot, so the buttons line up with the controls above.
						setting.controlEl.createSpan({ cls: "ai-agent-panel-sync-slot", attr: { "aria-hidden": "true" } });
					},
				},
			],
		};
	}

	private sectionRows(key: SectionKey): PanelRow[] {
		switch (key) {
			case "general":
				return this.generalRows();
			case "permissions":
				return this.permissionRows();
			case "appearance":
				return this.appearanceRows();
			case "usage":
				return this.usageRows();
			case "export":
				return this.exportRows();
			case "cli":
				return this.cliRows();
		}
	}

	/** The General section's rows. */
	private generalRows(): PanelRow[] {
		const settings = this.plugin.settings;
		return [
			{
				kind: "build",
				id: "model",
				name: "Model",
				desc: "An alias (opus, sonnet, fable, haiku) or a full model id. A pick in the chat overrides it for later conversations.",
				unit: "model",
				build: (setting) => {
					setting.addText((text) =>
						text
							.setPlaceholder("Default")
							.setValue(settings.model)
							.onChange(async (value) => {
								settings.model = value.trim();
								// The freshly chosen default should win over past chat picks.
								delete settings.lastModel;
								await this.plugin.saveSettings();
							})
					);
				},
			},
			{
				kind: "build",
				id: "effort",
				name: "Default reasoning effort",
				desc: "Higher thinks longer and costs more. Changeable per conversation.",
				unit: "effort",
				build: (setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOptions({
								"": "CLI default",
								...Object.fromEntries(
									effortLevels(
										Object.values(settings.cliModels ?? {}).flat()
									).map((level) => [level, effortLabel(level)])
								),
							})
							.setValue(settings.effort)
							.onChange(async (value) => {
								settings.effort = value;
								delete settings.lastEffort;
								await this.plugin.saveSettings();
							})
					);
				},
			},
			{
				kind: "build",
				id: "note-context",
				name: "Include note context by default",
				desc: "Attach the active note’s path and selection to each message. Toggle per message in the chat.",
				unit: "context",
				build: (setting) => {
					setting.addToggle((toggle) =>
						toggle
							.setValue(settings.includeContextByDefault)
							.onChange(async (value) => {
								settings.includeContextByDefault = value;
								await this.plugin.saveSettings();
							})
					);
				},
			},
			{
				kind: "build",
				id: "vault-instructions",
				name: "Vault instructions",
				desc: "Appended to Claude’s system prompt in this vault. A CLAUDE.md in the vault root works too.",
				unit: "instructions",
				build: (setting) => {
					setting.addTextArea((text) => {
						text
							.setPlaceholder(
								"E.g. Notes live in areas/, use wikilinks, keep headings in sentence case"
							)
							.setValue(settings.vaultInstructions)
							.onChange(async (value) => {
								settings.vaultInstructions = value;
								await this.plugin.saveSettings();
							});
						text.inputEl.rows = 3;
						text.inputEl.addClass("ai-agent-panel-settings-textarea", "ai-agent-panel-row-extra");
						// Under the row's text, not in its control column.
						setting.settingEl.addClass("ai-agent-panel-settings-stack");
						setting.settingEl.append(text.inputEl);
					});
				},
			},
		];
	}

	/** The Permissions section's rows. */
	private permissionRows(): PanelRow[] {
		const settings = this.plugin.settings;
		return [
			{
				kind: "build",
				id: "permission-mode",
				name: "Default permission mode",
				desc: "How Claude asks before using tools. Changeable per conversation.",
				unit: "permissionMode",
				build: (setting) => {
					this.drawModeDetails(setting);
					setting.addDropdown((dropdown) =>
						dropdown
							.addOptions(
								Object.fromEntries(
									DEFAULT_MODE_CHOICES.map((mode) => [mode, DEFAULT_MODE_LABELS[mode]])
								)
							)
							.setValue(settings.defaultPermissionMode)
							.onChange(async (value) => {
								settings.defaultPermissionMode = validDefaultPermissionMode(value);
								await this.plugin.saveSettings();
							})
					);
				},
			},
			{
				kind: "build",
				id: "bypass",
				name: "Bypass-permissions mode",
				desc: "Adds “Bypass permissions” to the mode menu. In it every tool, shell commands included, runs without asking.",
				unit: "bypass",
				build: (setting) => {
					const alert = createSpan({ cls: "ai-agent-panel-settings-alert", attr: { "aria-hidden": "true" } });
					drawIcon(alert, ["triangle-alert", "alert-triangle"]);
					setting.nameEl.prepend(alert);
					setting.addToggle((toggle) =>
						toggle.setValue(settings.enableBypassMode).onChange(async (value) => {
							settings.enableBypassMode = value;
							await this.plugin.saveSettings();
						})
					);
				},
			},
			{
				kind: "build",
				id: "vault-tools",
				name: "Vault tools for Claude",
				desc: "Rename with link updates, backlinks, tag and property search, the open note. Each call still asks. Needs Claude Code 2.1.210+.",
				unit: "obsidianMcp",
				build: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(settings.enableObsidianMcp).onChange(async (value) => {
							settings.enableObsidianMcp = value;
							await this.plugin.saveSettings();
						})
					);
				},
			},
			{
				kind: "build",
				id: "shell-escape",
				name: "The composer’s “!” shell escape",
				desc: "“!” and a command runs it in the vault folder. It skips Claude Code’s permission prompts; nothing reaches Claude unless you add it.",
				unit: "bash",
				build: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(settings.enableBashMode).onChange(async (value) => {
							settings.enableBashMode = value;
							await this.plugin.saveSettings();
						})
					);
				},
			},
		];
	}

	/** The Appearance section's rows. */
	private appearanceRows(): PanelRow[] {
		const settings = this.plugin.settings;
		return [
			{
				kind: "build",
				id: "theme",
				name: "Theme",
				desc: "The panel and the workflow view follow Obsidian unless you pick one here.",
				unit: "theme",
				build: (setting) => {
					// The cards sit under the name, the description and the sync badge.
					setting.settingEl.addClass("ai-agent-panel-settings-cards");
					const hostDark = this.plugin.theme.mode("host") === "dark";
					const cards = drawRadioCards<ThemeChoice>(
						setting.settingEl,
						setting.nameEl,
						THEME_CHOICES.map((choice) => ({
							value: choice,
							name: THEME_LABELS[choice],
							caption: themeCardCaption(choice, hostDark),
							preview: (el) => drawThemePreview(el, choice),
						})),
						settings.theme,
						false,
						(choice) => void this.plugin.setTheme(choice)
					);
					this.scoped("theme", cards);
					// Auto's caption (the row's only one) follows Obsidian's mode while the tab is open.
					const caption = setting.settingEl.querySelector<HTMLElement>(".ai-agent-panel-style-caption");
					if (caption) {
						const ref = this.app.workspace.on("css-change", () =>
							caption.setText(themeCardCaption("match", this.plugin.theme.mode("host") === "dark") ?? "")
						);
						// Released with the tab's scope root on hide, and replaced when the row is redrawn.
						this.scopes.set("autoCaption", () => this.app.workspace.offref(ref));
					}
				},
			},
			{
				kind: "build",
				id: "conversation-tabs",
				name: "Conversation tabs",
				desc: "Where the open conversations are listed. Automatic uses the side column whenever the panel is wide enough for one.",
				unit: "tabPosition",
				build: (setting) => {
					// The cards sit under the name, the description and the sync badge.
					setting.settingEl.addClass("ai-agent-panel-settings-cards");
					const cards = drawRadioCards<TabPosition>(
						setting.settingEl,
						setting.nameEl,
						TAB_POSITIONS.map((position) => ({
							value: position,
							...TAB_POSITION_CARDS[position],
							preview: (el) => drawTabsPreview(el, position),
						})),
						settings.tabPosition,
						false,
						async (position) => {
							settings.tabPosition = position;
							await this.plugin.saveSettings();
							this.plugin.applyPanelSettings();
						}
					);
					this.scoped("tabPosition", cards);
				},
			},
			{
				kind: "build",
				id: "tooltips",
				name: "Show tooltips",
				desc: "Name icon buttons when the pointer rests on them. Hover cards stay.",
				unit: "showTooltips",
				build: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(settings.showTooltips).onChange((value) => this.plugin.setShowTooltips(value))
					);
				},
			},
			{
				kind: "build",
				id: "prompt-style",
				name: "Prompt style",
				desc:
					"How your own messages stand out in the transcript.",
				unit: "promptStyle",
				build: (setting) => {
					// The cards sit under the name, the description and the sync badge.
					setting.settingEl.addClass("ai-agent-panel-settings-cards");
					const refocus = this.refocusPromptStyle;
					this.refocusPromptStyle = false;
					const cards = drawRadioCards<PromptStyle>(
						setting.settingEl,
						setting.nameEl,
						PROMPT_STYLES.map((style) => ({
							value: style,
							...PROMPT_STYLE_CARDS[style],
							preview: (el) => drawPromptStylePreview(el, style),
						})),
						settings.promptStyle,
						refocus,
						async (style) => {
							const railChanges = promptLayout(settings.promptStyle).rail !== promptLayout(style).rail;
							settings.promptStyle = style;
							await this.plugin.saveSettings();
							this.plugin.applyPanelSettings();
							// "Prompt jump rail" shows with Card; a redraw (before 1.13) drops focus.
							if (!railChanges) return;
							this.refocusPromptStyle = true;
							this.refreshVisibility();
							this.refocusPromptStyle = false;
						}
					);
					this.scoped("promptStyle", cards);
				},
			},
			{
				kind: "build",
				id: "prompt-color",
				name: "Prompt color",
				desc: "Fills and outlines your own messages; Clear only outlines them. Each color has a light and a dark version; Sand is the default.",
				unit: "promptColor",
				build: (setting) => {
					// The cards sit under the name, the description and the sync badge, five to a row.
					setting.settingEl.addClass("ai-agent-panel-settings-cards", "ai-agent-panel-settings-colors");
					const refocus = this.refocusPromptColor;
					this.refocusPromptColor = false;
					const customAccepted = acceptCustomColor(settings.promptCustomColor, supportsColor).ok;
					const cards = drawRadioCards<PromptColor>(
						setting.settingEl,
						setting.nameEl,
						PROMPT_COLORS.map((color) => ({
							value: color,
							name: PROMPT_COLOR_LABELS[color],
							preview: (el) => {
								const swatch = drawPromptColorPreview(el, color, customAccepted);
								if (color === "custom") this.customSwatch = swatch;
							},
						})),
						settings.promptColor,
						refocus,
						async (color) => {
							const rowChanges = (settings.promptColor === "custom") !== (color === "custom");
							settings.promptColor = color;
							await this.plugin.saveSettings();
							this.plugin.applyPanelSettings();
							// "Custom color" shows with Custom; a redraw (before 1.13) drops focus.
							if (!rowChanges) return;
							this.refocusPromptColor = true;
							this.refreshVisibility();
							this.refocusPromptColor = false;
						}
					);
					cards.addClass("mod-colors");
					this.scoped("promptColor", cards);
				},
			},
			{
				kind: "build",
				id: "custom-color",
				sub: true,
				name: "Custom color",
				desc: "Any CSS color, used in both modes. A translucent one, e.g. hsl(200 40% 50% / .15), suits both. The picker writes a hex value.",
				visible: () => settings.promptColor === "custom",
				build: (setting) => this.buildCustomColor(setting),
			},
			{
				kind: "build",
				id: "pin-prompt",
				name: "Pin the current prompt while scrolling",
				desc: "The prompt you are reading under stays at the top, cut to one line.",
				unit: "pinPrompt",
				build: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(settings.pinPrompt).onChange(async (value) => {
							settings.pinPrompt = value;
							await this.plugin.saveSettings();
							this.plugin.applyPanelSettings();
						})
					);
				},
			},
			{
				kind: "build",
				id: "prompt-rail",
				sub: true,
				name: "Prompt jump rail",
				desc: "A tick per prompt on the right edge. Hover to preview, click to jump. Card only.",
				unit: "promptRail",
				visible: () => promptLayout(settings.promptStyle).rail,
				build: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(settings.promptRail).onChange(async (value) => {
							settings.promptRail = value;
							await this.plugin.saveSettings();
							this.plugin.applyPanelSettings();
						})
					);
				},
			},
		];
	}

	/** The Usage section's rows. */
	private usageRows(): PanelRow[] {
		const settings = this.plugin.settings;
		return [
			{
				kind: "build",
				id: "show-usage",
				name: "Show plan usage",
				desc: "The 5-hour and fullest weekly limit at the end of the status line.",
				unit: "showUsage",
				build: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(settings.showUsage).onChange(async (value) => {
							settings.showUsage = value;
							await this.plugin.saveSettings();
							this.plugin.applyPanelSettings();
						})
					);
				},
			},
			{
				kind: "build",
				id: "usage-refresh",
				sub: true,
				name: "Refresh interval",
				desc: "How often usage is re-read while it shows: 30s, 5m, 1h. Minimum 10s.",
				unit: "usageRefresh",
				build: (setting) => {
					setting.addText((text) => {
						text
							.setPlaceholder("5m")
							.setValue(formatDurationSeconds(settings.usageRefreshSeconds))
							.onChange(async (value) => {
								const parsed = parseDurationSeconds(value);
								if (parsed === null) return; // ignore while the value is mid-edit
								settings.usageRefreshSeconds = Math.max(
									MIN_USAGE_REFRESH_SECONDS,
									parsed
								);
								await this.plugin.saveSettings();
								this.plugin.applyPanelSettings();
							});
						text.inputEl.addEventListener("blur", () => {
							// Settle the field on the value that was actually applied.
							text.setValue(formatDurationSeconds(settings.usageRefreshSeconds));
						});
					});
				},
			},
			{
				kind: "build",
				id: "usage-warn",
				sub: true,
				name: "Warning threshold",
				desc: "A limit turns orange from this percentage.",
				unit: "usageWarn",
				build: (setting) => {
					this.addPercentSlider(setting, settings.usageWarnPercent, async (value) => {
						settings.usageWarnPercent = value;
						await this.plugin.saveSettings();
						this.plugin.applyPanelSettings();
					});
				},
			},
			{
				kind: "build",
				id: "usage-crit",
				sub: true,
				name: "Critical threshold",
				desc: "A limit turns red from this percentage.",
				unit: "usageCrit",
				build: (setting) => {
					this.addPercentSlider(setting, settings.usageCritPercent, async (value) => {
						settings.usageCritPercent = value;
						await this.plugin.saveSettings();
						this.plugin.applyPanelSettings();
					});
				},
			},
		];
	}

	/** The Export section's rows. */
	private exportRows(): PanelRow[] {
		const settings = this.plugin.settings;
		return [
			{
				kind: "build",
				id: "export",
				name: "Export transcripts to Markdown",
				desc: "Updated as the conversation goes. “Export conversation to Markdown” works anytime. The badge covers the three rows below.",
				unit: "export",
				build: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(settings.exportEnabled).onChange(async (value) => {
							settings.exportEnabled = value;
							await this.plugin.saveSettings();
							this.refreshVisibility(); // reveal/hide the three rows below
						})
					);
				},
			},
			{
				kind: "build",
				id: "export-folder",
				sub: true,
				name: "Folder",
				desc: "Created if missing.",
				visible: () => settings.exportEnabled,
				// Kept imperative for its folder autocomplete: the declarative
				// 'folder' control has its own suggester, and swapping to it is a
				// behaviour change that wants checking in a vault first.
				build: (setting) => {
					setting.addText((text) => {
						text
							.setPlaceholder("Agent Chats")
							.setValue(settings.exportFolder)
							.onChange(async (value) => {
								settings.exportFolder = value.trim();
								await this.plugin.saveSettings();
							});
						new FolderSuggest(this.app, text.inputEl);
					});
				},
			},
			{
				kind: "control",
				id: "export-pattern",
				sub: true,
				name: "Note name pattern",
				desc: "{date}, {title} and {id}; “/” makes subfolders.",
				visible: () => settings.exportEnabled,
				control: {
					type: "text",
					key: "exportFilePattern",
					placeholder: "{date} {title}",
				},
			},
			{
				kind: "control",
				id: "export-date",
				sub: true,
				name: "Date format",
				desc: "Moment format for {date}; YYYY/MM gives a folder per month.",
				visible: () => settings.exportEnabled,
				control: {
					type: "text",
					key: "exportDateFormat",
					placeholder: "YYYY-MM-DD",
				},
			},
		];
	}


	/** Two or more profiles: the sub-headings, names, "Use for new conversations" and Remove show. */
	private several(): boolean {
		return this.plugin.settings.cliProfiles.length > 1;
	}

	/** Whether `profile` launches inside WSL here: the flag counts on Windows only. */
	private inWsl(profile: CliProfile): boolean {
		return profile.useWsl && process.platform === "win32";
	}

	/** An alert icon with its text for assistive technology, hidden until `setAlert` shows it; icon and text, never color alone. */
	private drawAlert(parent: HTMLElement, text: string): HTMLElement {
		const alert = parent.createSpan({ cls: "ai-agent-panel-settings-alert" });
		drawIcon(alert.createSpan({ attr: { "aria-hidden": "true" } }), ["triangle-alert", "alert-triangle"]);
		alert.createSpan({ cls: "ai-agent-panel-visually-hidden", text });
		alert.hidden = this.plugin.cliMissing.missing().length === 0;
		return alert;
	}

	/** The profile's rows' live parts (heading, default line, Remove), drawn again after a rename or a change of default. */
	private paintProfiles(): void {
		for (const paint of this.profilePaint.values()) paint();
	}

	/** One profile's rows: a heading while there are several, its notice, name, the launch rows, "Use for new conversations" and Remove. */
	private profileBlock(profile: CliProfile): PanelRow[] {
		const settings = this.plugin.settings;
		const state = this.plugin.cliMissing;
		const isDefault = settings.defaultProfileId === profile.id;
		const paint = (key: string, painter: (() => void) | null): void => {
			if (painter) this.profilePaint.set(key, painter);
			else this.profilePaint.delete(key);
		};
		const rows: PanelRow[] = [
			{
				kind: "build",
				id: `${profile.id}:heading`,
				name: `Profile ${profileLabel(profile)}`,
				// A sub-heading for the block below it, not a setting of its own.
				searchable: false,
				visible: () => this.several(),
				build: (setting) => {
					setting.setHeading();
					setting.settingEl.addClass("ai-agent-panel-settings-profile");
					setting.nameEl.empty();
					// The lint rule forbids a heading element here, as for the section titles; role and level give the outline.
					const title = setting.nameEl.createDiv({
						cls: "ai-agent-panel-settings-profile-title",
						attr: { role: "heading", "aria-level": "3", id: profileHeadingId(profile.id), tabindex: "-1" },
					});
					title.createSpan({ cls: "ai-agent-panel-settings-profile-label", text: "Profile" });
					const name = title.createSpan({ cls: "ai-agent-panel-settings-profile-name" });
					const tag = title.createSpan({ cls: "ai-agent-panel-settings-profile-tag", text: "default" });
					const alert = this.drawAlert(title, "Claude Code was not found");
					const draw = (): void => {
						name.setText(profileLabel(profile));
						tag.hidden = this.plugin.settings.defaultProfileId !== profile.id;
						alert.hidden = !this.plugin.cliMissing.isMissing(profile.id);
					};
					draw();
					this.profileTitles.set(profile.id, title);
					paint(`${profile.id}:heading`, draw);
					return () => {
						this.profileTitles.delete(profile.id);
						paint(`${profile.id}:heading`, null);
					};
				},
			},
			{
				kind: "build",
				id: `${profile.id}:notice`,
				name: "Claude Code was not found",
				// A status, not a setting.
				searchable: false,
				visible: () => state.isMissing(profile.id),
				build: (setting) => {
					const row = setting.settingEl;
					row.addClass("ai-agent-panel-settings-notice-row");
					row.empty();
					const box = row.createDiv({ cls: "ai-agent-panel-settings-notice", attr: { role: "status" } });
					drawIcon(box.createSpan({ cls: "ai-agent-panel-settings-alert", attr: { "aria-hidden": "true" } }), ["triangle-alert", "alert-triangle"]);
					const text = box.createSpan();
					const draw = (): void => text.setText(noticeText(profile));
					draw();
					paint(`${profile.id}:notice`, draw);
					return () => paint(`${profile.id}:notice`, null);
				},
			},
			{
				kind: "build",
				id: `${profile.id}:name`,
				name: "Profile name",
				desc: "Shown in the composer’s Profile control.",
				visible: () => this.several(),
				build: (setting) => {
					// The status line's profile segment shows the name: told once typing pauses.
					const announce = debounce(() => this.plugin.applyPanelSettings(), 500, true);
					setting.addText((text) =>
						text.setValue(profile.name).onChange(async (value) => {
							profile.name = value.trim();
							// The sub-heading, Remove, the banner and the notice say the name: drawn again in place, no redraw.
							this.paintProfiles();
							this.paintMissing();
							await this.plugin.saveSettings();
							announce();
						})
					);
				},
			},
		];
		rows.push(...this.profileRows(profile));
		rows.push(
			{
				kind: "build",
				id: `${profile.id}:default`,
				name: "Use for new conversations",
				desc: isDefault ? "This profile is the default." : `${profileLabel(defaultProfile(settings))} is the default now.`,
				visible: () => this.several(),
				build: (setting) => {
					const current = (): boolean => this.plugin.settings.defaultProfileId === profile.id;
					setting.addToggle((toggle) =>
						toggle
							.setValue(current())
							// The default stays on: another profile's toggle is how the default moves.
							.setDisabled(current())
							.onChange(async (value) => {
								if (!value) return;
								settings.defaultProfileId = profile.id;
								await this.plugin.saveSettings();
								this.plugin.applyPanelSettings();
								this.rerender();
							})
					);
					const draw = (): void =>
						void setting.setDesc(current() ? "This profile is the default." : `${profileLabel(defaultProfile(this.plugin.settings))} is the default now.`);
					paint(`${profile.id}:default`, draw);
					return () => paint(`${profile.id}:default`, null);
				},
			},
			{
				kind: "build",
				id: `${profile.id}:remove`,
				name: `Remove the ${profileLabel(profile)} profile`,
				visible: () => this.several(),
				build: (setting) => {
					// The button is the row: its name is the button's text.
					setting.nameEl.empty();
					setting.settingEl.addClass("ai-agent-panel-settings-remove-row");
					const label = (): string => `Remove the ${profileLabel(profile)} profile`;
					// Drawn by hand: ButtonComponent's setButtonText replaces the icon setIcon drew.
					const button = setting.controlEl.createEl("button", { cls: "ai-agent-panel-settings-remove", attr: { type: "button" } });
					drawIcon(button.createSpan({ cls: "ai-agent-panel-settings-button-icon", attr: { "aria-hidden": "true" } }), ["trash"]);
					const text = button.createSpan({ text: label() });
					button.addEventListener("click", () => {
						void removeProfile();
					});
					const removeProfile = async (): Promise<void> => {
						settings.cliProfiles = settings.cliProfiles.filter((p) => p.id !== profile.id);
						if (settings.defaultProfileId === profile.id) settings.defaultProfileId = settings.cliProfiles[0].id;
						await this.plugin.saveSettings();
						// Down to one profile: the status line's profile segment goes.
						this.plugin.applyPanelSettings();
						this.rerender();
					};
					paint(`${profile.id}:remove`, () => text.setText(label()));
					return () => paint(`${profile.id}:remove`, null);
				},
			}
		);
		return rows;
	}

	/**
	 * The Claude Code section's rows: every profile stacked, then "Add a CLI profile". One profile hides its
	 * sub-heading, name, "Use for new conversations" and Remove (`visible`), so it reads as the old fixed settings.
	 */
	private cliRows(): PanelRow[] {
		const settings = this.plugin.settings;
		const rows: PanelRow[] = [];
		for (const profile of settings.cliProfiles) rows.push(...this.profileBlock(profile));

		rows.push({
			kind: "build",
			id: "add-profile",
			name: "Add a CLI profile",
			desc: "Another way to launch Claude Code, e.g. WSL beside Windows.",
			build: (setting) => {
				setting.addButton((btn) => {
					btn.setButtonText("Add profile").setClass("ai-agent-panel-settings-button");
					// After the text: setButtonText replaces what the button holds.
					const icon = createSpan({ cls: "ai-agent-panel-settings-button-icon", attr: { "aria-hidden": "true" } });
					drawIcon(icon, ["plus"]);
					btn.buttonEl.prepend(icon);
					btn.onClick(async () => {
						// Name the migrated original after its platform so the pair is
						// tellable apart the moment a second profile appears.
						const first = settings.cliProfiles[0];
						if (settings.cliProfiles.length === 1 && first.name === "Default")
							first.name = first.useWsl ? "WSL" : "Default";
						settings.cliProfiles.push(
							newProfile(newProfileId(), `Profile ${settings.cliProfiles.length + 1}`)
						);
						this.checkProfiles();
						await this.plugin.saveSettings();
						// A second profile makes the status line's profile segment appear.
						this.plugin.applyPanelSettings();
						this.rerender();
					});
				});
			},
		});

		return rows;
	}

	/** On Windows the WSL toggle, then the path (with its Detect button), which it decides where to look, then the launch rows. */
	private profileRows(profile: CliProfile): PanelRow[] {
		// Set by the arguments row; the path, WSL and sandbox rows all change
		// what the arguments may contain, so each re-checks them.
		const argsCheck = { show: () => {} };
		const state = this.plugin.cliMissing;
		const wsl = this.inWsl(profile);
		const rows: PanelRow[] = [
			{
				kind: "build",
				id: `${profile.id}:wsl`,
				name: "Run via WSL",
				desc: wsl ? "Launch the CLI inside your WSL distro." : "Launch the CLI inside your WSL distro. Windows only.",
				visible: () => process.platform === "win32",
				build: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(profile.useWsl).onChange(async (value) => {
							profile.useWsl = value;
							argsCheck.show();
							state.check(profile.id);
							await this.plugin.saveSettings();
							// The sandbox row exists only in WSL here, and the rows' descriptions say where the CLI runs.
							this.rerender();
						})
					);
				},
			},
			{
				kind: "build",
				id: `${profile.id}:path`,
				name: "Claude CLI path",
				desc: wsl ? "Read inside WSL, e.g. claude." : "Path to the claude executable. Empty means auto-detect.",
				build: (setting) => {
					setting
						.addText((text) =>
							text
								.setPlaceholder("Auto-detect")
								.setValue(profile.cliPath)
								.onChange(async (value) => {
									profile.cliPath = value.trim();
									argsCheck.show();
									// The old path's result goes; the new one is looked for on disk, or an empty one detected.
									state.check(profile.id);
									await this.plugin.saveSettings();
								})
						)
						.addButton((btn) =>
							btn.setButtonText("Detect").setClass("ai-agent-panel-settings-button").onClick(async () => {
								const asked = state.snapshot(profile.id);
								const found = await detectClaudeCli(profile.useWsl);
								// Edited while the probes ran: what they found answers a configuration the profile no longer has.
								if (!state.holds(profile.id, asked)) return;
								if (found) {
									profile.cliPath = found.path;
									profile.useWsl = found.useWsl;
									state.apply(profile.id, state.snapshot(profile.id), true);
									await this.plugin.saveSettings();
									this.rerender(`${profile.id}:path`);
									new Notice(
										found.useWsl
											? `Found Claude Code in WSL: ${found.path}`
											: `Found Claude Code: ${found.path}`
									);
								} else {
									state.missed(profile.id, asked);
									new Notice(
										"Claude Code CLI not found. Install it from https://code.claude.com"
									);
								}
							})
						);
				},
			},
		];

		rows.push(...this.launchRows(profile, argsCheck));
		return rows;
	}

	/** Claude in Chrome, the sandbox, and free-form arguments for one profile. */
	private launchRows(profile: CliProfile, argsCheck: { show: () => void }): PanelRow[] {
		const wsl = this.inWsl(profile);
		const toggleOptions = {
			"": "Claude Code default",
			on: "On",
			off: "Off",
		};
		return [
			{
				kind: "build",
				id: `${profile.id}:chrome`,
				name: "Claude in Chrome",
				// Passed as set, also for WSL: Claude Code's docs list WSL as unsupported, and /chrome reports whether it connected (DES-002).
				desc: wsl
					? "Lets Claude drive your browser through the Claude in Chrome extension. Needs the extension and a claude.ai login; Claude Code’s docs list WSL as unsupported."
					: "Lets Claude drive your browser through the Claude in Chrome extension. Needs a claude.ai login.",
				build: (setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOptions(toggleOptions)
							.setValue(profile.chrome)
							.onChange(async (value) => {
								profile.chrome = value as LaunchToggle;
								await this.plugin.saveSettings();
							})
					);
				},
			},
			{
				kind: "build",
				id: `${profile.id}:sandbox`,
				name: "Sandbox",
				desc: wsl
					? "Needs bubblewrap and socat in the distro."
					: "Runs Claude’s shell commands in the OS sandbox, without asking. Needs bubblewrap and socat.",
				visible: () => sandboxAvailable(profile.useWsl),
				build: (setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOptions(toggleOptions)
							.setValue(profile.sandbox)
							.onChange(async (value) => {
								profile.sandbox = value as LaunchToggle;
								argsCheck.show();
								await this.plugin.saveSettings();
							})
					);
				},
			},
			{
				kind: "build",
				id: `${profile.id}:args`,
				name: "Additional arguments",
				desc: wsl ? "Added to every launch of this profile." : "Added to every launch, e.g. --add-dir ~/projects. No shell reads them.",
				build: (setting) => {
					// Its own token scope (ADR-017 Tokens): Obsidian's settings modal is no panel root.
					const errorEl = setting.descEl.createDiv({ cls: "ai-agent-panel-scope ai-agent-panel-settings-error" });
					this.scoped(`launchArgs:${profile.id}`, errorEl);
					argsCheck.show = () => {
						const { error } = profileLaunchArgs(profile, profile);
						errorEl.setText(error ?? "");
						errorEl.toggleClass("ai-agent-panel-hidden", !error);
					};
					argsCheck.show();
					setting.addText((text) => {
						text
							.setPlaceholder("None")
							.setValue(profile.extraArgs)
							.onChange(async (value) => {
								profile.extraArgs = value.trim();
								argsCheck.show();
								await this.plugin.saveSettings();
							});
						text.inputEl.addClass("ai-agent-panel-settings-args");
					});
					setting.controlEl.addClass("ai-agent-panel-settings-control");
				},
			},
		];
	}
}
