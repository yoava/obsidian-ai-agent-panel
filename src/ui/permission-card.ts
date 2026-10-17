import { Component } from "obsidian";
import type { FileDiff } from "../diff";
import { writeDiffStat } from "../diffview";
import { cardChrome, cardLocation, type Card, type CardDiff, type PermissionCard, type UserAnswer } from "../state/permission";
import { writeClass, writeIcon, writeText } from "./dom";

export interface PermissionCardIntents {
	/** A button pressed: `tab/permission-flow` answers. */
	onAnswer: (requestId: string, answer: UserAnswer, key: number | undefined) => void;
	/** Model Markdown into `el` through `ui/markdown`: the plan (PRD-001.R17). */
	renderMarkdown: (markdown: string, el: HTMLElement) => Promise<void>;
	/**
	 * The edit's proposed diff into `el`, on the page (`diffview`), its
	 * Diff / Rendered tabs into `tabsHost`; its totals, or null when the call
	 * has nothing to diff.
	 */
	renderDiff: (el: HTMLElement, toolName: string, input: Record<string, unknown>, before: string | null, tabsHost: HTMLElement) => FileDiff | null;
	/** Bring `el` back into view once `rendered` settles, unless the user scrolled away (`ui/messages`). */
	revealAfter: (el: HTMLElement, rendered: Promise<unknown>) => void;
}

let nextCardId = 0;

/**
 * A permission card (DES-003 Cards; DES-004 Card contract): a group named
 * "Permission request" and described by its title; the icon, title and
 * description, an edit's folder and line totals with its Diff / Rendered
 * tabs (else the summary), the plan through the rendering boundary, the
 * edit's diff ("Reading the file…" until its read arrives), and a footer of
 * Full input, then Deny, Always allow (with suggestions) and Allow,
 * disabled while answering, the outcome label in their place once settled,
 * and the waiting highlight until then. Every CLI or model string is set as
 * text.
 */
export class PermissionCardView extends Component {
	readonly el: HTMLElement;
	private readonly planEl: HTMLElement | null;
	private diffEl: HTMLElement | null;
	private readonly locationEl: HTMLElement | null;
	private tabsEl: HTMLElement | null;
	private readonly statEl: HTMLElement | null;
	private diffShown: CardDiff = "none";
	private readonly footerEl: HTMLElement;
	private readonly answersEl: HTMLElement;
	private readonly buttons: HTMLButtonElement[] = [];
	private settled = false;
	private readonly titleId: string;

	constructor(
		parent: HTMLElement,
		private card: PermissionCard,
		private readonly intents: PermissionCardIntents
	) {
		super();
		const id = `ai-agent-panel-card-${++nextCardId}`;
		this.titleId = `${id}-title`;
		this.el = parent.createDiv({
			cls: "ai-agent-panel-card mod-permission",
			attr: { role: "group", "aria-labelledby": `${id}-name`, "aria-describedby": `${id}-title`, tabindex: "-1" },
		});
		this.el.createSpan({ cls: "ai-agent-panel-visually-hidden", text: "Permission request", attr: { id: `${id}-name` } });
		const head = this.el.createDiv({ cls: "ai-agent-panel-card-head" });
		writeIcon(head.createSpan({ cls: "ai-agent-panel-card-tile", attr: { "aria-hidden": "true" } }), card.icon);
		const heading = head.createDiv({ cls: "ai-agent-panel-card-heading" });
		heading.createDiv({ cls: "ai-agent-panel-card-title", text: card.title, attr: { id: this.titleId } });
		if (card.description) heading.createDiv({ cls: "ai-agent-panel-card-desc", text: card.description });
		const edit = card.diff !== "none";
		if (edit) {
			const sub = heading.createDiv({ cls: "ai-agent-panel-card-sub" });
			this.locationEl = sub.createSpan({ cls: "ai-agent-panel-card-location" });
			this.statEl = sub.createSpan({ cls: "ai-agent-panel-card-stat" });
			this.tabsEl = head.createDiv({ cls: "ai-agent-panel-card-tabs" });
		} else {
			this.locationEl = null;
			this.statEl = null;
			this.tabsEl = null;
			if (card.summary) this.el.createEl("code", { cls: "ai-agent-panel-card-summary", text: card.summary });
		}
		this.planEl = card.plan === null ? null : this.el.createDiv({ cls: "ai-agent-panel-card-plan" });
		this.diffEl = edit ? this.el.createDiv({ cls: "ai-agent-panel-card-diff" }) : null;
		const input = this.el.createEl("pre", { cls: "ai-agent-panel-card-input", text: card.fullInput, attr: { id: `${id}-input`, hidden: "" } });
		this.footerEl = this.el.createDiv({ cls: "ai-agent-panel-card-footer" });
		const toggle = this.footerEl.createEl("button", {
			cls: "ai-agent-panel-card-input-toggle",
			attr: { type: "button", "aria-expanded": "false", "aria-controls": `${id}-input` },
		});
		toggle.appendText("Full input");
		writeIcon(toggle.createSpan({ cls: "ai-agent-panel-card-input-chevron", attr: { "aria-hidden": "true" } }), "chevron-right");
		this.registerDomEvent(toggle, "click", () => {
			const open: boolean = input.hidden === true;
			input.hidden = !open;
			toggle.setAttribute("aria-expanded", String(open));
			writeClass(toggle, "is-open", open);
		});
		this.answersEl = this.footerEl.createDiv({ cls: "ai-agent-panel-card-answers" });
	}

