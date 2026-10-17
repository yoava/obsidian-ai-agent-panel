import { Component, type Events } from "obsidian";
import type { BackgroundTask } from "../protocol/types";
import { taskLabel } from "../state/tab";
import { Follower, hiddenText, syncChildren, writeIcon, writeText, writeTooltip } from "./dom";

/** A tab as the run bar reads it: its background tasks, and `tasks` when they change. */
export interface RunBarTab extends Events {
	readonly tasks: readonly BackgroundTask[];
}

export interface RunBarSource {
	/** The view's events: `active`. */
	viewEvents: Events;
	activeTab: () => RunBarTab | null;
}

export interface RunBarIntents {
	/** Stop one task (`stop_task`); a failure is the view's Notice (PRD-001.R18). */
	onStopTask: (tab: RunBarTab, taskId: string) => void;
}

interface TaskRow {
	el: HTMLElement;
	icon: HTMLElement;
	label: HTMLElement;
}

const STOP_LABEL = "Stop this background task";

let nextId = 0;

/**
 * The run bar above the composer (DES-003 Agent rows and run bar): the
 * active tab's background tasks, each with its label and a Stop button,
 * hidden while none runs. Change 003 builds its agent summary here.
 */
export class RunBar extends Component {
	readonly el: HTMLElement;
	/** Its name, kept first among the rows. */
	private readonly nameEl: HTMLElement;
	private readonly rows = new Map<string, TaskRow>();
	private follower!: Follower<RunBarTab, "tasks">;

	constructor(
		parent: HTMLElement,
		private readonly source: RunBarSource,
		private readonly intents: RunBarIntents
	) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-run-bar", attr: { role: "group" } });
		this.nameEl = hiddenText(this.el, "aria-labelledby", "Background tasks");
		this.el.toggle(false);
	}

	onload(): void {
		this.register(() => this.el.remove());
		this.follower = new Follower<RunBarTab, "tasks">(this, { tasks: () => this.draw() });
		this.registerEvent(
			this.source.viewEvents.on("active", () => {
				this.follower.follow(this.source.activeTab());
				this.draw();
			})
		);
		this.follower.follow(this.source.activeTab());
		this.draw();
	}

	private draw(): void {
		const tab = this.follower.current;
		const tasks = tab?.tasks ?? [];
		this.el.toggle(tasks.length > 0);
		const keep = new Set(tasks.map((task) => task.taskId));
		for (const [id, row] of this.rows) {
			if (keep.has(id)) continue;
			row.el.remove();
			this.rows.delete(id);
		}
		const els = tasks.map((task) => {
			const row = this.rows.get(task.taskId) ?? this.createRow(task.taskId);
			writeIcon(row.icon, task.taskType === "local_agent" ? "bot" : "loader");
			writeText(row.label, taskLabel(task));
			return row.el;
		});
		syncChildren(this.el, [this.nameEl, ...els]);
	}

	private createRow(taskId: string): TaskRow {
		const el = createDiv({ cls: "ai-agent-panel-run-task" });
		const icon = el.createSpan({ cls: "ai-agent-panel-run-task-icon", attr: { "aria-hidden": "true" } });
		const labelId = `ai-agent-panel-run-task-${++nextId}`;
		const label = el.createSpan({ cls: "ai-agent-panel-run-task-label", attr: { id: labelId } });
		const stop = el.createEl("button", {
			cls: "ai-agent-panel-icon-button ai-agent-panel-run-task-stop",
			attr: { type: "button", "aria-describedby": labelId },
		});
		writeIcon(stop, "square");
		writeTooltip(stop, STOP_LABEL);
		// The row's own listener, gone with the row.
		stop.addEventListener("click", () => {
			const tab = this.follower.current;
			if (tab) this.intents.onStopTask(tab, taskId);
		});
		const row = { el, icon, label };
		this.rows.set(taskId, row);
		return row;
	}
}
