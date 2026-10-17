import { Component } from "obsidian";
import { AGENT_STATUS_TEXT, agentView } from "../state/step-groups";
import type { AgentBlock, AgentStatus } from "../state/tab";
import type { Ticker } from "../state/ticker";
import { writeAttr, writeClass, writeIcon, writeMark, writeText } from "./dom";

export interface AgentRowIntents {
	/** The row expanded: `ui/turn` draws the thread into `bodyEl` (DES-003 Agent rows and run bar). */
	onExpand: (bodyEl: HTMLElement) => void;
}

let nextId = 0;

/**
 * An agent row (PRD-001.R18): the bot tile, the label, the type, models,
 * tool count and tokens, the elapsed time, ticking on the shared ticker
 * while the agent runs and the row shows, and the status as icon and text.
 * Live, the row is a button with `aria-expanded` whose body holds the
 * thread `ui/turn` draws; reopened, it has no thread. A stop slot waits for
 * change 003's per-agent stop.
 */
export class AgentRow extends Component {
	readonly el: HTMLElement;
	/** Where `ui/turn` draws the thread. */
	readonly bodyEl: HTMLElement;
	private readonly headEl: HTMLElement;
	private readonly labelEl: HTMLElement;
	private readonly metaEl: HTMLElement;
	private readonly elapsedEl: HTMLElement;
	private readonly statusIconEl: HTMLElement;
	private readonly statusTextEl: HTMLElement;
	private expanded = false;
	private stopTicking: (() => void) | null = null;

	constructor(
		parent: HTMLElement,
		private block: AgentBlock,
		private readonly ticker: Ticker,
		private readonly intents: AgentRowIntents
	) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-agent" });
		const top = this.el.createDiv({ cls: "ai-agent-panel-agent-top" });
		const bodyId = `ai-agent-panel-agent-${++nextId}`;
		// Reopened, there is no thread to show (PRD-003.R3).
		this.headEl = block.live
			? top.createEl("button", {
					cls: "ai-agent-panel-agent-head",
					attr: { type: "button", "aria-expanded": "false", "aria-controls": bodyId },
				})
			: top.createDiv({ cls: "ai-agent-panel-agent-head" });
		writeIcon(this.headEl.createSpan({ cls: "ai-agent-panel-agent-tile", attr: { "aria-hidden": "true" } }), "bot");
		const text = this.headEl.createSpan({ cls: "ai-agent-panel-agent-text" });
		this.labelEl = text.createSpan({ cls: "ai-agent-panel-agent-label" });
		this.metaEl = text.createSpan({ cls: "ai-agent-panel-agent-meta" });
		this.elapsedEl = this.headEl.createSpan({ cls: "ai-agent-panel-agent-elapsed" });
		const status = this.headEl.createSpan({ cls: "ai-agent-panel-agent-status" });
		this.statusIconEl = status.createSpan({ cls: "ai-agent-panel-step-mark", attr: { "aria-hidden": "true" } });
		this.statusTextEl = status.createSpan({ cls: "ai-agent-panel-agent-status-text" });
		if (block.live)
			writeIcon(this.headEl.createSpan({ cls: "ai-agent-panel-agent-chevron", attr: { "aria-hidden": "true" } }), "chevron-right");
		// Change 003's per-agent stop goes here (DES-003 Seams for changes 002 and 003).
		top.createSpan({ cls: "ai-agent-panel-agent-stop-slot" });
		this.bodyEl = this.el.createDiv({ cls: "ai-agent-panel-agent-body", attr: { id: bodyId } });
		this.bodyEl.toggle(false);
	}

	onload(): void {
		this.register(() => {
			this.stopTicking?.();
			this.stopTicking = null;
			this.el.remove();
		});
		if (this.block.live)
			this.registerDomEvent(this.headEl, "click", () => {
				this.expanded = !this.expanded;
				writeAttr(this.headEl, "aria-expanded", String(this.expanded));
				writeClass(this.el, "is-expanded", this.expanded);
				this.bodyEl.toggle(this.expanded);
				if (this.expanded) this.intents.onExpand(this.bodyEl);
				// Agent rows in the thread may show now, or no longer.
				this.ticker.check();
			});
		this.draw(Date.now());
	}

	update(block: AgentBlock): void {
		if (block === this.block) return;
		this.block = block;
		this.draw(Date.now());
	}

	private draw(now: number): void {
		const view = agentView(this.block, now);
		writeText(this.labelEl, view.label);
		writeText(this.metaEl, view.meta.join(" · "));
		writeText(this.elapsedEl, view.elapsed);
		this.drawStatus(view.status);
		writeClass(this.el, "is-running", view.status === "running");
		this.tick();
	}

	private drawStatus(status: AgentStatus | null): void {
		writeAttr(this.el, "data-status", status ?? "none");
		writeText(this.statusTextEl, status ? AGENT_STATUS_TEXT[status] : "");
		if (status === "stopped") {
			writeAttr(this.statusIconEl, "data-mark", "stopped");
			writeIcon(this.statusIconEl, ["circle-stop", "stop-circle"]);
			return;
		}
		// The text names the status; the icon is its shape only.
		writeMark(this.statusIconEl, status === null ? null : status === "failed" ? "error" : status, true);
	}

	/** The elapsed time ticks while the agent runs and its row shows (PRD-001.R29). */
	private tick(): void {
		const ticking = this.block.status === "running" && this.block.startedAt !== null;
		if (ticking && !this.stopTicking)
			this.stopTicking = this.ticker.subscribe({
				shown: () => this.block.status === "running" && !this.el.doc.hidden && this.elapsedEl.isShown(),
				tick: (now) => writeText(this.elapsedEl, agentView(this.block, now).elapsed),
			});
		else if (!ticking && this.stopTicking) {
			this.stopTicking();
			this.stopTicking = null;
		}
	}
}
