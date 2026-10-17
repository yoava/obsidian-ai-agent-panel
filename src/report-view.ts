import { Component, setTooltip, type Events } from "obsidian";
import {
	failureParts,
	foldedAt,
	formatTokens,
	isWebLink,
	pathSegments,
	reportHeader,
	reportMarkdown,
	reportTitle,
	type CommandReport,
	type ReportAction,
	type ReportBar,
	type ReportFigure,
	type ReportLink,
	type ReportRow,
	type ReportSection,
	type ReportStatus,
} from "./commands";
import { drawIcon, meterBar } from "./icon";
import { codeLike, commandGroups, commandRow, headingParts, meterParts, serverRow, skillBar, tile, type MeterPart } from "./state/report-card";
import { cacheCardLine, COMPACT_TITLE } from "./state/cache-surfaces";
import { cachePeriodMs, countdownTicks, type CacheView } from "./state/prompt-cache";
import type { ReportItem } from "./state/tab";
import type { Ticker } from "./state/ticker";

/** The prompt cache a live `/context` card shows with its "/compact now" button (PRD-001.R20, PRD-005.R11). */
export interface ReportCacheSource {
	/** The cache now; null before any response reported it. */
	view: () => CacheView | null;
	/** Whether `/compact` can be sent now (`compactAllowed`); the button is disabled otherwise. */
	canCompact: () => boolean;
	/** Sends `/compact`; false when the tab cannot send now. */
	onCompact: () => boolean;
	/** The shared ticker, which redraws the time left. */
	ticker: Ticker;
}

/** A live `/context` card's cache line and button. */
interface CardCacheParts {
	row: HTMLElement;
	icon: HTMLElement;
	text: HTMLElement;
	cached: HTMLElement;
	time: HTMLElement;
	left: HTMLElement;
	button: HTMLButtonElement | null;
}

/** What a card's buttons do (DES-003 Report cards): `ui/messages` passes them in. */
export interface ReportCallbacks {
	/** The live `/context` card's cache line and button. */
	cache: ReportCacheSource;
	/** Refresh and Try again: the command again, into this card. */
	onRefresh: () => void;
	/** "Copy as Markdown" and "Copy error", through `ui/copy`. */
	onCopy: (text: string) => void;
	/** A row's button. */
	onAction: (action: ReportAction) => void;
	/** A /help row: `/<name>` and a space into the composer. */
	onInsert: (name: string) => void;
	/** A reopened card's recorded Markdown, through `ui/markdown`. */
	renderMarkdown: (markdown: string, el: HTMLElement) => Promise<void>;
}

/** The tile's icon per command; the first name the bundled Lucide knows wins. */
const ICONS: Readonly<Record<string, readonly string[]>> = {
	chrome: ["globe"],
	context: ["chart-pie", "pie-chart"],
	cost: ["receipt"],
	"extra-usage": ["credit-card"],
	help: ["square-slash", "slash-square", "slash"],
	hooks: ["webhook"],
	mcp: ["plug"],
	memory: ["book-open"],
	permissions: ["shield"],
	sandbox: ["package"],
	skills: ["sparkles"],
	status: ["activity"],
	usage: ["gauge"],
	"usage-credits": ["credit-card"],
};
const LOADING_ICON = ["loader-circle", "loader-2", "loader"];
const FAILED_ICON = ["triangle-alert", "alert-triangle"];
const LINK_ICON = ["external-link", "arrow-up-right"];

/** The footer's leading icon per command (`info` otherwise); null for none, where a link leads. */
const FOOTER_ICONS: Readonly<Record<string, readonly string[] | null>> = {
	chrome: ["settings"],
	mcp: ["terminal", "square-terminal"],
	sandbox: ["settings"],
	usage: null,
	"usage-credits": null,
	"extra-usage": null,
};

let nextTitleId = 0;
let nextGroupId = 0;

/**
 * One panel command's card (DES-003 Report cards), redrawn on its
 * `item:<id>`: loading (the title and its busy text, `aria-busy`, skeleton
 * bars), answered (the header with "no tokens", Refresh and "Copy as
 * Markdown" while live; the report's parts, CLI strings as text nodes
 * only; notes and links in a footer band), failed (`role="alert"`,
 * "Couldn't load", the failure text, "Try again" and "Copy error"); a
 * reopened card, its recorded Markdown through `ui/markdown`. A `region`
 * named by its title.
 */
export class ReportCard extends Component {
	readonly el: HTMLElement;
	private readonly titleId = `ai-agent-panel-report-title-${nextTitleId++}`;
	/** The control that had focus when a redraw removed it, found again in a later state. */
	private pendingFocus: { key: string | null; row: string | null } | null = null;
	/** A live `/context` card's cache line and button; null on any other card. */
	private cacheParts: CardCacheParts | null = null;
	/** The cache as last drawn; the ticker runs from it, so the draw that turns it cold still happens. */
	private cacheDrawn: CacheView | null = null;

