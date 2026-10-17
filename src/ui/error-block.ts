import { Component } from "obsidian";
import type { ErrorItem } from "../state/tab";

/** An error outside a turn (DES-003 Cards): CLI not found, a spawn failure, an exit; its text, `role="alert"`. */
export class ErrorBlock extends Component {
	readonly el: HTMLElement;

	constructor(parent: HTMLElement, item: ErrorItem) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-error-block", attr: { role: "alert" }, text: item.text });
	}

	onunload(): void {
		this.el.remove();
	}
}