	onload(): void {
		this.register(() => this.el.remove());
		// The primary action last, Deny first in the Tab order.
		this.button("Deny", "is-deny", { type: "deny" });
		if (this.card.suggestions) this.button("Always allow", "is-secondary", { type: "always-allow" });
		this.button("Allow", "is-primary", { type: "allow" }, "check");
		this.draw();
		if (this.planEl && this.card.plan !== null) this.fillPlan(this.planEl, this.card.plan);
	}

	update(card: Card): void {
		if (card.kind !== "permission") return;
		this.card = card;
		this.draw();
	}

	private button(text: string, cls: string, answer: UserAnswer, icon?: string): void {
		const button = this.answersEl.createEl("button", { cls, attr: { type: "button" } });
		if (icon) writeIcon(button.createSpan({ cls: "ai-agent-panel-card-button-icon", attr: { "aria-hidden": "true" } }), icon);
		button.appendText(text);
		this.registerDomEvent(button, "click", () => this.intents.onAnswer(this.card.requestId, answer, this.card.key));
		this.buttons.push(button);
	}

	/** The footer and highlight per the machine (DES-003), then the diff. */
	private draw(): void {
		const chrome = cardChrome(this.card);
		writeClass(this.el, "is-waiting", chrome.highlight);
		writeClass(this.el, "is-settled", chrome.outcome !== null);
		if (this.locationEl) writeText(this.locationEl, cardLocation(this.card));
		if (chrome.outcome !== null) this.settle(chrome.outcome);
		else for (const button of this.buttons) button.disabled = chrome.buttons === "disabled";
		this.drawDiff();
	}

	/** The outcome label in place of the answer buttons; focus on a pressed button stays in the card. */
	private settle(outcome: string): void {
		if (this.settled) return;
		this.settled = true;
		const active = this.el.doc.activeElement;
		const focused = this.buttons.some((button) => button === active);
		this.answersEl.remove();
		this.buttons.length = 0;
		this.footerEl.createDiv({ cls: "ai-agent-panel-card-outcome", text: outcome });
		if (focused) this.el.focus({ preventScroll: true });
	}

	/**
	 * The edit's diff from its pre-edit read, as DES-004's Diff sources say:
	 * the placeholder while it reads, nothing when the read failed or the call
	 * has nothing to diff, and the outside-vault note.
	 */
	private drawDiff(): void {
		const el = this.diffEl;
		const diff = this.card.diff;
		if (!el || diff === this.diffShown) return;
		this.diffShown = diff;
		el.empty();
		if (this.statEl) this.statEl.empty();
		if (diff === "reading") {
			el.createDiv({ cls: "ai-agent-panel-card-loading", text: "Reading the file…" });
			return;
		}
		const drawn = diff === "none" || !this.tabsEl ? null : this.intents.renderDiff(el, this.card.toolName, this.card.input, diff.before, this.tabsEl);
		if (drawn === null || diff === "none") {
			el.remove();
			this.diffEl = null;
			this.tabsEl?.remove();
			this.tabsEl = null;
			return;
		}
		if (this.tabsEl?.childElementCount === 0) {
			this.tabsEl.remove();
			this.tabsEl = null;
		}
		this.tabsEl?.querySelector("[role=tablist]")?.setAttribute("aria-labelledby", this.titleId);
		if (this.statEl) writeDiffStat(this.statEl, drawn.added, drawn.removed);
		if (diff.vaultPath === null) el.createDiv({ cls: "ai-agent-panel-card-note", text: `${diff.reported} is outside this vault.` });
	}

	/**
	 * The plan, whole, through the rendering boundary, as pre-wrapped plain
	 * text if that fails; the card is brought back into view when it settles.
	 */
	private fillPlan(el: HTMLElement, plan: string): void {
		const loading = el.createDiv({ cls: "ai-agent-panel-card-loading", text: "Rendering the plan…" });
		const rendered = this.intents
			.renderMarkdown(plan, el)
			.catch(() => {
				el.empty();
				el.addClass("is-plain");
				el.setText(plan);
			})
			.then(() => loading.remove());
		this.intents.revealAfter(this.el, rendered);
	}
}