	constructor(
		parent: HTMLElement,
		private item: ReportItem,
		private readonly tab: Events,
		private readonly callbacks: ReportCallbacks
	) {
		super();
		// Focusable from code: focus waits here while a re-run loads.
		this.el = parent.createDiv({ cls: "ai-agent-panel-report-card", attr: { tabindex: "-1" } });
		// Per-command layout in styles.css; kept as data, not markup.
		this.el.dataset.command = item.command;
	}

	onload(): void {
		this.register(() => this.el.remove());
		this.registerEvent(this.tab.on(`item:${this.item.id}`, (item) => this.draw(item as ReportItem)));
		// The cache line follows the tab's cache and the turn's running.
		this.registerEvent(this.tab.on("status", () => this.drawCache()));
		this.registerEvent(this.tab.on("activity", () => this.drawCache()));
		const cache = this.callbacks.cache;
		this.register(
			cache.ticker.subscribe({
				shown: () => this.cacheParts !== null && countdownTicks(this.cacheDrawn) && this.el.isShown(),
				periodMs: () => (this.cacheDrawn ? cachePeriodMs(this.cacheDrawn) : 1000),
				phase: () => this.cacheDrawn?.expiresAt ?? null,
				tick: () => this.drawCache(),
			})
		);
		this.draw(this.item);
	}

	private draw(item: ReportItem): void {
		this.item = item;
		const el = this.el;
		// A redraw removes the focused control (Refresh, Try again, a row's button): focus comes back to it after.
		const active = el.doc.activeElement as HTMLElement | null;
		const hadFocus = active !== null && el.contains(active);
		if (hadFocus && active !== el)
			this.pendingFocus = { key: active.dataset.focus ?? null, row: active.dataset.focusRow ?? null };
		el.empty();
		this.cacheParts = null;
		this.cacheDrawn = null;
		el.toggleClass("is-loading", item.state === "loading");
		el.toggleClass("is-failed", item.state === "failed");
		el.setAttr("role", item.state === "failed" ? "alert" : "region");
		el.setAttr("aria-busy", item.state === "loading" ? "true" : null);
		el.setAttr("aria-labelledby", this.titleId);
		if (item.markdown !== null) {
			// No header: the title is hidden text (an `aria-label` would show a tooltip, PRD-001.R32).
			el.createSpan({
				cls: "ai-agent-panel-visually-hidden",
				text: reportTitle(item.command),
				attr: { id: this.titleId, "aria-hidden": "true" },
			});
			const body = el.createDiv({ cls: "ai-agent-panel-report-markdown" });
			const markdown = item.markdown;
			void this.callbacks.renderMarkdown(markdown, body).catch(() => body.setText(markdown));
			return;
		}
		const report = item.state === "answered" ? item.report : null;
		this.drawHeader(item, report);
		if (item.state === "loading") this.drawSkeleton();
		else if (item.state === "failed") this.drawFailure(item.error ?? "");
		else if (report) this.drawBody(report);
		if (hadFocus) this.restoreFocus(item.state === "loading");
	}

	/**
	 * Focus back on the control that had it, else on a control of its row,
	 * else on the card; while loading on the card, the control found once the
	 * card settles.
	 */
	private restoreFocus(loading: boolean): void {
		const pending = this.pendingFocus;
		const controls = [...this.el.querySelectorAll<HTMLElement>("[data-focus]")];
		const target =
			(pending?.key && controls.find((control) => control.dataset.focus === pending.key)) ||
			(pending?.row && controls.find((control) => control.dataset.focusRow === pending.row)) ||
			this.el;
		target.focus();
		if (!loading) this.pendingFocus = null;
	}

	private drawHeader(item: ReportItem, report: CommandReport | null): void {
		const header = reportHeader(item.command, item.state, true);
		const head = this.el.createDiv({ cls: "ai-agent-panel-report-head" });
		const tile = head.createSpan({ cls: "ai-agent-panel-report-tile", attr: { "aria-hidden": "true" } });
		drawIcon(tile, item.state === "loading" ? LOADING_ICON : item.state === "failed" ? FAILED_ICON : (ICONS[item.command] ?? ["terminal"]));
		const titles = head.createDiv({ cls: "ai-agent-panel-report-titles" });
		const line = titles.createDiv({ cls: "ai-agent-panel-report-title-line" });
		line.createSpan({ cls: "ai-agent-panel-report-title", text: report?.title ?? header.title, attr: { id: this.titleId } });
		if (header.note) line.createSpan({ cls: "ai-agent-panel-report-state", text: header.note });
		if (header.badge) line.createSpan({ cls: "ai-agent-panel-report-badge", text: "no tokens" });
		const lead = report?.cardLead ?? report?.lead;
		if (lead) titles.createDiv({ cls: "ai-agent-panel-report-lead", text: lead });
		if (header.refresh) this.iconButton(head, ["rotate-cw"], "Refresh", "rerun", () => this.callbacks.onRefresh());
		if (header.copy && report)
			this.iconButton(head, ["copy"], "Copy as Markdown", "copy", () => this.callbacks.onCopy(reportMarkdown(report)));
	}

