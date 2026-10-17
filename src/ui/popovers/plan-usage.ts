import { Component } from "obsidian";
import { usagePopover, type UsageThresholds } from "../../state/usage-segment";
import type { UsageSnapshot } from "../../usage-core";
import { meterBar } from "../../icon";
import { iconButton, writeText, type PopoverContent, type PopoverFocus, type PopoverShell } from "../dom";

/** The usage service as the popover reads it. */
export interface PlanUsageSource {
	usage: {
		readonly snapshot: UsageSnapshot | null;
		readonly lastError: string | null;
		/** A request is in flight: Refresh stays disabled until it settles. */
		readonly refreshing: boolean;
		/** Called whenever a request settles and on every timer tick. */
		subscribe(listener: () => void): () => void;
	};
	thresholds: () => UsageThresholds;
}

export interface PlanUsageIntents {
	/** Request usage; forced past the cache and the back-off, never the 10 s floor. */
	onRefresh: (force: boolean) => void;
	/** Run `/usage` in the conversation; false when the tab cannot run it now. */
	onRunUsage: () => boolean;
}

const SETTINGS_URL = "https://claude.ai/settings/usage";

/**
 * "Plan usage" (PRD-005.R5): "as of HH:MM" or the failure line, Refresh, a
 * bar per reported window, the extra-usage line, "/usage in chat" and the
 * usage settings link. It requests usage when it opens and redraws on every
 * settled request while it shows.
 */
export class PlanUsagePopover extends Component implements PopoverContent {
	readonly title = "Plan usage";
	readonly cls = "mod-usage";
	private parts: { status: HTMLElement; refresh: HTMLButtonElement; bars: HTMLElement; extra: HTMLElement } | null = null;

	constructor(
		private readonly source: PlanUsageSource,
		private readonly intents: PlanUsageIntents
	) {
		super();
	}

	onload(): void {
		this.register(this.source.usage.subscribe(() => this.draw()));
		// After a failure the segment says "click to retry": retry, the 10 s floor permitting.
		this.intents.onRefresh(this.source.usage.lastError !== null);
	}

	render(el: HTMLElement, picked: () => void, shell: PopoverShell): PopoverFocus {
		const meta = shell.meta();
		const status = meta.createDiv({ cls: "ai-agent-panel-usage-status" });
		const refresh = iconButton(this, meta, "refresh-cw", "Refresh", () => {
			this.intents.onRefresh(true);
			this.draw();
		});
		const bars = el.createDiv({ cls: "ai-agent-panel-usage-bars" });
		const extra = el.createDiv({ cls: "ai-agent-panel-usage-extra" });
		this.parts = { status, refresh, bars, extra };
		const footer = shell.footer();
		const run = footer.createEl("button", { cls: "ai-agent-panel-text-button", attr: { type: "button" } });
		run.createSpan({ cls: "ai-agent-panel-text-button-mono", text: "/usage" });
		run.appendText(" in chat");
		// It stays open when the tab cannot run the command, as the composer keeps a command it cannot send.
		this.registerDomEvent(run, "click", () => {
			if (this.intents.onRunUsage()) picked();
		});
		footer.createEl("a", {
			cls: "ai-agent-panel-text-button ai-agent-panel-usage-settings external-link",
			text: "Usage settings ↗",
			href: SETTINGS_URL,
			attr: { target: "_blank", rel: "noopener" },
		});
		this.draw();
		// The request made on open disables Refresh until it settles.
		return { first: refresh.disabled ? run : refresh };
	}

	/** Redraws in place, so a focused control is kept. */
	private draw(): void {
		const parts = this.parts;
		if (!parts) return;
		const { usage, thresholds } = this.source;
		const view = usagePopover(usage.snapshot, usage.lastError, thresholds(), Date.now());
		writeText(parts.status, view.status);
		parts.status.toggleClass("is-failed", view.failed);
		parts.refresh.disabled = usage.refreshing;
		parts.bars.empty();
		for (const bar of view.bars) {
			const row = parts.bars.createDiv({ cls: `ai-agent-panel-usage-bar mod-${bar.level}` });
			const top = row.createDiv({ cls: "ai-agent-panel-usage-bar-head" });
			top.createSpan({ cls: "ai-agent-panel-usage-bar-title", text: bar.title });
			top.createSpan({ cls: "ai-agent-panel-usage-bar-percent", text: `${bar.percent}%` });
			meterBar(row, bar.percent);
			if (bar.reset) row.createDiv({ cls: "ai-agent-panel-usage-bar-reset", text: bar.reset });
		}
		if (view.empty) parts.bars.createDiv({ cls: "ai-agent-panel-popover-note", text: view.empty });
		writeText(parts.extra, view.extra ?? "");
		parts.extra.toggle(view.extra !== null);
	}
}
