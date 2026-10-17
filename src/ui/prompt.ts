import { Component, type Events } from "obsidian";
import { promptTitle } from "../conversation-list";
import { contextIcon, contextLabel, isCommandBubble, sentLabel, splitSelection } from "../state/prompts";
import type { PromptItem } from "../state/tab";
import { copyButton } from "./copy";
import { thumbButtons, writeAttr, writeClass, writeIcon, writeText, type ViewImages } from "./dom";

/**
 * One user message (DES-003 Prompts) at the start of its section: a numbered
 * prompt with its number badge, "You", the send time when recorded, the
 * context label (a file icon, then the note and its selection), "Not sent"
 * when a failed branch kept it from Claude, and its text,
 * or a panel command, a `!` run or a bare slash command such as `/compact`
 * as a compact monospace message; a copy button on hover and focus. The style
 * is the root's `mod-prompt-numbered` (Card) or `mod-prompt-bubble` (CSS), its
 * color the three `user-*` tokens the theme scope's prompt color class picks. A numbered prompt also gets the pinned bar: a
 * sticky, zero-height band holding the prompt's head and its text cut to one
 * line, shown while `PinObserver` reports its sentinel above the top, which
 * scrolls back to the section's start on a click.
 */
export class PromptView extends Component {
	readonly el: HTMLElement;
	/** Above a numbered prompt: `PinObserver` watches it, the rail measures it. */
	readonly sentinelEl: HTMLElement | null = null;
	private readonly pinEl: HTMLElement | null = null;
	private readonly pinTextEl: HTMLElement | null = null;
	private readonly timeEl: HTMLElement;
	private readonly pinTimeEl: HTMLElement | null = null;
	private readonly queuedEl: HTMLElement;
	private readonly notSentEl: HTMLElement;
	private readonly context: ContextLine;
	private readonly pinContext: ContextLine | null = null;
	private readonly textEl: HTMLElement;
	private readonly imagesEl: HTMLElement;
	private item: PromptItem;

	constructor(
		section: HTMLElement,
		item: PromptItem,
		private readonly tab: Events,
		onPinClick: () => void,
		private readonly onViewImage: ViewImages
	) {
		super();
		this.item = item;
		const numbered = item.number !== null;
		if (numbered) {
			this.sentinelEl = section.createDiv({ cls: "ai-agent-panel-prompt-sentinel", attr: { "aria-hidden": "true" } });
			// Inert until it is the pinned prompt's (`setCurrent`).
			this.pinEl = section.createDiv({ cls: "ai-agent-panel-prompt-pin", attr: { "aria-hidden": "true" } });
			this.pinEl.inert = true;
			const band = this.pinEl.createDiv({ cls: "ai-agent-panel-prompt-pin-band" });
			const bar = band.createEl("button", { cls: "ai-agent-panel-prompt-pin-bar", attr: { type: "button" } });
			// Named by what it does, then the number and the text; the head's rest is hidden from the name.
			bar.createSpan({ cls: "ai-agent-panel-visually-hidden", text: "Scroll to prompt " });
			const pinHead = bar.createSpan({ cls: "ai-agent-panel-prompt-pin-head" });
			pinHead.createSpan({ cls: "ai-agent-panel-prompt-number", text: String(item.number) });
			const rest = pinHead.createSpan({ cls: "ai-agent-panel-prompt-pin-rest", attr: { "aria-hidden": "true" } });
			rest.createSpan({ cls: "ai-agent-panel-prompt-you", text: "You" });
			this.pinTimeEl = rest.createSpan({ cls: "ai-agent-panel-prompt-time" });
			this.pinContext = contextLine(rest);
			bar.appendText(" ");
			this.pinTextEl = bar.createSpan({ cls: "ai-agent-panel-prompt-pin-text" });
			bar.addEventListener("click", () => onPinClick());
		}
		this.el = section.createDiv({ cls: "ai-agent-panel-prompt" });
		const compact = !numbered || isCommandBubble(item);
		this.el.addClass(compact ? "is-compact" : "is-numbered");
		// A numbered bare command keeps its badge, so the numbers match the rail and the pin.
		if (compact && numbered) this.el.addClass("has-number");
		const head = this.el.createDiv({ cls: "ai-agent-panel-prompt-head" });
		if (numbered) head.createSpan({ cls: "ai-agent-panel-prompt-number", text: String(item.number) });
		head.createSpan({ cls: "ai-agent-panel-prompt-you", text: "You" });
		this.timeEl = head.createSpan({ cls: "ai-agent-panel-prompt-time" });
		this.queuedEl = head.createSpan({ cls: "ai-agent-panel-prompt-queued", text: "queued mid-turn" });
		this.notSentEl = head.createSpan({ cls: "ai-agent-panel-prompt-not-sent", text: "Not sent" });
		this.context = contextLine(head);
		this.textEl = this.el.createDiv({ cls: "ai-agent-panel-prompt-text" });
		this.imagesEl = this.el.createDiv({ cls: "ai-agent-panel-prompt-images" });
		copyButton(this.el, () => this.item.text, "Copy prompt");
		this.draw(item);
	}

	onload(): void {
		this.register(() => {
			this.sentinelEl?.remove();
			this.pinEl?.remove();
			this.el.remove();
		});
		this.registerEvent(this.tab.on(`item:${this.item.id}`, (item) => this.draw(item as PromptItem)));
	}

	/** While its sentinel is above the top. */
	setStuck(stuck: boolean): void {
		if (this.pinEl) writeClass(this.pinEl, "is-stuck", stuck);
	}

