import { Component } from "obsidian";
import { STOP_BODY, STOP_CANCEL, STOP_CONFIRM } from "../../state/clear-dialog";
import { writeIcon, type PopoverContent, type PopoverFocus, type PopoverShell } from "../dom";

/**
 * The question a `/clear` asks while agents or background tasks run
 * (PRD-001.R38; DES-003 Stop and clear dialog): an `alertdialog` the popover
 * host draws above the composer, in the panel's own window, with a title that
 * names what runs, the fixed body, "Cancel" and "Stop and clear". Cancel
 * takes the focus, so Enter cannot stop anything unasked. Cancel, Escape, a
 * click outside, the active tab changing and the panel unloading all answer
 * no; `answer` is called once.
 */
export class StopConfirm extends Component implements PopoverContent {
	readonly cls = "mod-stop";
	readonly fitTrigger = true;
	readonly alert = ["triangle-alert", "alert-triangle"] as const;
	private answered = false;

	constructor(
		readonly title: string,
		private readonly answer: (stop: boolean) => void
	) {
		super();
	}

	/** The popover closing without a button answers no. */
	onunload(): void {
		this.settle(false);
	}

	render(el: HTMLElement, picked: () => void, shell: PopoverShell): PopoverFocus {
		el.setText(STOP_BODY);
		const footer = shell.footer();
		const cancel = footer.createEl("button", { cls: "ai-agent-panel-text-button", text: STOP_CANCEL, attr: { type: "button" } });
		const stop = footer.createEl("button", { cls: "ai-agent-panel-text-button mod-stop", attr: { type: "button" } });
		writeIcon(stop.createSpan({ cls: "ai-agent-panel-text-button-icon", attr: { "aria-hidden": "true" } }), "square");
		stop.appendText(STOP_CONFIRM);
		this.registerDomEvent(cancel, "click", () => {
			this.settle(false);
			picked();
		});
		this.registerDomEvent(stop, "click", () => {
			this.settle(true);
			picked();
		});
		return { first: cancel };
	}

	private settle(stop: boolean): void {
		if (this.answered) return;
		this.answered = true;
		this.answer(stop);
	}
}
