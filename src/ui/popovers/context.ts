import { Component } from "obsidian";
import { CACHE_NOTE, cacheSection, COMPACT_TITLE } from "../../state/cache-surfaces";
import { cachePeriodMs, countdownTicks, type CacheView } from "../../state/prompt-cache";
import type { ContextPopoverView } from "../../state/status-line";
import type { Ticker } from "../../state/ticker";
import { drawIcon } from "../../icon";
import { COMPACT_ICON } from "../../state/agent-icon";
import { writeAttr, writeIcon, writeText, writeTooltip, type PopoverContent, type PopoverFocus, type PopoverShell } from "../dom";

/** What the popover needs of its tab. */
export interface ContextPopoverSource {
	/** Runs `/context`; false when the tab cannot run it now. */
	onDetails: () => boolean;
	/** Sends `/compact`; false when the tab cannot send now. */
	onCompact: () => boolean;
	/** The prompt cache now; null before any response reported it. */
	cache: () => CacheView | null;
	/** Whether `/compact` can be sent now (`compactAllowed`); Compact is disabled otherwise. */
	canCompact: () => boolean;
	/** The shared ticker, which redraws the countdown. */
	ticker: Ticker;
	/** Calls the listener when the tab's activity or status changes; returns the removal. */
	onChange: (listener: () => void) => () => void;
}

interface CacheParts {
	section: HTMLElement;
	icon: HTMLElement;
	state: HTMLElement;
	time: HTMLElement;
	fill: HTMLElement;
	bar: HTMLElement;
	cached: HTMLElement;
	expires: HTMLElement;
	ttl: HTMLElement;
}

/**
 * "Context" (PRD-005.R8): the model and window size in the header, the tokens
 * used with the percentage, a bar and legend by category, the autocompact
 * point, the prompt cache's section (PRD-005.R11), "/context details", which
 * runs `/context`, and Compact, which sends `/compact`.
 */
export class ContextPopover extends Component implements PopoverContent {
	readonly title = "Context";
	readonly cls = "mod-context";
	private cacheParts: CacheParts | null = null;
	private compact: HTMLButtonElement | null = null;
	/** The cache as last drawn. */
	private drawn: CacheView | null = null;

	constructor(
		private readonly view: ContextPopoverView,
		private readonly source: ContextPopoverSource
	) {
		super();
	}

	render(el: HTMLElement, picked: () => void, shell: PopoverShell): PopoverFocus {
		const { view } = this;
		if (view.window) shell.meta().createSpan({ cls: "ai-agent-panel-popover-meta-text", text: view.window });
		if (view.used !== null) {
			const summary = el.createDiv({ cls: "ai-agent-panel-context-summary" });
			summary.createSpan({ cls: "ai-agent-panel-context-used", text: view.used });
			if (view.ofWindow !== null) summary.createSpan({ cls: "ai-agent-panel-context-of", text: view.ofWindow });
			if (view.percent !== null)
				summary.createSpan({ cls: "ai-agent-panel-context-percent", text: `${view.percent}%` });
			const bar = el.createDiv({
				cls: "ai-agent-panel-context-bar",
				attr: { role: "img", "aria-label": `Context window: ${view.percent ?? 0}% used` },
			});
			// The free space is the bar's rest, ahead of the autocompact reserve at its end.
			const reserved = view.bar.findIndex((segment) => segment.swatch === "reserved");
			const free = reserved < 0 ? view.bar.length : reserved;
			view.bar.forEach((segment, at) => {
				if (at === free) bar.createDiv({ cls: "ai-agent-panel-context-share mod-free" });
				bar.createDiv({ cls: `ai-agent-panel-context-share mod-${segment.swatch}` }).setCssProps({
					"--ai-agent-panel-context-share": `${Math.min(100, segment.share)}%`,
				});
			});
			if (free === view.bar.length) bar.createDiv({ cls: "ai-agent-panel-context-share mod-free" });
			const legend = el.createEl("ul", { cls: "ai-agent-panel-context-legend" });
			for (const entry of view.legend) {
				const item = legend.createEl("li");
				item.createSpan({ cls: `ai-agent-panel-context-swatch mod-${entry.swatch}` });
				item.appendText(`${entry.name} ${entry.tokens}`);
			}
			if (view.autoCompact) el.createDiv({ cls: "ai-agent-panel-context-compact", text: view.autoCompact });
		}
		if (view.note) el.createDiv({ cls: "ai-agent-panel-popover-note", text: view.note });
		this.renderCacheSection(el);
		const footer = shell.footer();
		const details = footer.createEl("button", { cls: "ai-agent-panel-text-button", attr: { type: "button" } });
		details.createSpan({ cls: "ai-agent-panel-text-button-mono", text: "/context" });
		details.appendText(" details");
		this.registerDomEvent(details, "click", () => {
			if (this.source.onDetails()) picked();
		});
		const compact = footer.createEl("button", {
			cls: "ai-agent-panel-text-button mod-compact",
			attr: { type: "button" },
		});
		drawIcon(compact.createSpan({ cls: "ai-agent-panel-text-button-icon", attr: { "aria-hidden": "true" } }), [COMPACT_ICON, "fold-vertical"]);
		compact.appendText("Compact");
		writeTooltip(compact, COMPACT_TITLE);
		this.compact = compact;
		this.registerDomEvent(compact, "click", () => {
			if (!compact.disabled && this.source.onCompact()) picked();
		});
		// A change of the tab's activity or of its cache redraws the section and the button.
		this.register(this.source.onChange(() => this.draw()));
		this.draw();
		return { first: details };
	}

