import { Component, type Events } from "obsidian";
import { effortChoices, modelOptions, type CliModel } from "../models";
import { defaultProfile, offeredModes, profileById, type AgentPanelSettings, type MenuMode } from "../settings-core";
import {
	contextHover,
	contextPopover,
	contextSegment,
	effortSegment,
	fitStep,
	hiddenWidths,
	modelSegment,
	modeSegment,
	profileSegment,
	SEGMENT_ORDER,
	shownMode,
	usageSegmentVisible,
	type CacheSegmentView,
	type FitStep,
	type MeasuredWidths,
	type SegmentKind,
	type SegmentView,
	type SegmentWidths,
} from "../state/status-line";
import { cachePeriodMs, cacheView, type CacheView } from "../state/prompt-cache";
import type { Activity, StatusData, TabEvent } from "../state/tab";
import type { Ticker } from "../state/ticker";
import { usageHover, usageSegment, usageThresholds } from "../state/usage-segment";
import type { UsageService } from "../usage-core";
import {
	Follower,
	hiddenText,
	onOwnDocument,
	writeIcon,
	writeText,
	writeTooltip,
	type AttachHoverCard,
	type HoverCardHandle,
	type OpenPopover,
} from "./dom";
import { ContextPopover } from "./popovers/context";
import { EFFORT_CONTROL, ModelEffortPopover } from "./popovers/model-effort";
import { PermissionPopover } from "./popovers/permission";
import { PlanUsagePopover } from "./popovers/plan-usage";
import { ProfilePopover } from "./popovers/profile";
import type { ResizeMeasure, ResizePass } from "./shell";

/** What the status line reads of a tab, and its `status` and `activity` events. */
export type StatusTab = Events & {
	readonly activity: Activity;
	readonly status: Readonly<StatusData>;
};

export interface StatusLineSource {
	/** The view's events: `active`. */
	viewEvents: Events;
	/** The plugin's events: `settings`. */
	settingsEvents: Events;
	/** The workspace's events: `layout-change`, `active-leaf-change` and `resize`, on which polling is re-checked. */
	workspaceEvents: Events;
	activeTab: () => StatusTab | null;
	settings: () => AgentPanelSettings;
	cliModelsFor: (profileId: string) => CliModel[] | null;
	/** The plugin's usage service: its snapshot, and where the line reports its plan-usage segment (DES-007 Scheduling). */
	usage: UsageService;
	/** `ui/shell`'s resize pass, in which the line fits itself (DES-003 Status line). */
	resizePass: ResizePass;
	/** The shared ticker, which redraws the prompt cache's countdown (PRD-005.R11). */
	ticker: Ticker;
}

/** Picks and commands name the tab whose popover was open. */
export interface StatusLineIntents {
	/** The popover host (DES-003 Modules). */
	openPopover: OpenPopover;
	/** The hover-card host (DES-003 Modules). */
	attachHoverCard: AttachHoverCard;
	onPickModel: (tab: StatusTab, value: string) => void;
	onPickEffort: (tab: StatusTab, value: string) => void;
	onPickMode: (tab: StatusTab, mode: MenuMode) => void;
	onPickProfile: (tab: StatusTab, profileId: string) => void;
	/** Request plan usage; `force` skips the cache and the back-off, not the 10 s floor. */
	onRefreshUsage: (force: boolean) => void;
	/** Run a panel command, such as `/usage` or `/context`, in the tab; false when the tab cannot run one now. */
	onRunCommand: (tab: StatusTab, name: string) => boolean;
	/** Send `/compact` through the send path; false when the tab cannot send now (PRD-005.R11). */
	onCompact: (tab: StatusTab) => boolean;
	/** Whether `/compact` can be sent now (`compactAllowed`). */
	canCompact: (tab: StatusTab) => boolean;
}

type MenuKind = Exclude<SegmentKind, "context" | "usage">;

