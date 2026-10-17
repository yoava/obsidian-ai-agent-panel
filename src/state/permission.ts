/**
 * The permission card and the question form (DES-003 Permission card and
 * question form; DES-004 Card contract, AskUserQuestion form): a card's
 * content from its request, the machine over waiting, answering and settled
 * with the answer each step gives the CLI, the outcome labels, and the
 * form's selections, title, count and answers.
 */

import type { EditPreImage } from "../edit-tracker";
import type { PermissionRequest, PermissionResult } from "../protocol/types";
import { allowResult } from "../settings-core";
import { editTargetPath, isEditTool } from "../edits";
import { baseName, jsonPreview, obsidianToolPrompt, planOf, summarizeToolInput, toolIcon, type UserQuestion } from "../tool-labels";

/** A settled card's or form's label in place of its buttons (DES-004). */
export const OUTCOME = {
	allowed: "Allowed",
	alwaysAllowed: "Always allowed",
	denied: "Denied",
	cancelled: "Cancelled",
	ended: "Session ended",
	clearing: "Stopped",
	dismissed: "Dismissed",
} as const;

/** What a denial tells Claude (PRD-002.R1, R3, R12). */
export const DENIED_MESSAGE = "The user denied this action in Obsidian.";
export const DISMISSED_MESSAGE = "The user dismissed the question without answering.";
/** A withdrawn request's answer, which the client does not write (DES-004 step 4). */
export const CANCELLED_MESSAGE = "Cancelled";
export const ENDED_MESSAGE = "The agent session ended before this was answered.";
/** The denial of every request while Stop and clear stops the agents: the cards open at the press and the requests that come after. */
export const CLEARING_MESSAGE = "The conversation is being cleared.";

/** Full input's cut (PRD-002.R1). */
export const FULL_INPUT_CHARS = 2000;

export type CardPhase = "waiting" | "answering" | "settled";

/**
 * Whether Allow waits for the call's pre-edit read (PRD-002.R6): none to
 * wait for, still pending (at most 5 s), or settled.
 */
export type ReadGate = "none" | "pending" | "settled";

/** An edit card's diff: its pre-edit read still running, the read, or nothing to show. */
export type CardDiff = "none" | "reading" | EditPreImage;

interface CardBase {
	requestId: string;
	/** The flow's number for this card, given when it opens: an answer names it, so one meant for an earlier card under the same request id finds nothing. */
	key?: number;
	phase: CardPhase;
	/** The outcome label, once settled. */
	outcome: string | null;
	/** The tool input, which an allow returns unchanged. */
	input: Record<string, unknown>;
	/** The call's `tool_use` id, whose step row waits for the answer (DES-003 Tool-step group); null when the CLI sent none. */
	toolUseId: string | null;
	/** A subagent asked: the call's row belongs to its thread. */
	fromAgent: boolean;
}

/** A permission card (DES-004 Card contract); every text is the CLI's or the model's, shown as text. */
export interface PermissionCard extends CardBase {
	kind: "permission";
	toolName: string;
	title: string;
	icon: string;
	description: string | null;
	/** One line, at most 96 characters; "" for none. */
	summary: string;
	/** ExitPlanMode's plan, whole, for the rendering boundary; else null. */
	plan: string | null;
	fullInput: string;
	/** The CLI's suggestions, which Always allow returns unchanged; null offers no Always allow. */
	suggestions: unknown[] | null;
	gate: ReadGate;
	diff: CardDiff;
	/** Answering: whether the answer carries the suggestions. */
	always: boolean;
}

/** An AskUserQuestion form (DES-004 AskUserQuestion form). */
export interface QuestionForm extends CardBase {
	kind: "question";
	questions: readonly UserQuestion[];
}

export type Card = PermissionCard | QuestionForm;

/** One question's answer so far: the options picked, by index, and the Other text. */
export interface Selection {
	picked: readonly number[];
	other: string;
}

/** What happens to a card or form: the user's answers, the read settling, the CLI withdrawing it, the process ending. */
export type CardEvent =
	| { type: "allow" }
	| { type: "always-allow" }
	| { type: "deny" }
	| { type: "submit"; selections: readonly Selection[] }
	| { type: "dismiss" }
	| { type: "read-settled" }
	| { type: "cancelled" }
	| { type: "ended" }
	/** Stop and clear stops the agents: the request is denied. */
	| { type: "clearing" };

/** The user's answers, which a card's or form's buttons give. */
export type UserAnswer = Extract<CardEvent, { type: "allow" | "always-allow" | "deny" | "submit" | "dismiss" }>;

/** A step: the card after an event, and the answer to give the CLI now, or null. */
export interface CardStep {
	card: Card;
	reply: PermissionResult | null;
}

/**
 * A request's card (DES-004 Card contract): titled by the vault-tool
 * sentence, else the CLI's title, else `Allow <tool>?`; the CLI's
 * description; the summary; ExitPlanMode's plan; the input as JSON cut to
 * 2000 characters; Always allow only with suggestions. A title or
 * description that is not a string is not shown.
 */