	private drawSkeleton(): void {
		const body = this.el.createDiv({ cls: "ai-agent-panel-report-body", attr: { "aria-hidden": "true" } });
		for (let i = 0; i < 3; i++) body.createDiv({ cls: "ai-agent-panel-report-skeleton" });
	}

	private drawFailure(error: string): void {
		const body = this.el.createDiv({ cls: "ai-agent-panel-report-body" });
		const text = body.createEl("p", { cls: "ai-agent-panel-report-error" });
		// The CLI's own message in mono, inside the sentence around it.
		const parts = failureParts(error);
		if (parts) {
			text.appendText(parts.before);
			text.createSpan({ cls: "ai-agent-panel-report-code", text: parts.message });
			text.appendText(parts.after);
		} else text.setText(error);
		const actions = body.createDiv({ cls: "ai-agent-panel-report-buttons" });
		const retry = actions.createEl("button", { cls: "mod-cta", attr: { type: "button", "data-focus": "rerun" } });
		drawIcon(retry.createSpan({ cls: "ai-agent-panel-report-button-icon", attr: { "aria-hidden": "true" } }), ["rotate-cw"]);
		retry.appendText("Try again");
		retry.addEventListener("click", () => this.callbacks.onRefresh());
		const copy = actions.createEl("button", { text: "Copy error", attr: { type: "button", "data-focus": "copy-error" } });
		copy.addEventListener("click", () => this.callbacks.onCopy(error));
	}

	private drawBody(report: CommandReport): void {
		const body = this.el.createDiv({ cls: "ai-agent-panel-report-body" });
		if (report.figure) drawFigure(body, report.figure);
		if (report.meter) drawMeter(body, report.meter);
		if (report.bars?.length) {
			if (report.barPairs) drawBarPairs(body, report.bars);
			else drawBars(body, report.bars);
		}
		for (const section of report.sections) if (!section.recordOnly) this.drawSection(body, section);
		const links = (report.links ?? []).filter((link) => isWebLink(link.href));
		const buttons = links.filter((link) => link.button);
		if (buttons.length) {
			const row = body.createDiv({ cls: "ai-agent-panel-report-link-buttons" });
			for (const link of buttons) drawLink(row, link, `ai-agent-panel-report-link-button is-${link.button ?? "secondary"}`);
		}
		const notes = report.notes ?? [];
		const footerLinks = links.filter((link) => !link.button);
		// A live /context card has the prompt cache line above its footer and "/compact now" in it, built whether or not the cache is reported yet (the line shows once it is); the recorded Markdown leaves both out (a countdown in history is stale).
		const live = this.item.command === "context";
		if (live) this.drawCacheLine(body);
		if (notes.length === 0 && footerLinks.length === 0 && !live) return;
		const footer = this.el.createDiv({ cls: "ai-agent-panel-report-footer" });
		const icon = this.item.command in FOOTER_ICONS ? FOOTER_ICONS[this.item.command] : ["info"];
		if (icon) drawIcon(footer.createSpan({ cls: "ai-agent-panel-report-footer-icon", attr: { "aria-hidden": "true" } }), icon);
		if (notes.length) {
			const text = footer.createDiv({ cls: "ai-agent-panel-report-footer-text" });
			for (const note of notes) text.createEl("p", { cls: "ai-agent-panel-report-note", text: note });
		}
		if (footerLinks.length) {
			const line = footer.createDiv({ cls: "ai-agent-panel-report-links" });
			for (const link of footerLinks) drawLink(line, link, "ai-agent-panel-report-link");
		}
		if (live) this.drawCompact(footer);
		this.drawCache();
	}

	/** The cache line: a bolt, "Prompt cache <state>", the cached tokens, then the time left; hidden until the cache is reported. */
	private drawCacheLine(body: HTMLElement): void {
		const row = body.createDiv({ cls: "ai-agent-panel-report-cache" });
		const icon = row.createSpan({ cls: "ai-agent-panel-report-cache-icon", attr: { "aria-hidden": "true" } });
		const text = row.createSpan({ cls: "ai-agent-panel-report-cache-text" });
		const cached = row.createSpan({ cls: "ai-agent-panel-report-cache-tokens" });
		const time = row.createSpan({ cls: "ai-agent-panel-report-cache-time" });
		const left = row.createSpan({ cls: "ai-agent-panel-report-cache-left", text: "left" });
		this.cacheParts = { row, icon, text, cached, time, left, button: null };
	}