interface Segment {
	el: HTMLElement;
	/** The accessible name, which `aria-labelledby` points at, so the tooltip can differ. */
	labelEl: HTMLElement;
	iconEl: HTMLElement;
	/** The label wrapper a fit step collapses; it holds the short and long strings. */
	textEl: HTMLElement;
	shortEl: HTMLElement;
	longEl: HTMLElement;
	/** What the label shows, so its width is read once per change. */
	key: string;
	shown: boolean;
}

/** Step 4 hides the plan-usage segment (PRD-001.R31). */
const USAGE_HIDDEN_STEP = 4;

let nextLineId = 0;

/**
 * The active tab's status line under the composer (DES-003 Status line):
 * model, effort, permission, profile, context and plan usage, shortened in
 * PRD-001.R31's steps to fit one line. Each segment opens its popover; the
 * context and plan-usage segments have hover cards. The line reports its
 * plan-usage segment's visibility to the usage service (PRD-005.R3).
 */
export class StatusLine extends Component implements ResizeMeasure {
	private readonly lineEl: HTMLElement;
	private readonly segments = new Map<MenuKind, Segment>();
	private readonly contextEl: HTMLButtonElement;
	private readonly contextLabelEl: HTMLElement;
	/** The ring's progress arc. */
	private readonly ringEl: SVGCircleElement;
	/** The percentage's wrapper, which step 5 collapses. */
	private readonly contextTextEl: HTMLElement;
	private readonly contextValueEl: HTMLElement;
	/** The prompt cache's divider, bolt and countdown, after the percentage (PRD-005.R11). */
	private readonly cacheEl: HTMLElement;
	private readonly cacheIconEl: HTMLElement;
	private readonly cacheTimeEl: HTMLElement;
	/** What the cache part shows, for the measure key. */
	private cacheKey = "";
	/** The cache as last drawn; null when none shows. */
	private cacheDrawn: CacheView | null = null;
	private contextShown = false;
	private readonly usageEl: HTMLButtonElement;
	private readonly usageLabelEl: HTMLElement;
	private readonly usageItemsEl: HTMLElement;
	private contextCard: HoverCardHandle | null = null;
	/** The open hover card's cache text, updated in place by the ticker; null when it shows none. */
	private hoverCacheEl: HTMLElement | null = null;
	private usageCard: HoverCardHandle | null = null;
	private readonly tab: Follower<StatusTab, TabEvent>;
	/** A snapshot arrived while the segment could not be seen. */
	private usageStale = false;
	/** What the line last reported to the usage service. */
	private usageVisible = false;
	/** The permission segment is red (Auto-approve, Bypass): step 3 is skipped. */
	private permissionWarn = false;
	private readonly measured = new Map<SegmentKind, MeasuredWidths>();
	private gap: number | null = null;
	private step: FitStep = 0;
	private nextStep: FitStep = 0;
	/** The plan-usage segment is rendered: not hidden by a fit step, the 360 px rule or a hidden panel. */
	private usageShown = false;
	private nextUsageShown = false;
	/** The line was rendered at the last read. */
	private lineShown = false;