export function permissionCard(req: PermissionRequest, read: { gate: ReadGate; diff: CardDiff }): PermissionCard {
	const vaultPrompt = obsidianToolPrompt(req.toolName, req.input);
	const title = typeof req.title === "string" ? req.title : undefined;
	const suggestions = req.suggestions;
	return {
		kind: "permission",
		requestId: req.requestId,
		phase: "waiting",
		outcome: null,
		input: req.input,
		...callOf(req),
		toolName: req.toolName,
		title: vaultPrompt?.title ?? title ?? fallbackTitle(req),
		icon: vaultPrompt?.icon ?? toolCardIcon(req.toolName),
		description: typeof req.description === "string" && req.description ? req.description : null,
		summary: summarizeToolInput(req.toolName, req.input),
		plan: req.toolName === "ExitPlanMode" ? planOf(req.input) : null,
		fullInput: jsonPreview(req.input, FULL_INPUT_CHARS),
		suggestions: suggestions && suggestions.length > 0 ? suggestions : null,
		gate: read.gate,
		diff: read.diff,
		always: false,
	};
}

/** `Edit <file>?` for a file edit that names its file, else `Allow <tool>?`. */
function fallbackTitle(req: PermissionRequest): string {
	const path = isEditTool(req.toolName) ? editTargetPath(req.input) : null;
	if (path === null) return `Allow ${req.toolName}?`;
	const name = baseName(path);
	return `${req.toolName === "Write" ? "Write" : "Edit"} ${name}?`;
}

/** The tool's own icon on a step row, else the shield for a tool without one. */
function toolCardIcon(toolName: string): string {
	const icon = toolIcon(toolName);
	return icon === "wrench" ? "shield-alert" : icon;
}

/**
 * Where an edit card says the file lives (DES-003 Permission card): the
 * vault-relative folder once the pre-edit read has named it ("Vault root" for
 * a file at the top), else the summary the card was given.
 */
export function cardLocation(card: PermissionCard): string {
	if (typeof card.diff === "object" && card.diff.vaultPath !== null) {
		const cut = card.diff.vaultPath.lastIndexOf("/");
		return cut < 0 ? "Vault root" : card.diff.vaultPath.slice(0, cut + 1);
	}
	return card.summary;
}

/** A well-formed AskUserQuestion's form (`parseAskUserQuestions`). */
export function questionForm(req: PermissionRequest, questions: readonly UserQuestion[]): QuestionForm {
	return { kind: "question", requestId: req.requestId, phase: "waiting", outcome: null, input: req.input, ...callOf(req), questions };
}

/** The call a request is for: its `tool_use` id (the client passes it unchecked), and whether a subagent asked. */
function callOf(req: PermissionRequest): Pick<CardBase, "toolUseId" | "fromAgent"> {
	return {
		toolUseId: typeof req.toolUseId === "string" && req.toolUseId !== "" ? req.toolUseId : null,
		fromAgent: req.agentId !== undefined && req.agentId !== null,
	};
}

/** A settled card's call runs: answered, not withdrawn, not ended with its session and not denied by Stop and clear (DES-003 Tool-step group). */
export function callProceeds(card: Card): boolean {
	return card.phase === "settled" && card.outcome !== OUTCOME.cancelled && card.outcome !== OUTCOME.ended && card.outcome !== OUTCOME.clearing;
}

/** The tool a card or form asks for. */
export function cardToolName(card: Card): string {
	return card.kind === "permission" ? card.toolName : "AskUserQuestion";
}

function settle(card: Card, outcome: string, reply: PermissionResult): CardStep {
	return { card: { ...card, phase: "settled", outcome }, reply };
}

const deny = (message: string): PermissionResult => ({ behavior: "deny", message });

/** Allow with the input unchanged, and for Always allow the suggestions as received. */
function allowOf(card: PermissionCard, always: boolean): PermissionResult {
	return allowResult(card.input, always ? (card.suggestions ?? undefined) : undefined);
}

/**
 * The machine (DES-003 Permission card and question form), from waiting:
 * Allow or Always allow settles at once, or, while the call's pre-edit read
 * is pending, answers once it settles, the buttons disabled meanwhile
 * (answering); Deny settles at once; Submit with every question answered and
 * Dismiss settle a form; the CLI withdrawing it or the process ending
 * settles either. A settled card ignores everything, so it is answered once.
 */