	/** "/compact now" at the end of the footer. */
	private drawCompact(footer: HTMLElement): void {
		const parts = this.cacheParts;
		if (!parts) return;
		const button = footer.createEl("button", {
			cls: "ai-agent-panel-report-row-action ai-agent-panel-report-compact",
			attr: { type: "button", "data-focus": "compact" },
		});
		setTooltip(button, COMPACT_TITLE, { delay: 400 });
		button.createSpan({ cls: "ai-agent-panel-text-button-mono", text: "/compact" });
		button.appendText(" now");
		button.addEventListener("click", () => {
			if (!button.disabled) this.callbacks.cache.onCompact();
		});
		parts.button = button;
	}

	/** Redraws the cache line and the button in place, so a focused button is kept. */
	private drawCache(): void {
		const parts = this.cacheParts;
		if (!parts) return;
		const cache = this.callbacks.cache;
		const view = cache.view();
		this.cacheDrawn = view;
		const line = cacheCardLine(view);
		parts.row.toggle(line !== null);
		if (line) {
			parts.row.dataset.state = line.state;
			const icon = line.state === "cold" ? "zap-off" : "zap";
			if (parts.icon.dataset.icon !== icon) {
				parts.icon.dataset.icon = icon;
				parts.icon.empty();
				drawIcon(parts.icon, [icon]);
			}
			if (parts.text.textContent !== line.text) parts.text.setText(line.text);
			const cached = line.cached ? `· ${line.cached}` : "";
			if (parts.cached.textContent !== cached) parts.cached.setText(cached);
			if (parts.time.textContent !== line.left) parts.time.setText(line.left);
			parts.left.toggle(line.left !== "");
		}
		if (parts.button) {
			const blocked = !cache.canCompact();
			if (parts.button.disabled !== blocked) parts.button.disabled = blocked;
		}
		// The countdown starts, ends or changes its period with the draw.
		cache.ticker.check();
	}

	private drawSection(parent: HTMLElement, section: ReportSection): void {
		const el = parent.createDiv({ cls: "ai-agent-panel-report-section" });
		if (section.list) el.addClass(`is-${section.list}`);
		let content = el;
		if (section.collapsed) {
			const toggle = el.createEl("button", {
				cls: "ai-agent-panel-report-toggle",
				attr: { type: "button", "aria-expanded": "false", "data-focus": `toggle:${section.heading ?? ""}` },
			});
			drawIcon(toggle.createSpan({ cls: "ai-agent-panel-report-chevron", attr: { "aria-hidden": "true" } }), ["chevron-right"]);
			toggle.createSpan({ text: section.heading ?? "" });
			toggle.appendText(" ");
			toggle.createSpan({ cls: "ai-agent-panel-report-count", text: String(section.rows.length) });
			content = el.createDiv({ cls: "ai-agent-panel-report-collapsed" });
			content.hide();
			toggle.addEventListener("click", () => {
				const open = toggle.getAttr("aria-expanded") !== "true";
				toggle.setAttr("aria-expanded", String(open));
				content.toggle(open);
			});
		} else if (section.heading) {
			const heading = el.createDiv({ cls: "ai-agent-panel-report-heading" });
			// The marker's color repeats the heading's word: no text of its own.
			if (section.marker) marker(heading, section.marker);
			const parts = section.headingPill ? headingParts(section.heading) : { text: section.heading, pill: null };
			heading.appendText(parts.text);
			// A space between the parts, which a flex row draws as its gap: read as "Allow 3", not "Allow3".
			if (parts.pill !== null) {
				heading.appendText(" ");
				pill(heading, parts.pill, section.headingPill);
			}
			if (section.marker) {
				heading.appendText(" ");
				heading.createSpan({ cls: "ai-agent-panel-report-count", text: String(section.rows.length) });
			}
			if (section.badge) {
				heading.appendText(" ");
				heading.createSpan({ cls: "ai-agent-panel-report-badge", text: section.badge });
			}
		}
		if (section.rows.length === 0) {
			if (section.empty) content.createEl("p", { cls: "ai-agent-panel-report-empty", text: section.empty });
			return;
		}
		if (section.list) this.drawList(content, section);
		else if (section.columns) this.drawTable(content, section, section.columns);
		else drawPairs(content, section.rows, (value, row) => this.actionButtons(value, row));
	}