	constructor(
		parent: HTMLElement,
		private readonly source: StatusLineSource,
		private readonly intents: StatusLineIntents
	) {
		super();
		this.tab = new Follower<StatusTab, TabEvent>(this, { status: () => this.render() });
		const id = `ai-agent-panel-status-${++nextLineId}`;
		this.lineEl = parent.createDiv({ cls: "ai-agent-panel-status-line is-fit-0", attr: { role: "group" } });
		hiddenText(this.lineEl, "aria-labelledby", "Conversation status");
		let context: {
			el: HTMLButtonElement;
			labelEl: HTMLElement;
			ringEl: SVGCircleElement;
			textEl: HTMLElement;
			cacheEl: HTMLElement;
		} | null = null;
		let usage: { el: HTMLButtonElement; labelEl: HTMLElement; itemsEl: HTMLElement } | null = null;
		for (const kind of SEGMENT_ORDER) {
			const el = this.lineEl.createEl("button", {
				cls: `ai-agent-panel-status-segment mod-${kind}`,
				attr: {
					type: "button",
					"aria-labelledby": `${id}-${kind}`,
					"aria-haspopup": "dialog",
					"aria-expanded": "false",
				},
			});
			const labelEl = el.createSpan({ cls: "ai-agent-panel-visually-hidden", attr: { id: `${id}-${kind}` } });
			this.registerDomEvent(el, "click", () => this.openPopover(kind, el));
			if (kind === "context") {
				el.addClass("is-hidden");
				const svg = el.createSvg("svg", {
					cls: "ai-agent-panel-status-ring",
					attr: { viewBox: "0 0 16 16", "aria-hidden": "true" },
				});
				svg.createSvg("circle", { cls: "ai-agent-panel-status-ring-track", attr: { cx: 8, cy: 8, r: 6 } });
				const ringEl = svg.createSvg("circle", {
					cls: "ai-agent-panel-status-ring-fill",
					attr: { cx: 8, cy: 8, r: 6, pathLength: 100, "stroke-dasharray": "0 100" },
				});
				context = {
					el,
					labelEl,
					ringEl,
					textEl: el.createSpan({ cls: "ai-agent-panel-status-text" }),
					cacheEl: el.createSpan({ cls: "ai-agent-panel-status-cache is-hidden", attr: { "aria-hidden": "true" } }),
				};
				continue;
			}
			if (kind === "usage") {
				usage = { el, labelEl, itemsEl: el.createSpan({ cls: "ai-agent-panel-status-usage" }) };
				continue;
			}
			const iconEl = el.createSpan({ cls: "ai-agent-panel-status-icon" });
			const textEl = el.createSpan({ cls: "ai-agent-panel-status-text" });
			const shortEl = textEl.createSpan({ cls: "ai-agent-panel-status-short" });
			const longEl = textEl.createSpan({ cls: "ai-agent-panel-status-long" });
			this.segments.set(kind, { el, labelEl, iconEl, textEl, shortEl, longEl, key: "", shown: true });
		}
		if (!context || !usage) throw new Error("SEGMENT_ORDER lost a segment");
		this.contextEl = context.el;
		this.contextLabelEl = context.labelEl;
		this.ringEl = context.ringEl;
		this.contextTextEl = context.textEl;
		this.contextValueEl = context.textEl.createSpan();
		this.cacheEl = context.cacheEl;
		context.cacheEl.createSpan({ cls: "ai-agent-panel-status-cache-divider" });
		this.cacheIconEl = context.cacheEl.createSpan({ cls: "ai-agent-panel-status-cache-icon" });
		this.cacheTimeEl = context.cacheEl.createSpan({ cls: "ai-agent-panel-status-cache-time" });
		this.usageEl = usage.el;
		this.usageLabelEl = usage.labelEl;
		this.usageItemsEl = usage.itemsEl;
	}

	onload(): void {
		const contextCard = this.intents.attachHoverCard(this.contextEl, (el) => this.drawContextCard(el));
		const usageCard = this.intents.attachHoverCard(this.usageEl, (el) => this.drawUsageCard(el));
		this.contextCard = contextCard;
		this.usageCard = usageCard;
		this.register(() => {
			contextCard.detach();
			usageCard.detach();
		});
		this.registerEvent(
			this.source.viewEvents.on("active", () => {
				this.tab.follow(this.source.activeTab());
				this.render();
			})
		);
		this.registerEvent(
			this.source.settingsEvents.on("settings", () => {
				this.render();
				this.renderUsage();
				this.reportUsage(this.usageEl.isShown());
			})
		);
		this.register(
			this.source.usage.subscribe(() => {
				if (this.usageVisible) this.renderUsage();
				else {
					// Its width decides whether it fits, so the next pass redraws it while the line shows.
					this.usageStale = true;
					this.source.resizePass.requestPass();
				}
			})
		);
		// Polling stops whenever the segment cannot be seen (PRD-005.R3): a
		// hidden window, a collapsed sidebar, another leaf covering the panel.
		const recheck = () => {
			this.reportUsage(this.usageEl.isShown());
			this.source.resizePass.requestPass();
		};
		onOwnDocument(this, this.lineEl, "visibilitychange", recheck);
		for (const name of ["layout-change", "active-leaf-change", "resize"])
			this.registerEvent(this.source.workspaceEvents.on(name, recheck));
		this.register(() => this.source.usage.setSegmentVisible(this, false));
		this.register(this.source.resizePass.addMeasure(this));
		this.register(
			this.source.ticker.subscribe({
				// Only a countdown ticks: refreshing and cold change on a stream message.
				shown: () => (this.cacheDrawn?.left ?? "") !== "" && this.contextEl.isShown(),
				periodMs: () => (this.cacheDrawn ? cachePeriodMs(this.cacheDrawn) : 1000),
				phase: () => this.cacheDrawn?.expiresAt ?? null,
				tick: () => {
					const status = this.tab.current?.status;
					if (status) this.renderContext(status, true);
				},
			})
		);
		this.tab.follow(this.source.activeTab());
		this.render();
		this.renderUsage();
	}

