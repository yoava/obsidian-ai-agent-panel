import { Component } from "obsidian";
import {
	answeredText,
	canSubmit,
	cardChrome,
	emptySelections,
	formTitle,
	isPathLike,
	pickOption,
	typeOther,
	type Card,
	type QuestionForm,
	type Selection,
	type UserAnswer,
} from "../state/permission";
import { writeClass, writeIcon, writeText } from "./dom";

export interface QuestionFormIntents {
	/** Submit or Dismiss: `tab/permission-flow` answers. */
	onAnswer: (requestId: string, answer: UserAnswer, key: number | undefined) => void;
}

/** One question's controls. */
interface QuestionControls {
	fieldset: HTMLFieldSetElement;
	options: { label: HTMLElement; input: HTMLInputElement }[];
	other: HTMLInputElement;
}

let nextFormId = 0;

/**
 * An AskUserQuestion form (DES-003 Cards; DES-004 AskUserQuestion form): a
 * group named by its title, "N of M answered" while it waits; per question
 * a fieldset with its header chip and text, the options as native radio or
 * checkbox cards with their descriptions, "Select all that apply" for
 * multi-select, and an "Other…" field; Dismiss and Submit, Submit enabled
 * once every question has an answer; the outcome label in their place once
 * settled. Every CLI or model string is set as text.
 */
export class QuestionFormView extends Component {
	readonly el: HTMLElement;
	private readonly countEl: HTMLElement;
	private readonly footerEl: HTMLElement;
	private readonly controls: QuestionControls[] = [];
	private submitEl: HTMLButtonElement | null = null;
	private selections: Selection[];
	private settled = false;

	constructor(
		parent: HTMLElement,
		private form: QuestionForm,
		private readonly intents: QuestionFormIntents
	) {
		super();
		const id = `ai-agent-panel-form-${++nextFormId}`;
		this.selections = emptySelections(form.questions);
		this.el = parent.createDiv({
			cls: "ai-agent-panel-card mod-question",
			attr: { role: "group", "aria-labelledby": `${id}-title`, tabindex: "-1" },
		});
		const head = this.el.createDiv({ cls: "ai-agent-panel-card-head" });
		writeIcon(head.createSpan({ cls: "ai-agent-panel-card-tile", attr: { "aria-hidden": "true" } }), ["circle-help", "help-circle"]);
		head.createDiv({ cls: "ai-agent-panel-card-title", text: formTitle(form.questions), attr: { id: `${id}-title` } });
		this.countEl = head.createDiv({ cls: "ai-agent-panel-card-count" });
		form.questions.forEach((question, at) => {
			const qid = `${id}-q${at}`;
			const fieldset = this.el.createEl("fieldset", { cls: "ai-agent-panel-question" });
			const legend = fieldset.createEl("legend", { cls: "ai-agent-panel-question-legend" });
			if (question.header) legend.createSpan({ cls: "ai-agent-panel-question-chip", text: question.header });
			legend.createSpan({ cls: "ai-agent-panel-question-text", text: question.question });
			const list = fieldset.createDiv({ cls: "ai-agent-panel-question-options" });
			if (question.multiSelect) list.addClass("is-multi");
			const options = question.options.map((option, index) => {
				const label = list.createEl("label", { cls: "ai-agent-panel-question-option" });
				const input = label.createEl("input", {
					attr: { type: question.multiSelect ? "checkbox" : "radio", name: qid, "aria-labelledby": `${qid}-o${index}` },
				});
				const text = label.createSpan({ cls: "ai-agent-panel-question-option-text" });
				const name = text.createSpan({ cls: "ai-agent-panel-question-option-label", text: option.label, attr: { id: `${qid}-o${index}` } });
				if (isPathLike(option.label)) name.addClass("is-path");
				if (option.description) {
					text.createSpan({ cls: "ai-agent-panel-question-option-desc", text: option.description, attr: { id: `${qid}-d${index}` } });
					input.setAttribute("aria-describedby", `${qid}-d${index}`);
				}
				return { label, input };
			});
			if (question.multiSelect) {
				fieldset.createDiv({ cls: "ai-agent-panel-question-hint", text: "Select all that apply", attr: { id: `${qid}-hint` } });
				fieldset.setAttribute("aria-describedby", `${qid}-hint`);
			}
			fieldset.createEl("label", { cls: "ai-agent-panel-visually-hidden", text: "Other answer", attr: { for: `${qid}-other` } });
			const other = fieldset.createEl("input", {
				cls: "ai-agent-panel-question-other",
				attr: { type: "text", id: `${qid}-other`, placeholder: "Other…" },
			});
			this.controls.push({ fieldset, options, other });
		});
		this.footerEl = this.el.createDiv({ cls: "ai-agent-panel-card-footer" });
	}

	onload(): void {
		this.register(() => this.el.remove());
		this.form.questions.forEach((question, at) => {
			const controls = this.controls[at];
			controls.options.forEach(({ input }, index) =>
				this.registerDomEvent(input, "change", () => this.select(at, pickOption(this.selections[at], question, index, input.checked)))
			);
			this.registerDomEvent(controls.other, "input", () =>
				this.select(at, typeOther(this.selections[at], question, controls.other.value))
			);
		});
		const dismiss = this.footerEl.createEl("button", { cls: "is-ghost", text: "Dismiss", attr: { type: "button" } });
		this.registerDomEvent(dismiss, "click", () => this.intents.onAnswer(this.form.requestId, { type: "dismiss" }, this.form.key));
		const submit = this.footerEl.createEl("button", { cls: "is-primary", text: "Submit answers", attr: { type: "button" } });
		this.registerDomEvent(submit, "click", () =>
			this.intents.onAnswer(this.form.requestId, { type: "submit", selections: this.selections }, this.form.key)
		);
		this.submitEl = submit;
		this.draw();
	}

	update(card: Card): void {
		if (card.kind !== "question") return;
		this.form = card;
		this.draw();
	}

	private select(at: number, selection: Selection): void {
		this.selections = this.selections.map((entry, index) => (index === at ? selection : entry));
		this.draw();
	}

	/** The controls from the selections; the count and Submit while waiting; the outcome once settled. */
	private draw(): void {
		const questions = this.form.questions;
		this.controls.forEach(({ options, other }, at) => {
			const selection = this.selections[at];
			options.forEach(({ label, input }, index) => {
				const picked = selection.picked.includes(index);
				if (input.checked !== picked) input.checked = picked;
				writeClass(label, "is-selected", picked);
			});
			if (other.value !== selection.other) other.value = selection.other;
		});
		const chrome = cardChrome(this.form);
		writeClass(this.el, "is-waiting", chrome.highlight);
		writeClass(this.el, "is-settled", chrome.outcome !== null);
		if (chrome.outcome !== null) {
			this.settle(chrome.outcome);
			return;
		}
		writeText(this.countEl, answeredText(questions, this.selections));
		if (this.submitEl) this.submitEl.disabled = !canSubmit(questions, this.selections);
	}

	/** The outcome label in place of the buttons, the questions disabled; focus on a pressed button stays in the form. */
	private settle(outcome: string): void {
		if (this.settled) return;
		this.settled = true;
		const focused = this.footerEl.contains(this.el.doc.activeElement);
		for (const { fieldset } of this.controls) fieldset.disabled = true;
		writeText(this.countEl, "");
		this.footerEl.empty();
		this.submitEl = null;
		this.footerEl.createDiv({ cls: "ai-agent-panel-card-outcome", text: outcome });
		if (focused) this.el.focus({ preventScroll: true });
	}
}