	private drawTable(parent: HTMLElement, section: ReportSection, columns: readonly string[]): void {
		const withActions = section.rows.some((row) => row.actions?.length);
		const wrap = parent.createDiv({ cls: "ai-agent-panel-report-table" });
		const table = wrap.createEl("table");
		const head = table.createEl("thead").createEl("tr");
		for (const column of columns) head.createEl("th", { text: column });
		if (withActions) head.createEl("th").createSpan({ cls: "ai-agent-panel-visually-hidden", text: "Actions" });
		const body = table.createEl("tbody");
		const rows = section.rows.map((row) => {
			const tr = body.createEl("tr");
			columns.forEach((_, i) => {
				const td = tr.createEl("td");
				if (i === 0 && row.status) {
					// The dot stays on its name's line.
					const named = td.createSpan({ cls: "ai-agent-panel-report-named" });
					dot(named, row.status);
					named.appendText(row.cells[0] ?? "");
				} else td.appendText(row.cells[i] ?? "");
			});
			if (withActions) this.actionButtons(tr.createEl("td", { cls: "ai-agent-panel-report-actions" }), row);
			return tr;
		});
		this.fold(wrap, section, rows);
	}

	/** A section as the boards' row list, per `section.list`; the rows past its fold behind "Show all N". */
	private drawList(parent: HTMLElement, section: ReportSection): void {
		const list = parent.createDiv({ cls: "ai-agent-panel-report-rows" });
		// A list of its rows; /help's groups are lists each, named by their label, and the figure is none.
		if (section.list !== "commands" && section.list !== "figure") list.setAttr("role", "list");
		let rows: HTMLElement[];
		switch (section.list) {
			case "servers":
				rows = section.rows.map((row) => this.serverRow(list, row));
				break;
			case "commands":
				rows = commandGroups(section.rows).flatMap((group) => {
					const label = group.label
						? list.createDiv({ cls: "ai-agent-panel-report-group", text: group.label, attr: { id: `${this.titleId}-group-${nextGroupId++}` } })
						: null;
					const groupEl = list.createDiv({ cls: "ai-agent-panel-report-group-rows", attr: { role: "list" } });
					if (label) groupEl.setAttr("aria-labelledby", label.id);
					return group.rows.map((row) => this.commandRow(groupEl, row));
				});
				break;
			case "tiles":
				list.addClass("is-tiles");
				rows = section.rows.map((row) => {
					const { value, label } = tile(row);
					const el = list.createDiv({ cls: "ai-agent-panel-report-stat", attr: { role: "listitem" } });
					el.createSpan({ cls: "ai-agent-panel-report-stat-value", text: value });
					el.createSpan({ cls: "ai-agent-panel-report-stat-label", text: label });
					return el;
				});
				break;
			case "figure":
				rows = section.rows.map((row) => drawFigure(list, { value: row.cells[1] ?? "" }));
				break;
			case "skills": {
				const segments = skillBar(section.rows);
				if (segments.length) {
					const bar = list.createDiv({ cls: "ai-agent-panel-report-skill-bar", attr: { "aria-hidden": "true" } });
					for (const segment of segments)
						bar.createDiv({ cls: `ai-agent-panel-report-skill-segment is-step-${segment.step}` }).setCssProps({
							"--ai-agent-panel-segment-share": `${segment.share}%`,
						});
				}
				rows = section.rows.map((row) => drawRow(list, section.list, row));
				break;
			}
			default:
				rows = section.rows.map((row) => drawRow(list, section.list, row));
		}
		// "Show all N" follows the list, not inside it: a list holds only its items.
		this.fold(parent, section, rows);
	}

	/** /mcp's row: name, status pill, meta and error; Reconnect, Enable or Disable, labelled or icon-only. */
	private serverRow(list: HTMLElement, row: ReportRow): HTMLElement {
		const server = serverRow(row);
		const el = list.createDiv({ cls: "ai-agent-panel-report-row is-server", attr: { role: "listitem" } });
		const main = el.createDiv({ cls: "ai-agent-panel-report-row-main" });
		const title = main.createDiv({ cls: "ai-agent-panel-report-row-title" });
		title.createSpan({ cls: `ai-agent-panel-report-name${server.muted ? " is-muted" : ""}`, text: server.name });
		pill(title, server.pill, server.tone);
		if (server.own) pill(title, "this panel", "accent");
		if (server.meta) main.createDiv({ cls: "ai-agent-panel-report-meta", text: server.meta });
		if (server.detail) main.createDiv({ cls: "ai-agent-panel-report-detail", text: server.detail });
		for (const button of server.buttons) {
			const focus = rowFocus(server.name, button.action.label);
			const onClick = () => this.callbacks.onAction(button.action);
			const control = button.labelled
				? this.rowButton(el, button.action, focus, button.icon)
				: this.iconButton(el, [button.icon], `${button.action.label} ${server.name}`, focus.key, onClick);
			control.dataset.focusRow = focus.row;
		}
		return el;
	}