	/**
	 * Tells the usage service whether the plan-usage segment can be seen
	 * (PRD-005.R3): on, in a visible document, rendered (`segmentShown`: read
	 * in the pass, or at once on a trigger, since the panel may have hidden
	 * since the last pass) and at a fit step below 4. A snapshot that came
	 * while it could not be seen is drawn once it can.
	 */
	private reportUsage(segmentShown: boolean): void {
		const visible = usageSegmentVisible({
			showUsage: this.source.settings().showUsage,
			documentHidden: this.lineEl.doc.hidden,
			segmentShown,
			step: this.step,
		});
		this.usageVisible = visible;
		this.source.usage.setSegmentVisible(this, visible);
		if (this.usageVisible && this.usageStale) this.renderUsage();
	}

	/**
	 * The resize pass's read: the line's width, its gap once per
	 * `css-change`, and each shown segment's widths once per label change
	 * (the short and long strings switch at 560 px, so the label shown is
	 * part of the change); then `fitStep`.
	 */
	read(cssChanged: boolean): void {
		if (cssChanged) {
			this.measured.clear();
			this.gap = null;
		}
		this.lineShown = this.lineEl.isShown();
		if (!this.lineShown) {
			// A hidden panel: nothing to measure, and no usage to poll for.
			this.nextStep = this.step;
			this.nextUsageShown = false;
			return;
		}
		const win = this.lineEl.win;
		this.gap ??= Number.parseFloat(win.getComputedStyle(this.lineEl).columnGap) || 0;
		const effortLong = this.segments.get("effort")?.longEl;
		const long = !!effortLong && win.getComputedStyle(effortLong).display !== "none";
		const usageOn = this.usageEl.isShown();
		const widths: SegmentWidths[] = [];
		for (const kind of SEGMENT_ORDER) {
			const target = this.measureTarget(kind, usageOn, long);
			if (!target) continue;
			const last = this.measured.get(kind);
			if (!target.readable) {
				widths.push({ kind, ...hiddenWidths(last, long, target.key) });
				continue;
			}
			let measured = last;
			if (measured?.long !== long || measured.text !== target.key) {
				const label = target.textEl ? target.textEl.getBoundingClientRect().width : 0;
				measured = {
					long,
					text: target.key,
					fixed: target.el.getBoundingClientRect().width - label,
					labelNatural: target.textEl ? target.textEl.scrollWidth : 0,
				};
				this.measured.set(kind, measured);
			}
			widths.push({ kind, fixed: measured.fixed, labelNatural: measured.labelNatural });
		}
		this.nextStep = fitStep(this.lineEl.getBoundingClientRect().width, this.gap, widths, this.permissionWarn);
		this.nextUsageShown = usageOn;
	}