export function cardStep(card: Card, event: CardEvent): CardStep {
	const same: CardStep = { card, reply: null };
	if (card.phase === "settled") return same;
	if (event.type === "cancelled") return settle(card, OUTCOME.cancelled, deny(CANCELLED_MESSAGE));
	if (event.type === "ended") return settle(card, OUTCOME.ended, deny(ENDED_MESSAGE));
	if (event.type === "clearing") return settle(card, OUTCOME.clearing, deny(CLEARING_MESSAGE));
	if (card.kind === "question") {
		if (event.type === "dismiss") return settle(card, OUTCOME.dismissed, deny(DISMISSED_MESSAGE));
		if (event.type !== "submit") return same;
		const answered = formAnswers(card.questions, event.selections);
		if (!answered) return same;
		return settle(card, answered.label, { behavior: "allow", updatedInput: { ...card.input, answers: answered.answers } });
	}
	switch (event.type) {
		case "allow":
		case "always-allow": {
			const always = event.type === "always-allow";
			if (card.phase !== "waiting" || (always && !card.suggestions)) return same;
			if (card.gate === "pending") return { card: { ...card, phase: "answering", always }, reply: null };
			return settle(card, always ? OUTCOME.alwaysAllowed : OUTCOME.allowed, allowOf(card, always));
		}
		case "deny":
			return card.phase === "waiting" ? settle(card, OUTCOME.denied, deny(DENIED_MESSAGE)) : same;
		case "read-settled": {
			if (card.gate !== "pending") return same;
			const read: PermissionCard = { ...card, gate: "settled" };
			if (card.phase !== "answering") return { card: read, reply: null };
			return settle(read, card.always ? OUTCOME.alwaysAllowed : OUTCOME.allowed, allowOf(card, card.always));
		}
		default:
			return same;
	}
}

/**
 * What a card or form shows in its footer (DES-003): the buttons, disabled
 * while answering, with the waiting highlight; once settled, the outcome
 * label in their place and no highlight.
 */
export function cardChrome(card: Card): { highlight: boolean; buttons: "enabled" | "disabled" | null; outcome: string | null } {
	if (card.phase === "settled") return { highlight: false, buttons: null, outcome: card.outcome };
	return { highlight: true, buttons: card.phase === "answering" ? "disabled" : "enabled", outcome: null };
}

// --- The question form (PRD-002.R12) --------------------------------------------

/** The form's title. */
export function formTitle(questions: readonly UserQuestion[]): string {
	return questions.length > 1 ? "Claude has questions" : "Claude has a question";
}

export function emptySelections(questions: readonly UserQuestion[]): Selection[] {
	return questions.map(() => ({ picked: [], other: "" }));
}

/**
 * An option checked or unchecked. Single-select keeps one answer: checking
 * an option replaces the pick and clears the Other text.
 */
export function pickOption(selection: Selection, question: UserQuestion, option: number, checked: boolean): Selection {
	const rest = selection.picked.filter((index) => index !== option);
	if (!checked) return { ...selection, picked: rest };
	if (!question.multiSelect) return { picked: [option], other: "" };
	return selection.picked.includes(option) ? selection : { ...selection, picked: [...selection.picked, option] };
}

/** The Other text typed. Single-select keeps one answer: text that is not blank clears the pick. */
export function typeOther(selection: Selection, question: UserQuestion, text: string): Selection {
	if (!question.multiSelect && text.trim()) return { picked: [], other: text };
	return { ...selection, other: text };
}

/** An option picked or Other text that is not blank. */
export function isAnswered(selection: Selection | undefined): boolean {
	return !!selection && (selection.picked.length > 0 || selection.other.trim().length > 0);
}

/** "N of M answered", while the form waits. */
export function answeredText(questions: readonly UserQuestion[], selections: readonly Selection[]): string {
	const answered = questions.filter((_, index) => isAnswered(selections[index])).length;
	return `${answered} of ${questions.length} answered`;
}

/** Submit is enabled once every question has an answer. */
export function canSubmit(questions: readonly UserQuestion[], selections: readonly Selection[]): boolean {
	return questions.every((_, index) => isAnswered(selections[index]));
}

/**
 * Each question's text mapped to its picked labels, in option order, then
 * its trimmed Other text, joined by ", "; the label "Answered:" and the
 * answers joined by " · ". Null until every question has an answer.
 */
export function formAnswers(
	questions: readonly UserQuestion[],
	selections: readonly Selection[]
): { answers: Record<string, string>; label: string } | null {
	if (!canSubmit(questions, selections)) return null;
	const answers: Record<string, string> = {};
	const chosen: string[] = [];
	questions.forEach((question, index) => {
		const selection = selections[index];
		const labels = question.options.filter((_, option) => selection.picked.includes(option)).map((option) => option.label);
		const other = selection.other.trim();
		if (other) labels.push(other);
		answers[question.question] = labels.join(", ");
		chosen.push(answers[question.question]);
	});
	return { answers, label: `Answered: ${chosen.join(" · ")}` };
}

/**
 * Whether an option's label is a path, which the form sets in the code font:
 * no spaces, and a folder ("Templates/"), a rooted or relative path, or a
 * path ending in a file extension. "and/or" is words, not a path.
 */
export function isPathLike(label: string): boolean {
	const text = label.trim();
	if (text === "" || /\s/.test(text)) return false;
	if (text.endsWith("/") || /^(?:\/|\.{1,2}\/|~\/)/.test(text)) return text.length > 1;
	return text.includes("/") && /\.[A-Za-z0-9]{1,8}$/.test(text);
}