	/** /help's row: the command in mono and its hint, the description on one line; a click puts it in the message. */
	private commandRow(list: HTMLElement, row: ReportRow): HTMLElement {
		const { name, hint, description } = commandRow(row);
		const insert = row.insert;
		const item = list.createDiv({ cls: "ai-agent-panel-report-command-item", attr: { role: "listitem" } });
		if (insert === undefined) {
			drawCommandParts(item.createDiv({ cls: "ai-agent-panel-report-command" }), name, hint, description);
			return item;
		}
		// Named by what it does: content, not an `aria-label`, which would show a tooltip (PRD-001.R32).
		const button = item.createEl("button", { cls: "ai-agent-panel-report-command", attr: { type: "button" } });
		button.createSpan({ cls: "ai-agent-panel-visually-hidden", text: `Put /${insert} in the message:` });
		drawCommandParts(button, name, hint, description);
		button.addEventListener("click", () => this.callbacks.onInsert(insert));
		return item;
	}

	/** Hides the rows past the section's fold behind "Show all N"; its click shows them and focuses the first. */
	private fold(parent: HTMLElement, section: ReportSection, rows: readonly HTMLElement[]): void {
		const shown = foldedAt(section);
		if (shown === null) return;
		for (const row of rows.slice(shown)) row.hide();
		const more = parent.createEl("button", { cls: "ai-agent-panel-report-more", attr: { type: "button" } });
		more.appendText(`Show all ${rows.length}`);
		drawIcon(more.createSpan({ cls: "ai-agent-panel-report-button-icon", attr: { "aria-hidden": "true" } }), ["chevron-down"]);
		more.addEventListener("click", () => {
			for (const row of rows) row.show();
			more.remove();
			// The button goes: focus moves to the first row it showed.
			// A /help row's button, else the row itself.
			const first = rows[shown].querySelector<HTMLElement>(":scope > button") ?? rows[shown];
			if (!first.matches("button")) first.setAttr("tabindex", "-1");
			first.focus();
		});
	}

	private actionButtons(parent: HTMLElement, row: ReportRow): void {
		const name = row.cells[0] ?? "";
		for (const action of row.actions ?? []) this.rowButton(parent, action, rowFocus(name, action.label), null);
	}

	/** A row's labelled button, found again after a redraw by its focus keys. */
	private rowButton(
		parent: HTMLElement,
		action: ReportAction,
		focus: { key: string; row: string },
		icon: string | null
	): HTMLElement {
		const button = parent.createEl("button", { cls: "ai-agent-panel-report-row-action", attr: { type: "button" } });
		if (icon) drawIcon(button.createSpan({ cls: "ai-agent-panel-report-button-icon", attr: { "aria-hidden": "true" } }), [icon]);
		button.appendText(action.label);
		// Kept as data, not markup: the row's name is a CLI string.
		button.dataset.focus = focus.key;
		button.dataset.focusRow = focus.row;
		button.addEventListener("click", () => this.callbacks.onAction(action));
		return button;
	}

	private iconButton(parent: HTMLElement, names: readonly string[], label: string, focus: string, onClick: () => void): HTMLElement {
		const button = parent.createEl("button", {
			cls: "clickable-icon ai-agent-panel-report-icon-button",
			attr: { type: "button" },
		});
		button.dataset.focus = focus;
		drawIcon(button, names);
		// Names it too: `setTooltip` sets `aria-label`.
		setTooltip(button, label, { delay: 400 });
		button.addEventListener("click", onClick);
		return button;
	}
}

/** A row button's focus keys: the button, and its row for when the button is gone. */
function rowFocus(name: string, label: string): { key: string; row: string } {
	return { key: `row:${name}:${label}`, row: `row:${name}` };
}

/** A status dot, its state also in its accessible text (PRD-001.R28). */
function dot(parent: HTMLElement, status: ReportStatus): void {
	parent.createSpan({ cls: `ai-agent-panel-report-dot is-${status}`, attr: { role: "img", "aria-label": STATUS_WORDS[status] } });
}

/** A dot whose state the text beside it already says: hidden from assistive tech. */
function marker(parent: HTMLElement, status: ReportStatus): void {
	parent.createSpan({ cls: `ai-agent-panel-report-dot is-${status}`, attr: { "aria-hidden": "true" } });
}

/** A pill: its text says its state; the tone colors it. */
function pill(parent: HTMLElement, text: string, tone: ReportStatus | "accent" | "event" | undefined): void {
	parent.createSpan({ cls: `ai-agent-panel-report-pill is-${tone ?? "off"}`, text });
}