	/** The resize pass's write: one class for the step, then the plan-usage segment's visibility. */
	write(): void {
		if (this.nextStep !== this.step) {
			this.lineEl.classList.replace(`is-fit-${this.step}`, `is-fit-${this.nextStep}`);
			// Shown again after step 4: the next pass reads whether it shows, and its width.
			const reshown = this.step >= USAGE_HIDDEN_STEP && this.nextStep < USAGE_HIDDEN_STEP;
			this.step = this.nextStep;
			if (reshown) this.source.resizePass.requestPass();
		}
		this.usageShown = this.nextUsageShown;
		this.reportUsage(this.usageShown);
		// Hidden by a step, the 360 px rule or a hidden panel: a shown hover card goes.
		if (!this.usageShown || this.step >= USAGE_HIDDEN_STEP) this.usageCard?.refresh();
		if (!this.lineShown) this.contextCard?.refresh();
		// A snapshot that came while the segment was hidden: drawn now, measured next pass.
		if (this.usageStale && this.lineShown) this.renderUsage();
	}

	/**
	 * The elements a segment is measured by, when it is part of the line: the
	 * plan-usage segment hides whole (no label), and is read only while it
	 * shows. Its key leaves out the reset time below 560 px, where it does not
	 * show, so the ticking time changes no width there.
	 */
	private measureTarget(
		kind: SegmentKind,
		usageOn: boolean,
		long: boolean
	): { el: HTMLElement; textEl: HTMLElement | null; key: string; readable: boolean } | null {
		if (kind === "context") {
			if (!this.contextShown) return null;
			// The cache part's structure and its time's width are in the key: a change measures again.
			// Below 360 px the time does not show, so whether it does is in the key as well.
			const key = `${this.contextTextEl.textContent ?? ""}\n${this.cacheKey}\n${this.cacheTimeEl.isShown()}`;
			return { el: this.contextEl, textEl: this.contextTextEl, key, readable: true };
		}
		if (kind === "usage") {
			if (!this.source.settings().showUsage) return null;
			const shown = long ? this.usageEl : this.usageLabelEl;
			return { el: this.usageEl, textEl: null, key: shown.textContent ?? "", readable: usageOn };
		}
		const segment = this.segments.get(kind);
		if (!segment?.shown) return null;
		return { el: segment.el, textEl: segment.textEl, key: segment.key, readable: true };
	}

	/** A segment was clicked: its popover, built from the active tab, through the host. */
	private openPopover(kind: SegmentKind, trigger: HTMLElement): void {
		const tab = this.tab.current;
		if (!tab) return;
		const status = tab.status;
		const settings = this.source.settings();
		const intents = this.intents;
		if (kind === "context") {
			const content = new ContextPopover(contextPopover(status.usage.context, status.reportedModel), {
				onDetails: () => intents.onRunCommand(tab, "context"),
				onCompact: () => intents.onCompact(tab),
				cache: () => cacheView(tab.status.cache, Date.now()),
				canCompact: () => intents.canCompact(tab),
				ticker: this.source.ticker,
				onChange: (listener) => {
					tab.on("activity", listener);
					tab.on("status", listener);
					return () => {
						tab.off("activity", listener);
						tab.off("status", listener);
					};
				},
			});
			intents.openPopover(trigger, "context", content);
		} else if (kind === "usage") {
			const content = new PlanUsagePopover(
				{ usage: this.source.usage, thresholds: () => usageThresholds(this.source.settings()) },
				{ onRefresh: (force) => intents.onRefreshUsage(force), onRunUsage: () => intents.onRunCommand(tab, "usage") }
			);
			intents.openPopover(trigger, "plan-usage", content);
		} else if (kind === "model" || kind === "effort") {
			const cliModels = this.source.cliModelsFor(status.profileId);
			const content = new ModelEffortPopover(
				{
					models: modelOptions(settings.resolvedModels, cliModels, [settings.model, status.model]),
					model: status.model,
					efforts: effortChoices(cliModels, status.model),
					effort: status.effort,
				},
				{
					onPickModel: (value) => intents.onPickModel(tab, value),
					onPickEffort: (value) => intents.onPickEffort(tab, value),
				}
			);
			intents.openPopover(trigger, "model-effort", content, kind === "effort" ? EFFORT_CONTROL : undefined);
		} else if (kind === "permission") {
			const profile = profileById(settings, status.profileId) ?? defaultProfile(settings);
			const current = shownMode(status, settings.cliStartupModes?.[profile.id]).value;
			const content = new PermissionPopover({ modes: offeredModes(settings.enableBypassMode), current }, (mode) =>
				intents.onPickMode(tab, mode)
			);
			intents.openPopover(trigger, "permission", content);
		} else {
			const current = (profileById(settings, status.profileId) ?? defaultProfile(settings)).id;
			const content = new ProfilePopover({ profiles: settings.cliProfiles, current }, (profileId) =>
				intents.onPickProfile(tab, profileId)
			);
			intents.openPopover(trigger, "profile", content);
		}
	}