	/** The "Prompt cache" section: state, time left, a bar, the cached tokens, the expiry and the lifetime, then the estimate note. */
	private renderCacheSection(el: HTMLElement): void {
		const section = el.createDiv({ cls: "ai-agent-panel-popover-section mod-cache" });
		const head = section.createDiv({ cls: "ai-agent-panel-cache-head" });
		const icon = head.createSpan({ cls: "ai-agent-panel-cache-icon", attr: { "aria-hidden": "true" } });
		head.createSpan({ cls: "ai-agent-panel-cache-title", text: "Prompt cache" });
		const state = head.createSpan({ cls: "ai-agent-panel-cache-state" });
		const time = head.createSpan({ cls: "ai-agent-panel-cache-time" });
		const bar = section.createDiv({ cls: "ai-agent-panel-cache-bar", attr: { role: "img" } });
		const fill = bar.createDiv({ cls: "ai-agent-panel-cache-fill" });
		const rows = section.createDiv({ cls: "ai-agent-panel-cache-rows" });
		const row = (label: string) => {
			const line = rows.createDiv({ cls: "ai-agent-panel-cache-row" });
			line.createSpan({ cls: "ai-agent-panel-cache-row-label", text: label });
			return line.createSpan({ cls: "ai-agent-panel-cache-row-value" });
		};
		const cached = row("Cached");
		const expiresRow = row("Expires");
		const expires = expiresRow.createSpan();
		const ttl = expiresRow.createSpan({ cls: "ai-agent-panel-cache-ttl" });
		section.createDiv({ cls: "ai-agent-panel-popover-note", text: CACHE_NOTE });
		this.cacheParts = { section, icon, state, time, fill, bar, cached, expires, ttl };
		this.register(
			this.source.ticker.subscribe({
				// From the view last drawn: the draw that turns it cold is the last one.
				shown: () => countdownTicks(this.drawn),
				periodMs: () => (this.drawn ? cachePeriodMs(this.drawn) : 1000),
				phase: () => this.drawn?.expiresAt ?? null,
				tick: () => this.draw(),
			})
		);
	}

	/** Redraws in place, so a focused control is kept. */
	private draw(): void {
		const parts = this.cacheParts;
		const view = this.source.cache();
		this.drawn = view;
		if (parts) {
			parts.section.toggle(view !== null);
			if (view) {
				const section = cacheSection(view);
				parts.section.dataset.state = section.state;
				writeIcon(parts.icon, view.state === "cold" ? "zap-off" : "zap");
				writeText(parts.state, section.stateLabel);
				writeText(parts.time, section.left);
				parts.fill.setCssProps({ "--ai-agent-panel-cache-fraction": `${Math.round(section.fraction * 1000) / 10}%` });
				writeAttr(parts.bar, "aria-label", section.barLabel);
				writeText(parts.cached, section.cached);
				writeText(parts.expires, section.expires);
				writeText(parts.ttl, ` · ${section.lifetime}`);
			}
		}
		if (this.compact) {
			const blocked = !this.source.canCompact();
			if (this.compact.disabled !== blocked) this.compact.disabled = blocked;
		}
		// The countdown starts, ends or changes its period with the draw.
		this.source.ticker.check();
	}
}
