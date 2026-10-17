import { Component } from "obsidian";
import { writeIcon, type PopoverContent, type PopoverFocus } from "../dom";

export interface MoreIntents {
	onHistory: () => void;
	onTranscript: () => void;
	onExport: () => void;
	onSettings: () => void;
}

/**
 * "More" (PRD-001.R30): below a 360 px main column, what the header's
 * history, Transcript and settings buttons do, and the export command.
 */
export class MorePopover extends Component implements PopoverContent {
	readonly title = "More";
	readonly menu = true;

	constructor(
		/** The active conversation has an exported note. */
		private readonly exported: boolean,
		private readonly intents: MoreIntents
	) {
		super();
	}

	render(el: HTMLElement, picked: () => void): PopoverFocus {
		const list = el.createDiv({ cls: "ai-agent-panel-more" });
		const item = (icon: string | readonly string[], label: string, run: () => void): HTMLButtonElement => {
			const button = list.createEl("button", { cls: "ai-agent-panel-more-item", attr: { type: "button" } });
			writeIcon(button.createSpan({ cls: "ai-agent-panel-more-icon", attr: { "aria-hidden": "true" } }), icon);
			button.createSpan({ text: label });
			this.registerDomEvent(button, "click", () => {
				picked();
				run();
			});
			return button;
		};
		const first = item("history", "Previous conversations", this.intents.onHistory);
		if (this.exported) item("file-text", "Open transcript", this.intents.onTranscript);
		item(["file-output", "file-down", "download"], "Export to Markdown", this.intents.onExport);
		item("settings", "Plugin settings", this.intents.onSettings);
		return { first };
	}
}