	private render(): void {
		const status = this.tab.current?.status;
		if (!status) return;
		const settings = this.source.settings();
		const profile = profileById(settings, status.profileId) ?? defaultProfile(settings);
		this.writeSegment("model", modelSegment(status.model, status.reportedModel, settings.resolvedModels, this.source.cliModelsFor(status.profileId)));
		this.writeSegment("effort", effortSegment(status.effort));
		this.writeSegment("permission", modeSegment(shownMode(status, settings.cliStartupModes?.[profile.id])));
		this.writeSegment("profile", profileSegment(settings.cliProfiles.length, profile));
		this.renderContext(status);
		this.source.resizePass.requestPass();
	}

	private writeSegment(kind: MenuKind, view: SegmentView | null): void {
		const segment = this.segments.get(kind);
		if (!segment) return;
		segment.shown = view !== null;
		segment.el.toggle(segment.shown);
		if (!view) return;
		writeIcon(segment.iconEl, view.icon);
		writeText(segment.shortEl, view.short);
		writeText(segment.longEl, view.long);
		writeText(segment.labelEl, view.label);
		// The model's full id (PRD-001.R22), the mode's hover text (PRD-002.R8); "Show tooltips" off hides
		// both, and effort and profile show theirs only while icon-only (`--no-tooltip` in styles.css, PRD-001.R32).
		writeTooltip(segment.el, view.tooltip);
		segment.el.toggleClass("is-warning", view.warn);
		segment.key = `${view.icon}\n${view.short}\n${view.long}`;
		if (kind === "permission") this.permissionWarn = view.warn;
	}

	/** The context segment (PRD-005.R8): hidden until the first finished turn, then a ring and the percentage. */
	private renderContext(status: Readonly<StatusData>, tick = false): void {
		const cache = cacheView(status.cache, Date.now());
		const view = contextSegment(status.usage, cache, status.compacting, status.contextHidden);
		this.contextShown = view !== null;
		this.contextEl.toggleClass("is-hidden", !this.contextShown);
		const drawn = view?.cache ? cache : null;
		this.cacheDrawn = drawn;
		if (view) {
			writeText(this.contextLabelEl, view.label);
			writeText(this.contextValueEl, view.percent === null ? "" : `${view.percent}%`);
			const arc = `${Math.min(100, Math.max(0, view.percent ?? 0))} 100`;
			if (this.ringEl.getAttribute("stroke-dasharray") !== arc) this.ringEl.setAttribute("stroke-dasharray", arc);
			this.contextEl.toggleClass("is-context-warning", view.warn);
			this.contextEl.toggleClass("is-compacting", view.compacting);
			this.renderCache(view.cache);
		}
		// A countdown starts or ends, or its period changes: the ticker runs only while one shows.
		this.source.ticker.check();
		// A tick changes only the cache text: the open hover card takes it in place, without a rebuild and a new placement.
		const text = contextHover(status.usage.context, cacheView(status.cache, Date.now())).cache;
		if (tick && this.hoverCacheEl?.isConnected && text !== null && this.hoverCacheEl.textContent !== null) {
			if (this.hoverCacheEl.textContent !== text) this.hoverCacheEl.setText(text);
		} else this.contextCard?.refresh();
	}