const STATUS_WORDS: Readonly<Record<ReportStatus, string>> = {
	ok: "OK",
	warn: "Warning",
	error: "Failed",
	off: "Off",
};

/** A link opened by `ui/messages`' link handler, which hands only http(s), mailto and obsidian to the OS. */
function drawLink(parent: HTMLElement, link: ReportLink, cls: string): void {
	const a = parent.createEl("a", { cls: `${cls} external-link`, href: link.href, text: link.label });
	drawIcon(a.createSpan({ cls: "ai-agent-panel-report-link-icon", attr: { "aria-hidden": "true" } }), LINK_ICON);
}

/** A large figure, its caption, and a figure at the line's end. */
function drawFigure(parent: HTMLElement, figure: ReportFigure): HTMLElement {
	const el = parent.createDiv({ cls: "ai-agent-panel-report-figure" });
	el.createSpan({ cls: "ai-agent-panel-report-figure-value", text: figure.value });
	if (figure.caption) el.createSpan({ cls: "ai-agent-panel-report-figure-caption", text: figure.caption });
	if (figure.aside) el.createSpan({ cls: "ai-agent-panel-report-figure-aside", text: figure.aside });
	return el;
}

/** A value's text with a break opportunity after each "/"; the text itself is unchanged. */
function appendBreakable(parent: HTMLElement, text: string): void {
	pathSegments(text).forEach((piece, i) => {
		if (i > 0) parent.createEl("wbr");
		parent.appendText(piece);
	});
}

/**
 * Key/value rows, separated by lines: the key muted, the value after its
 * dot, in mono when it is a path, an id, a version or an amount, a closing
 * "(…)" as a quieter aside.
 */
function drawPairs(
	parent: HTMLElement,
	rows: readonly ReportRow[],
	actions: (value: HTMLElement, row: ReportRow) => void
): void {
	const list = parent.createDiv({ cls: "ai-agent-panel-report-pairs" });
	for (const row of rows) {
		const [label, ...values] = row.cells;
		list.createDiv({ cls: "ai-agent-panel-report-key", text: label ?? "" });
		const value = list.createDiv({ cls: "ai-agent-panel-report-value" });
		if (row.status) dot(value, row.status);
		const text = values.join(" · ");
		const aside = /^(.*\S) (\([^()]+\))$/.exec(text);
		const main = aside ? aside[1] : text;
		appendBreakable(value.createSpan({ cls: codeLike(main) ? "ai-agent-panel-report-code" : "" }), main);
		if (aside) value.createSpan({ cls: "ai-agent-panel-report-aside", text: ` ${aside[2]}` });
		if (row.actions?.length) actions(value, row);
	}
}

/** One bar per row: label, the figure, the bar tinted by its threshold, the sub-line (PRD-005.R6). */
function drawBars(parent: HTMLElement, bars: readonly ReportBar[]): void {
	const list = parent.createDiv({ cls: "ai-agent-panel-report-bars" });
	for (const bar of bars) {
		const row = list.createDiv({ cls: `ai-agent-panel-report-bar-row is-${bar.tint}` });
		const line = row.createDiv({ cls: "ai-agent-panel-report-bar-line" });
		line.createSpan({ cls: "ai-agent-panel-report-bar-label", text: bar.label });
		const value = line.createSpan({ cls: "ai-agent-panel-report-bar-value" });
		if (bar.status) dot(value, bar.status);
		value.appendText(bar.value ?? `${bar.percent ?? 0}%`);
		if (bar.percent !== null) meterBar(row, bar.percent);
		if (bar.sub) row.createDiv({ cls: "ai-agent-panel-report-bar-sub", text: bar.sub });
	}
}

/** Bars as key/value rows (/usage-credits): the figure after its dot, the sub-line beside it, the bar under them. */
function drawBarPairs(parent: HTMLElement, bars: readonly ReportBar[]): void {
	const list = parent.createDiv({ cls: "ai-agent-panel-report-pairs" });
	for (const bar of bars) {
		list.createDiv({ cls: "ai-agent-panel-report-key", text: bar.label });
		const value = list.createDiv({ cls: `ai-agent-panel-report-value ai-agent-panel-report-bar-row is-${bar.tint}` });
		const line = value.createDiv();
		if (bar.status) dot(line, bar.status);
		const figure = bar.value ?? `${bar.percent ?? 0}%`;
		line.createSpan({ cls: codeLike(figure) ? "ai-agent-panel-report-code" : "", text: figure });
		if (bar.sub) line.createSpan({ cls: "ai-agent-panel-report-aside", text: ` · ${bar.sub}` });
		if (bar.percent !== null) meterBar(value, bar.percent);
	}
}