	/**
	 * The pinned prompt's pin shows and takes focus (`mod-pin-prompt`); every
	 * other one is hidden from screen readers and out of the tab order.
	 */
	setCurrent(current: boolean): void {
		if (!this.pinEl) return;
		writeClass(this.pinEl, "is-current", current);
		writeAttr(this.pinEl, "aria-hidden", String(!current));
		this.pinEl.inert = !current;
	}

	private draw(item: PromptItem): void {
		this.item = item;
		writeText(this.timeEl, item.number !== null ? sentLabel(item.sentAt) : "");
		this.timeEl.toggle(this.timeEl.textContent !== "");
		if (this.pinTimeEl) {
			writeText(this.pinTimeEl, this.timeEl.textContent ?? "");
			this.pinTimeEl.toggle(this.pinTimeEl.textContent !== "");
		}
		this.queuedEl.toggle(item.queued);
		this.notSentEl.toggle(item.notSent === true);
		const context = contextLabel(item.contextName, item.images);
		drawContextLine(this.context, context, item.contextName);
		if (this.pinContext) drawContextLine(this.pinContext, context, item.contextName);
		writeText(this.textEl, item.text);
		this.textEl.toggle(item.text !== "");
		if (this.pinTextEl) writeText(this.pinTextEl, promptTitle(item.text));
		this.drawImages(item.images);
	}

	/** A live prompt's images as thumbnails; a reopened one only knows their count, in the context label. */
	private drawImages(images: PromptItem["images"]): void {
		this.imagesEl.empty();
		const shown = typeof images === "number" ? [] : images;
		this.imagesEl.toggle(shown.length > 0);
		thumbButtons(this.imagesEl, shown, "ai-agent-panel-prompt-image", this.onViewImage);
	}
}

/** A prompt's context label: an icon for a note or folder, then the label. */
interface ContextLine {
	el: HTMLElement;
	iconEl: HTMLElement;
	textEl: HTMLElement;
}

function contextLine(parent: HTMLElement): ContextLine {
	const el = parent.createSpan({ cls: "ai-agent-panel-prompt-context" });
	const iconEl = el.createSpan({ cls: "ai-agent-panel-prompt-context-icon", attr: { "aria-hidden": "true" } });
	return { el, iconEl, textEl: el.createSpan({ cls: "ai-agent-panel-prompt-context-text" }) };
}

/**
 * The label with its " selected" in a span of its own: the numbered head and
 * the pin read "6 lines", the line under a bubble "6 lines selected" (CSS).
 */
function drawContextLine(line: ContextLine, label: string, contextName: string | null): void {
	if (line.textEl.dataset.label !== label) {
		line.textEl.dataset.label = label;
		line.textEl.empty();
		const split = splitSelection(label);
		if (split) {
			line.textEl.appendText(split.lead);
			line.textEl.createSpan({ cls: "ai-agent-panel-prompt-context-selected", text: " selected" });
			line.textEl.appendText(split.rest);
		} else line.textEl.setText(label);
	}
	const icon = contextIcon(contextName);
	line.iconEl.toggle(icon !== null);
	if (icon) writeIcon(line.iconEl, icon);
	line.el.toggle(label !== "");
}

/**
 * The pinned prompt's stuck state for one messages element (DES-003
 * Prompts): one `IntersectionObserver` on the sentinels above the numbered
 * prompts, a prompt stuck while its sentinel is above the top. The current
 * one is the last stuck prompt, whose section reaches the top; `onCurrent`
 * hears when it changes.
 */
export class PinObserver {
	private readonly observer: IntersectionObserver;
	private readonly views = new Map<Element, { number: number; view: PromptView }>();
	private readonly stuck = new Set<number>();
	private current: number | null = null;
	/** The pinned prompt's view, whose pin shows. */
	private currentView: PromptView | null = null;

	constructor(
		root: HTMLElement,
		private readonly onCurrent: (number: number | null) => void
	) {
		const win = root.win as typeof window;
		// The root reaches far below the view, so a sentinel leaves it only across the top
		// edge: a jump from above the top to below the view still crosses it.
		this.observer = new win.IntersectionObserver((entries) => this.update(entries), {
			root,
			rootMargin: "0px 0px 1000000% 0px",
		});
	}

	get pinned(): number | null {
		return this.current;
	}

	observe(view: PromptView, number: number): void {
		if (!view.sentinelEl) return;
		this.views.set(view.sentinelEl, { number, view });
		this.observer.observe(view.sentinelEl);
	}

	unobserve(view: PromptView): void {
		const sentinel = view.sentinelEl;
		const entry = sentinel ? this.views.get(sentinel) : undefined;
		if (!sentinel || !entry) return;
		this.observer.unobserve(sentinel);
		this.views.delete(sentinel);
		this.stuck.delete(entry.number);
		this.settle();
	}

	disconnect(): void {
		this.observer.disconnect();
		this.views.clear();
		this.stuck.clear();
		this.settle();
	}

	private update(entries: IntersectionObserverEntry[]): void {
		for (const entry of entries) {
			const watched = this.views.get(entry.target);
			if (!watched) continue;
			const above = !entry.isIntersecting && entry.rootBounds !== null && entry.boundingClientRect.top < entry.rootBounds.top;
			watched.view.setStuck(above);
			if (above) this.stuck.add(watched.number);
			else this.stuck.delete(watched.number);
		}
		this.settle();
	}

	private settle(): void {
		const current = this.stuck.size > 0 ? Math.max(...this.stuck) : null;
		if (current === this.current) return;
		this.current = current;
		this.currentView?.setCurrent(false);
		this.currentView = null;
		for (const { number, view } of this.views.values())
			if (number === current) {
				view.setCurrent(true);
				this.currentView = view;
			}
		this.onCurrent(current);
	}
}