	/** The divider, the bolt and the time; a change of structure or of the time's length asks for a new measure. */
	private renderCache(cache: CacheSegmentView | null): void {
		this.cacheEl.toggleClass("is-hidden", !cache);
		if (cache) {
			this.cacheEl.dataset.state = cache.state;
			writeIcon(this.cacheIconEl, cache.icon);
			writeText(this.cacheTimeEl, cache.time);
		}
		const key = cache ? `${cache.icon}\n${cache.time.length}` : "";
		if (key === this.cacheKey) return;
		this.cacheKey = key;
		// The context segment's width changed, so the line fits again.
		this.source.resizePass.requestPass();
	}

	private drawContextCard(el: HTMLElement): void {
		const status = this.tab.current?.status;
		const view = contextHover(status?.usage.context ?? null, status ? cacheView(status.cache, Date.now()) : null);
		el.addClass("mod-fixed");
		const row = el.createDiv({ cls: "ai-agent-panel-hover-row" });
		row.createSpan({ cls: "ai-agent-panel-hover-label", text: "Context" });
		if (view.used) row.createSpan({ cls: "ai-agent-panel-hover-value", text: view.used });
		if (view.note) el.createDiv({ cls: "ai-agent-panel-hover-note", text: view.note });
		this.hoverCacheEl = null;
		if (view.cache) {
			const cache = el.createDiv({ cls: "ai-agent-panel-hover-row mod-cache" });
			cache.createSpan({ cls: "ai-agent-panel-hover-label", text: "Prompt cache" });
			this.hoverCacheEl = cache.createSpan({ cls: "ai-agent-panel-hover-value", text: view.cache });
		}
	}

	/** The plan-usage segment (PRD-005.R4), only while "Show plan usage" is on. */
	private renderUsage(): void {
		this.usageStale = false;
		const settings = this.source.settings();
		this.usageEl.toggle(settings.showUsage);
		// Its width, or its leaving the line, changes the fit.
		this.source.resizePass.requestPass();
		if (!settings.showUsage) {
			this.usageCard?.refresh();
			return;
		}
		const { snapshot, lastError } = this.source.usage;
		const view = usageSegment(snapshot, lastError, usageThresholds(settings), Date.now());
		const items = this.usageItemsEl;
		items.empty();
		if (view.note) items.createSpan({ cls: "ai-agent-panel-status-usage-note", text: view.note });
		for (const item of view.items) {
			const itemEl = items.createSpan({ cls: `ai-agent-panel-status-usage-item mod-${item.level}` });
			itemEl.createSpan({ text: item.label });
			itemEl.createSpan({ cls: "ai-agent-panel-status-usage-percent", text: `${item.percent}%` });
			if (item.reset) itemEl.createSpan({ cls: "ai-agent-panel-status-usage-reset", text: item.reset });
		}
		this.usageEl.toggleClass("is-usage-warning", view.level === "warning");
		this.usageEl.toggleClass("is-usage-critical", view.level === "critical");
		writeText(this.usageLabelEl, view.label);
		this.usageCard?.refresh();
	}

	private drawUsageCard(el: HTMLElement): void {
		const { snapshot, lastError } = this.source.usage;
		const view = usageHover(snapshot, lastError, usageThresholds(this.source.settings()), Date.now());
		el.addClass("mod-fixed");
		if (view.failure) el.createDiv({ cls: "ai-agent-panel-hover-note is-failed", text: view.failure });
		for (const row of view.rows) {
			const line = el.createDiv({ cls: `ai-agent-panel-hover-row mod-${row.level}` });
			line.createSpan({ cls: "ai-agent-panel-hover-label", text: row.short });
			line.createSpan({ cls: "ai-agent-panel-hover-value", text: `${row.percent}%` });
			if (row.reset) el.createDiv({ cls: "ai-agent-panel-hover-sub", text: row.reset });
		}
		if (view.note) el.createDiv({ cls: "ai-agent-panel-hover-note", text: view.note });
	}
}