/** One row of a list; its parts read from the builder's cells (DES-003 Report cards). */
function drawRow(list: HTMLElement, kind: ReportSection["list"], row: ReportRow): HTMLElement {
	const [first = "", second = "", third = "", fourth = ""] = row.cells;
	const el = list.createDiv({ cls: `ai-agent-panel-report-row is-${kind ?? "rules"}`, attr: { role: "listitem" } });
	switch (kind) {
		case "hooks": {
			// Event, Matcher, Runs, Defined in.
			const line = el.createDiv({ cls: "ai-agent-panel-report-row-title" });
			pill(line, first, "event");
			// The matcher is named for assistive tech; sighted readers see it beside the event.
			const matcher = line.createSpan({ cls: "ai-agent-panel-report-code" });
			matcher.createSpan({ cls: "ai-agent-panel-visually-hidden", text: "matcher " });
			matcher.appendText(second);
			line.createSpan({ cls: "ai-agent-panel-report-meta", text: fourth });
			el.createDiv({ cls: "ai-agent-panel-report-code ai-agent-panel-report-command-line", text: third });
			break;
		}
		case "skills":
			// Skill, Source, Tokens, State.
			marker(el, row.status === "ok" ? "ok" : "off");
			el.createSpan({ cls: `ai-agent-panel-report-code ai-agent-panel-report-name${row.status === "ok" ? "" : " is-muted"}`, text: first });
			el.createSpan({ cls: "ai-agent-panel-report-meta ai-agent-panel-report-source", text: second });
			if (third) {
				const tokens = el.createSpan({ cls: "ai-agent-panel-report-tokens", text: third });
				tokens.createSpan({ cls: "ai-agent-panel-visually-hidden", text: " tokens" });
			} else el.createSpan({ cls: "ai-agent-panel-report-tokens" });
			pill(el, fourth, row.status === "ok" ? "ok" : "off");
			break;
		case "files": {
			// File, Path, Exists.
			const main = el.createDiv({ cls: "ai-agent-panel-report-row-main" });
			main.createSpan({ cls: `ai-agent-panel-report-name${row.status === "off" ? " is-muted" : ""}`, text: first });
			appendBreakable(main.createSpan({ cls: "ai-agent-panel-report-code ai-agent-panel-report-meta" }), second);
			pill(el, row.pill ?? third, row.status);
			break;
		}
		case "memories":
			// Memory, Description.
			el.createSpan({ cls: "ai-agent-panel-report-code ai-agent-panel-report-name", text: first });
			el.createSpan({ cls: "ai-agent-panel-report-description", text: second });
			break;
		default:
			// A rule or a directory, and where it comes from.
			appendBreakable(el.createSpan({ cls: "ai-agent-panel-report-code ai-agent-panel-report-name" }), first);
			if (second) el.createSpan({ cls: "ai-agent-panel-report-meta", text: second });
	}
	return el;
}

function drawCommandParts(parent: HTMLElement, name: string, hint: string, description: string): void {
	parent.createSpan({ cls: "ai-agent-panel-report-command-name", text: name, attr: { "aria-hidden": "true" } });
	const text = parent.createSpan({ cls: "ai-agent-panel-report-command-description" });
	if (hint) text.createSpan({ cls: "ai-agent-panel-report-command-hint", text: `${hint} ` });
	text.appendText(description);
}

/** Context-window occupancy: the categories colored by name, free space, the reserve hatched; its legend in two columns. */
function drawMeter(parent: HTMLElement, meter: NonNullable<CommandReport["meter"]>): void {
	const { bar, legend } = meterParts(meter);
	const meterEl = parent.createDiv({ cls: "ai-agent-panel-report-meter", attr: { "aria-hidden": "true" } });
	for (const part of bar) {
		const segment = meterEl.createDiv({ cls: `ai-agent-panel-report-segment ${swatchClass(part)}` });
		if (part.share !== null) segment.setCssProps({ "--ai-agent-panel-segment-share": `${part.share}%` });
	}
	const legendEl = parent.createDiv({ cls: "ai-agent-panel-report-legend" });
	for (const part of legend) {
		const item = legendEl.createDiv({ cls: "ai-agent-panel-report-legend-item" });
		item.createSpan({ cls: `ai-agent-panel-report-swatch ${swatchClass(part)}`, attr: { "aria-hidden": "true" } });
		item.createSpan({ cls: "ai-agent-panel-report-legend-label", text: part.label });
		item.createSpan({ cls: "ai-agent-panel-report-legend-value", text: formatTokens(part.tokens) });
	}
}

function swatchClass(part: MeterPart): string {
	return typeof part.swatch === "number" ? `is-c${part.swatch}` : `is-${part.swatch}`;
}
