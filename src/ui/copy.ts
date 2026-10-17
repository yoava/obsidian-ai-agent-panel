import { Notice } from "obsidian";
import { writeIcon, writeTooltip } from "./dom";

/** How long a copy button shows its check after a copy. */
const COPIED_MS = 1500;

/**
 * The one clipboard writer (DES-003 Data and security): `text` to the
 * clipboard, or PRD-001.R15's Notice when that fails. The clipboard is never
 * read. Resolves to whether the write succeeded.
 */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		new Notice("Could not copy to the clipboard.");
		return false;
	}
}

/**
 * A copy button named `label`, which is also its tooltip: copies the raw
 * text `text()` gives (a reply's Markdown source, not the rendered DOM), then
 * shows a check and "Copied" for 1.5 s.
 */
export function copyButton(parent: HTMLElement, text: () => string, label: string): HTMLButtonElement {
	const button = parent.createEl("button", {
		cls: "clickable-icon ai-agent-panel-copy-button",
		attr: { type: "button" },
	});
	writeIcon(button, "copy");
	writeTooltip(button, label);
	let reset: number | null = null;
	button.addEventListener("click", () => {
		void copyText(text()).then((copied) => {
			if (!copied) return;
			writeIcon(button, "check");
			writeTooltip(button, "Copied");
			if (reset !== null) button.win.clearTimeout(reset);
			reset = button.win.setTimeout(() => {
				reset = null;
				writeIcon(button, "copy");
				writeTooltip(button, label);
			}, COPIED_MS);
		});
	});
	return button;
}
