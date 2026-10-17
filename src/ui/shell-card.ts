import { Component, type Events } from "obsidian";
import type { ShellResult } from "../bash";
import { outputParts } from "../state/shell-output";
import { shellStatus, type ShellItem } from "../state/tab";
import { hiddenText, writeIcon } from "./dom";

export interface ShellCardIntents {
	/** "Add output to chat": the run, formatted for the composer by `tab/shell-escape`. */
	onAddOutput: (result: ShellResult) => void;
}

/**
 * A `!` run's card (DES-003 Cards, PRD-002.R16), a `group` named by its
 * command, redrawn on its `item:<id>`: "Shell", then once ended the elapsed time; the status
 * ("running", `exit N`, "failed", "timed out") as icon and text;
 * stdout (a leading commit hash set apart) and stderr as text in capped
 * blocks, the error, or "No output.";
 * once ended, "Add output to chat" with "Claude hasn't seen this".
 */
export class ShellCard extends Component {
	readonly el: HTMLElement;
	private readonly nameEl: HTMLElement;

	constructor(
		parent: HTMLElement,
		private item: ShellItem,
		private readonly tab: Events,
		private readonly intents: ShellCardIntents
	) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-shell-card", attr: { role: "group" } });
		// Named by its command, as text.
		this.nameEl = hiddenText(this.el, "aria-labelledby", `Shell: ${item.command}`);
	}

	onload(): void {
		this.register(() => this.el.remove());
		this.registerEvent(this.tab.on(`item:${this.item.id}`, (item) => this.draw(item as ShellItem)));
		this.draw(this.item);
	}

	private draw(item: ShellItem): void {
		this.item = item;
		const { result } = item;
		const status = shellStatus(result);
		const el = this.el;
		el.empty();
		el.append(this.nameEl);
		el.toggleClass("is-running", !result);
		el.toggleClass("is-failed", status.failed);
		el.toggleClass("is-done", !!result && !status.failed);
		const head = el.createDiv({ cls: "ai-agent-panel-shell-head" });
		writeIcon(head.createSpan({ cls: "ai-agent-panel-shell-tile", attr: { "aria-hidden": "true" } }), "terminal");
		head.createSpan({ cls: "ai-agent-panel-shell-name", text: "Shell" });
		if (status.duration) head.createSpan({ cls: "ai-agent-panel-shell-duration", text: status.duration });
		const state = head.createSpan({ cls: "ai-agent-panel-shell-status" });
		writeIcon(
			state.createSpan({ cls: "ai-agent-panel-shell-mark", attr: { "aria-hidden": "true" } }),
			!result ? ["loader-circle", "loader-2", "loader"] : status.failed ? ["circle-x", "x-circle"] : ["check"]
		);
		state.createSpan({ text: status.label });
		// "exit 0" alone does not say which way it went to a screen reader.
		if (result && status.label.startsWith("exit ")) {
			state.createSpan({ cls: "ai-agent-panel-visually-hidden", text: status.failed ? ", failed" : ", succeeded" });
		}
		if (!result) return;
		const output = el.createDiv({ cls: "ai-agent-panel-shell-output" });
		if (result.error) output.createDiv({ cls: "ai-agent-panel-shell-error", text: result.error });
		const stdout = result.stdout.trimEnd();
		const stderr = result.stderr.trimEnd();
		if (stdout.trim()) {
			const pre = output.createEl("pre", { cls: "ai-agent-panel-shell-stream" });
			for (const part of outputParts(stdout)) {
				if (part.hash) pre.createSpan({ cls: "ai-agent-panel-shell-hash", text: part.text });
				else pre.appendText(part.text);
			}
		}
		if (stderr.trim()) output.createEl("pre", { cls: "ai-agent-panel-shell-stream is-stderr", text: stderr });
		if (!result.error && !stdout.trim() && !stderr.trim())
			output.createDiv({ cls: "ai-agent-panel-shell-empty", text: "No output." });
		const footer = el.createDiv({ cls: "ai-agent-panel-shell-footer" });
		const add = footer.createEl("button", { attr: { type: "button" } });
		writeIcon(add.createSpan({ cls: "ai-agent-panel-shell-add-icon", attr: { "aria-hidden": "true" } }), "plus");
		add.appendText("Add output to chat");
		add.addEventListener("click", () => this.intents.onAddOutput(result));
		footer.createSpan({ cls: "ai-agent-panel-shell-note", text: "Claude hasn't seen this" });
	}
}
