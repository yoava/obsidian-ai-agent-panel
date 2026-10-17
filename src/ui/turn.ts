import { Component, type Events } from "obsidian";
import type { FileDiff } from "../diff";
import { renderFileDiff } from "../diffview";
import { isEditTool, planEdit } from "../edits";
import { AGENT_ICON } from "../state/agent-icon";
import { BRANCH_TITLE } from "../state/branch-history";
import { restorePoint } from "../restore";
import type { Card } from "../state/permission";
import type {
	Activity,
	AgentBlock,
	MessageItem,
	MetaRecord,
	TextBlock,
	ThinkingBlock,
	TurnBlock,
	TurnFooter,
	TurnItem,
} from "../state/tab";
import type { Ticker } from "../state/ticker";
import { headView, thinkingExpandable, thinkingLabel, turnCopyText } from "../state/turn";
import { headRings } from "../state/working-line";
import { RenderThrottle } from "../state/stream-render";
import { footerFiguresText, tokenRows } from "../state/turn-cost";
import { AgentRow } from "./agent-row";
import { copyButton } from "./copy";
import { writeAttr, writeClass, writeIcon, writeText, writeTooltip, type AttachHoverCard, type HoverCardHandle, type ViewImages } from "./dom";
import { PermissionCardView, type PermissionCardIntents } from "./permission-card";
import { QuestionFormView, type QuestionFormIntents } from "./question-form";
import { StepsCard } from "./steps-card";

/** Where a streaming block's deltas go (`tab/chat-tab`'s `DeltaSink`). */
export interface TurnDeltaSink {
	appendDelta(blockId: number, text: string): void;
}

/** A tab as a turn reads it: `item:<id>` and `activity`, the model for the copy text, and its streams. */
export interface TurnTab extends Events {
	readonly activity: Activity;
	readonly items: readonly MessageItem[];
	setDeltaSink(itemId: number, sink: TurnDeltaSink | null): void;
	/** What a streaming block holds so far. */
	streamed(blockId: number): string;
}

export interface TurnSource {
	tab: TurnTab;
	/** The shared 1 s ticker of the head's and agent rows' elapsed times (PRD-001.R29). */
	ticker: Ticker;
}

/** What a card or form needs from outside: its answers, the plan's Markdown, the reveal after the plan renders. */
export interface CardIntents extends Omit<PermissionCardIntents, "renderDiff">, QuestionFormIntents {
	/** Its component could not be built: `tab/permission-flow` replies with an error, so the request does not wait unseen. */
	onCardFailed: (card: Card, error: unknown) => void;
}

/** A permission card or question form as `ui/turn` and `ui/messages` hold it. */
export interface CardView extends Component {
	readonly el: HTMLElement;
	update(card: Card): void;
}

/**
 * An edit's diff into `el` (DES-004 Diff sources), which is on the page:
 * from the file as read to the file now on disk when `after` is known, else
 * the call's own strings applied to `before`; null when the call has
 * nothing to diff. Markdown, what the vault is made of, gets the Rendered
 * tabs, in `tabsHost` when the caller draws the heading.
 */
function editDiff(
	el: HTMLElement,
	name: string,
	input: Record<string, unknown>,
	before: string | null,
	after: string | null,
	renderMarkdown: (markdown: string, el: HTMLElement) => Promise<void>,
	tabsHost?: HTMLElement
): FileDiff | null {
	if (!isEditTool(name)) return null;
	const plan = planEdit(name, input, before);
	if (after !== null) {
		return renderFileDiff(el, before ?? "", after, { note: plan?.note, badge: before === null ? "new file" : undefined, renderMarkdown, tabsHost });
	}
	if (!plan) return null;
	return renderFileDiff(el, plan.before, plan.after, {
		note: plan.note,
		hideLineNumbers: plan.scope === "fragment",
		badge: plan.creates ? "new file" : plan.scope === "fragment" ? "excerpt" : undefined,
		renderMarkdown,
		tabsHost,
	});
}

/**
 * The component for a card or form (DES-003 Cards), drawn into `parent`,
 * which is on the page, as a child of `owner`; null, reported through
 * `onCardFailed`, when it cannot be built. A card's edit diff is drawn here.
 */
export function mountCard(owner: Component, parent: HTMLElement, card: Card, intents: CardIntents): CardView | null {
	const renderDiff: PermissionCardIntents["renderDiff"] = (el, name, input, before, tabsHost) =>
		editDiff(el, name, input, before, null, intents.renderMarkdown, tabsHost);
	let view: CardView;
	try {
		view =
			card.kind === "permission"
				? new PermissionCardView(parent, card, { ...intents, renderDiff })
				: new QuestionFormView(parent, card, intents);
	} catch (error) {
		intents.onCardFailed(card, error);
		return null;
	}
	try {
		return owner.addChild(view);
	} catch (error) {
		owner.removeChild(view);
		intents.onCardFailed(card, error);
		return null;
	}
}

export interface TurnIntents extends CardIntents {
	/** Model Markdown into `el` through `ui/markdown`, its components owned by `owner`. */
	renderMarkdown: (markdown: string, el: HTMLElement, owner?: Component) => Promise<void>;
	/** Scroll-follow, at most once per frame (`ui/messages`). */
	follow: () => void;
	attachHoverCard: AttachHoverCard;
	/** A footer's Restore files button for `tab/restore-branch`, which shows, hides and runs it. */
	attachRestore: (button: HTMLButtonElement, record: MetaRecord) => void;
	/** A footer's Branch button for `tab/restore-branch`, which disables it for a session this device did not record (PRD-002.R15). */
	attachBranch: (button: HTMLButtonElement, record: MetaRecord, retitle: (reason: string | null) => void) => void;
	onBranch: (uuid: string) => void;
	/** A file path a tool call reports as vault-relative when it is inside the vault, else null (a step's summary). */
	toVaultPath: (reported: string) => string | null;
	/** A prompt's or tool result's image, large (`ImageViewerModal`). */
	viewImages: ViewImages;
}

const RESTORE_DESCRIPTION = "Put the files Claude Code tracked for this turn back as they were";
const BRANCH_DESCRIPTION = BRANCH_TITLE;

/** One block as drawn: its element and what it was drawn from. */
interface BlockView {
	block: TurnBlock;
	el: HTMLElement;
	/** A thinking block's streaming text node, which deltas append to; none for a reply, which renders as Markdown. */
	textNode: Text | null;
	/** A streaming reply's render schedule, its pending timer, and a count that voids a render in flight once it settles. */
	throttle: RenderThrottle | null;
	timer: number | null;
	renderSeq: number;
	/** What shows or hides a streaming reply: it pauses its renders while hidden. */
	watch: { observer: IntersectionObserver; doc: Document; onVisibility: () => void } | null;
	/** The component the block's current rendering belongs to; one per block, unloaded when the next rendering replaces it. */
	renderComp: Component | null;
	/**
	 * A thinking block's label, in the head when it is the turn's first block:
	 * a toggle button while the block holds text, plain text before (PRD-001.R15).
	 */
	toggleEl: HTMLElement | null;
	labelEl: HTMLElement | null;
	/** The thinking text the toggle shows and hides. */
	contentEl: HTMLElement | null;
	/** The block's component: a card, a tool-step group, an agent row. */
	component: Component | null;
	card: CardView | null;
	steps: StepsCard | null;
	agent: AgentRow | null;
	/** An agent row's thread, drawn once it is first expanded. */
	thread: BlockList | null;
	inHead: boolean;
	expanded: boolean;
	/** Whether `toggleEl` is the toggle button. */
	expandable: boolean;
	/** The two forms of `toggleEl`, each built once. */
	buttonEl: HTMLButtonElement | null;
	plainEl: HTMLElement | null;
}

let nextThinkingId = 0;
let nextActionId = 0;

/**
 * The blocks of a turn item or of a subagent's thread, in model order, each
 * kept while its id stays (DES-003 Turn head, thinking and footer): reply
 * text, plain with a caret while it streams and then rendered Markdown;
 * thinking behind a toggle, in the head when it is a turn's first block;
 * permission cards and question forms; tool-step groups (`ui/steps-card`);
 * agent rows (`ui/agent-row`), whose threads this draws too, so text,
 * thinking and groups have one drawing path.
 */
class BlockList extends Component {
	private readonly views = new Map<number, BlockView>();

	constructor(
		private readonly bodyEl: HTMLElement,
		/** The turn head's thinking slot; null in a thread. */
		private readonly headThinkingEl: HTMLElement | null,
		private readonly source: TurnSource,
		private readonly intents: TurnIntents
	) {
		super();
	}

	onunload(): void {
		for (const view of this.views.values()) {
			this.stopStreamRender(view);
			this.dropRendering(view);
			view.el.remove();
			view.toggleEl?.remove();
		}
		this.views.clear();
	}

	/**
	 * A delta of a streaming block: a thinking block's one text-node append; a
	 * reply's request for a render, which runs at most once per gap
	 * (`state/stream-render`) and follows the scroll itself.
	 */
	appendDelta(blockId: number, text: string): void {
		const view = this.views.get(blockId);
		if (!view) return;
		if (view.block.kind === "text") {
			if (view.block.streaming) this.requestRender(view);
			return;
		}
		if (!view.textNode) return;
		view.textNode.appendData(text);
		// The first text gives a label its toggle.
		if (view.block.kind === "thinking" && !view.expandable) this.drawThinkingToggle(view);
	}

	draw(blocks: readonly TurnBlock[]): void {
		const keep = new Set(blocks.map((block) => block.id));
		for (const [id, view] of this.views) {
			if (keep.has(id)) continue;
			this.stopStreamRender(view);
			this.dropRendering(view);
			if (view.component) this.removeChild(view.component);
			view.el.remove();
			view.toggleEl?.remove();
			this.views.delete(id);
		}
		let created = false;
		blocks.forEach((block, at) => {
			let view = this.views.get(block.id);
			if (!view) {
				view = this.createBlock(block);
				created ||= block.kind === "agent";
			}
			const inHead = at === 0 && block.kind === "thinking" && this.headThinkingEl !== null;
			if (view.toggleEl) {
				const parent = inHead ? this.headThinkingEl : view.el;
				if (parent && view.toggleEl.parentElement !== parent) parent.prepend(view.toggleEl);
				view.inHead = inHead;
				view.el.toggle(!inHead || view.expanded);
			}
			this.updateBlock(view, block);
		});
		// In model order; an element already in place is not moved.
		blocks.forEach((block, at) => {
			const el = this.views.get(block.id)?.el;
			const current = this.bodyEl.children.item(at);
			if (el && current !== el) this.bodyEl.insertBefore(el, current);
		});
		// An agent row subscribed while detached: the ticker looks again now that it is on the page.
		if (created) this.source.ticker.check();
	}

	private createBlock(block: TurnBlock): BlockView {
		const view: BlockView = {
			block,
			el: createDiv(),
			textNode: null,
			throttle: null,
			timer: null,
			renderSeq: 0,
			watch: null,
			renderComp: null,
			toggleEl: null,
			labelEl: null,
			contentEl: null,
			component: null,
			card: null,
			steps: null,
			agent: null,
			thread: null,
			inHead: false,
			expanded: false,
			expandable: false,
			buttonEl: null,
			plainEl: null,
		};
		if (block.kind === "text") {
			view.el.addClass("ai-agent-panel-turn-text");
		} else if (block.kind === "thinking") {
			view.el.addClass("ai-agent-panel-turn-thinking");
			const id = `ai-agent-panel-thinking-${++nextThinkingId}`;
			const content = view.el.createDiv({ cls: "ai-agent-panel-turn-thinking-text", attr: { id } });
			content.toggle(false);
			view.textNode = content.appendChild(content.doc.createTextNode(""));
			view.contentEl = content;
			view.textNode.data = block.streaming ? this.source.tab.streamed(block.id) : block.text;
			this.drawThinkingToggle(view);
		} else if (block.kind === "card") {
			view.el.addClass("ai-agent-panel-turn-card");
			// On the page before it draws: its diff draws there, and its plan's reveal measures it there.
			this.bodyEl.appendChild(view.el);
			view.card = mountCard(this, view.el, block.card, this.intents);
			view.component = view.card;
		} else if (block.kind === "steps") {
			view.el.addClass("ai-agent-panel-turn-steps");
			const renderMarkdown = this.intents.renderMarkdown;
			view.steps = this.addChild(
				new StepsCard(view.el, block, {
					renderDiff: (el, name, input, before, after) => editDiff(el, name, input, before, after, renderMarkdown) !== null,
					toVaultPath: this.intents.toVaultPath,
					viewImages: this.intents.viewImages,
				})
			);
			view.component = view.steps;
		} else if (block.kind === "agent") {
			view.el.addClass("ai-agent-panel-turn-agent");
			view.agent = this.addChild(
				new AgentRow(view.el, block, this.source.ticker, { onExpand: (bodyEl) => this.drawThread(view, bodyEl) })
			);
			view.component = view.agent;
		}
		if (block.kind === "text") this.drawText(view, block, true);
		this.views.set(block.id, view);
		return view;
	}

	private updateBlock(view: BlockView, block: TurnBlock): void {
		const before = view.block;
		view.block = block;
		if (block.kind === "text" && before.kind === "text" && (before.streaming !== block.streaming || before.text !== block.text))
			this.drawText(view, block, false);
		if (block.kind === "thinking") this.drawThinking(view, block, before.kind === "thinking" ? before : null);
		if (block.kind === "card" && before !== block) view.card?.update(block.card);
		if (block.kind === "steps") view.steps?.update(block);
		if (block.kind === "agent") {
			view.agent?.update(block);
			view.thread?.draw(block.thread);
		}
	}

	/** An agent row's thread, drawn when it is first expanded and kept current after (DES-003 Agent rows and run bar). */
	private drawThread(view: BlockView, bodyEl: HTMLElement): void {
		if (view.thread || !view.agent || view.block.kind !== "agent") return;
		view.thread = view.agent.addChild(new BlockList(bodyEl, null, this.source, this.intents));
		view.thread.draw(view.block.thread);
	}

	/**
	 * Reply text: streaming, rendered through `ui/markdown` in a card with a
	 * caret, re-rendered as deltas arrive but at most once per gap; finished,
	 * rendered once from the whole text. Rendering that rejects keeps the plain
	 * text (PRD-001.R15).
	 */
	private drawText(view: BlockView, block: TextBlock, created: boolean): void {
		const el = view.el;
		// A streaming block already streaming keeps what it shows; its deltas drive it.
		if (block.streaming && el.hasClass("is-streaming")) return;
		this.stopStreamRender(view);
		if (block.streaming) {
			writeClass(el, "is-streaming", true);
			writeClass(el, "is-plain", false);
			el.empty();
			// Text already streamed when the block is drawn (a tab shown mid-reply) renders at once.
			if (created && this.source.tab.streamed(block.id) !== "") this.requestRender(view);
			return;
		}
		// What shows stays until the final rendering replaces it.
		void this.paint(view, block.text, false).then(() => this.intents.follow());
	}

	/**
	 * `text` rendered into a scratch element under a component of its own,
	 * then swapped in for what the block shows, so the old rendering stays
	 * until the new one is ready and the one before it is unloaded (one
	 * component alive per block); a render the block has moved past
	 * (`renderSeq`) is dropped. If rendering rejects, the plain text stays
	 * (PRD-001.R15). `streaming` is the block's state once swapped in.
	 */
	private paint(view: BlockView, text: string, streaming: boolean): Promise<void> {
		const seq = view.renderSeq;
		const scratch = createDiv();
		const owner = this.addChild(new Component());
		const swap = (plain: boolean): void => {
			this.dropRendering(view);
			view.renderComp = owner;
			writeClass(view.el, "is-streaming", streaming);
			writeClass(view.el, "is-plain", plain);
			view.el.empty();
			if (plain) view.el.setText(text);
			else view.el.append(...Array.from(scratch.childNodes));
		};
		return this.intents.renderMarkdown(text, scratch, owner).then(
			() => {
				if (view.renderSeq === seq) swap(false);
				else this.removeChild(owner);
			},
			() => {
				if (view.renderSeq === seq) swap(true);
				else this.removeChild(owner);
			}
		);
	}

	/** Unload the component of the block's current rendering. */
	private dropRendering(view: BlockView): void {
		if (view.renderComp) this.removeChild(view.renderComp);
		view.renderComp = null;
	}

	/** A delta of a streaming reply: a render is asked for, and runs at most once per gap (`state/stream-render`). */
	private requestRender(view: BlockView): void {
		if (!view.throttle) {
			view.throttle = new RenderThrottle();
			this.watchVisibility(view, view.throttle);
		}
		const wait = view.throttle.request(Date.now());
		if (wait !== null) this.scheduleRender(view, wait);
	}

	/**
	 * A streaming reply pauses its renders while it is not on screen (its tab
	 * is not shown) or its window is in the background, and renders once when
	 * it shows again (PRD-001.R29). The observer reports each change of the
	 * block's visibility; the document's `visibilitychange` covers the window.
	 */
	private watchVisibility(view: BlockView, throttle: RenderThrottle): void {
		const doc = view.el.doc;
		let onScreen = true;
		const apply = (): void => {
			const wait = throttle.setHidden(!onScreen || doc.hidden, Date.now());
			if (wait !== null) this.scheduleRender(view, wait);
		};
		const win = view.el.win as typeof window;
		const observer = new win.IntersectionObserver((entries) => {
			const last = entries.at(-1);
			if (!last) return;
			onScreen = last.isIntersecting;
			apply();
		});
		observer.observe(view.el);
		doc.addEventListener("visibilitychange", apply);
		view.watch = { observer, doc, onVisibility: apply };
	}

	private scheduleRender(view: BlockView, wait: number): void {
		view.timer = view.el.win.setTimeout(() => {
			view.timer = null;
			if (!view.throttle?.due()) return;
			void this.renderStreaming(view);
		}, wait);
	}

	/** One render of everything the reply holds so far; the next follows if deltas came meanwhile. */
	private async renderStreaming(view: BlockView): Promise<void> {
		const { block, throttle } = view;
		if (block.kind !== "text" || !block.streaming || !throttle) return;
		const seq = view.renderSeq;
		throttle.begin();
		const start = Date.now();
		await this.paint(view, this.source.tab.streamed(block.id), true);
		if (view.renderSeq !== seq) return;
		this.intents.follow();
		const again = throttle.finished(start, Date.now());
		if (again !== null) this.scheduleRender(view, again);
	}

	/** The block settled or left: its pending render is cancelled and one in flight is dropped when it ends. */
	private stopStreamRender(view: BlockView): void {
		if (view.timer !== null) view.el.win.clearTimeout(view.timer);
		view.timer = null;
		view.renderSeq++;
		view.throttle?.reset();
		if (view.watch) {
			view.watch.observer.disconnect();
			view.watch.doc.removeEventListener("visibilitychange", view.watch.onVisibility);
			view.watch = null;
		}
		view.throttle = null;
	}

	private drawThinking(view: BlockView, block: ThinkingBlock, before: ThinkingBlock | null): void {
		writeClass(view.el, "is-streaming", block.streaming);
		// The whole text replaces what streamed once it is closed.
		if (view.textNode && before?.streaming && !block.streaming) view.textNode.data = block.text;
		this.drawThinkingToggle(view);
		if (view.labelEl) writeText(view.labelEl, thinkingLabel(block));
	}

	/**
	 * A thinking block's label as the toggle button while the block holds text,
	 * else as plain text with no button, chevron or ARIA state, so nothing
	 * invites an expand with nothing under it (PRD-001.R15).
	 */
	private drawThinkingToggle(view: BlockView): void {
		const content = view.contentEl;
		const block = view.block;
		if (!content || !view.textNode || block.kind !== "thinking") return;
		const expandable = thinkingExpandable(view.textNode.data);
		if (view.toggleEl && expandable === view.expandable) return;
		const previous = view.toggleEl;
		view.expandable = expandable;
		// Text that went away closes what it showed.
		if (!expandable) {
			view.expanded = false;
			content.toggle(false);
		}
		// Each form is built once per block, the button with its one click listener.
		const toggleEl = expandable
			? (view.buttonEl ??= this.buildThinkingButton(view, content))
			: (view.plainEl ??= this.buildThinkingPlain());
		if (expandable) {
			writeAttr(toggleEl, "aria-expanded", String(view.expanded));
			writeClass(toggleEl, "is-expanded", view.expanded);
		}
		view.toggleEl = toggleEl;
		view.labelEl = toggleEl.querySelector<HTMLElement>(".ai-agent-panel-turn-thinking-label");
		if (view.labelEl) writeText(view.labelEl, thinkingLabel(block));
		view.el.toggle(!view.inHead || view.expanded);
		if (previous?.parentElement) previous.replaceWith(toggleEl);
	}

	private buildThinkingButton(view: BlockView, content: HTMLElement): HTMLButtonElement {
		const toggle = createEl("button", {
			cls: "ai-agent-panel-turn-thinking-toggle",
			attr: { type: "button", "aria-controls": content.id },
		});
		toggle.createSpan({ cls: "ai-agent-panel-turn-thinking-label" });
		writeIcon(toggle.createSpan({ cls: "ai-agent-panel-turn-thinking-chevron" }), "chevron-right");
		this.registerDomEvent(toggle, "click", () => {
			view.expanded = !view.expanded;
			writeAttr(toggle, "aria-expanded", String(view.expanded));
			writeClass(toggle, "is-expanded", view.expanded);
			content.toggle(view.expanded);
			// Its toggle in the head, the block shows only its text, and only while expanded.
			view.el.toggle(!view.inHead || view.expanded);
		});
		return toggle;
	}

	private buildThinkingPlain(): HTMLElement {
		const plain = createSpan({ cls: "ai-agent-panel-turn-thinking-toggle" });
		plain.createSpan({ cls: "ai-agent-panel-turn-thinking-label" });
		return plain;
	}
}

/**
 * An agent row on its own while no turn runs (PRD-001.R18), mounted by
 * `ui/messages`; its item's changes reach it here.
 */
class AgentItemView extends Component {
	readonly el: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly item: AgentBlock,
		private readonly source: TurnSource,
		private readonly intents: TurnIntents
	) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-turn-body" });
	}

	onload(): void {
		this.register(() => this.el.remove());
		const list = this.addChild(new BlockList(this.el, null, this.source, this.intents));
		list.draw([this.item]);
		this.registerEvent(
			this.source.tab.on(`item:${this.item.id}`, (changed) => {
				const next = changed as MessageItem | undefined;
				if (next?.kind !== "agent") return;
				list.draw([next]);
				// Its thread grows (DES-003 Stream to messages).
				this.intents.follow();
			})
		);
	}
}

export function agentItemView(parent: HTMLElement, item: AgentBlock, source: TurnSource, intents: TurnIntents): Component & { el: HTMLElement } {
	return new AgentItemView(parent, item, source, intents);
}

/**
 * One turn item (DES-003 Turn head, thinking and footer): the head (the
 * mark, ringing while the turn runs, "Claude", the state and the elapsed
 * time on the shared ticker), its blocks (`BlockList`), and the footer once
 * the turn closes. A continuation has no head. Deltas append to the
 * streaming block's one text node, with no layout read.
 */
export class TurnView extends Component implements TurnDeltaSink {
	readonly el: HTMLElement;
	private readonly headEl: HTMLElement | null = null;
	private readonly headThinkingEl: HTMLElement | null = null;
	private readonly stateEl: HTMLElement | null = null;
	private readonly elapsedEl: HTMLElement | null = null;
	private readonly bodyEl: HTMLElement;
	private readonly blocks: BlockList;
	private footerEl: HTMLElement | null = null;
	private figuresCard: HoverCardHandle | null = null;
	private stopTicking: (() => void) | null = null;

	constructor(
		parent: HTMLElement,
		private item: TurnItem,
		private readonly source: TurnSource,
		private readonly intents: TurnIntents
	) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-turn" });
		writeClass(this.el, "is-continuation", item.continuation);
		if (!item.continuation) {
			this.headEl = this.el.createDiv({ cls: "ai-agent-panel-turn-head" });
			writeIcon(this.headEl.createSpan({ cls: "ai-agent-panel-turn-mark", attr: { "aria-hidden": "true" } }), AGENT_ICON);
			this.headEl.createSpan({ cls: "ai-agent-panel-turn-name", text: "Claude" });
			this.headThinkingEl = this.headEl.createSpan({ cls: "ai-agent-panel-turn-head-thinking" });
			this.stateEl = this.headEl.createSpan({ cls: "ai-agent-panel-turn-state" });
			this.elapsedEl = this.headEl.createSpan({ cls: "ai-agent-panel-turn-elapsed" });
		}
		this.bodyEl = this.el.createDiv({ cls: "ai-agent-panel-turn-body" });
		this.blocks = new BlockList(this.bodyEl, this.headThinkingEl, source, intents);
	}

	onload(): void {
		const tab = this.source.tab;
		this.addChild(this.blocks);
		this.register(() => {
			tab.setDeltaSink(this.item.id, null);
			this.stopTicking?.();
			this.stopTicking = null;
			this.figuresCard?.detach();
			this.el.remove();
		});
		tab.setDeltaSink(this.item.id, this);
		this.registerEvent(tab.on(`item:${this.item.id}`, (item) => this.draw(item as TurnItem)));
		if (this.headEl) this.registerEvent(tab.on("activity", () => this.drawHead(Date.now())));
		this.draw(this.item);
	}

	/** A delta of a streaming block: a thinking text-node append, or a reply's request for a throttled render (DES-003 Performance budget). */
	appendDelta(blockId: number, text: string): void {
		this.blocks.appendDelta(blockId, text);
	}

	private draw(item: TurnItem): void {
		this.item = item;
		writeClass(this.el, "is-running", item.running);
		this.blocks.draw(item.blocks);
		this.drawHead(Date.now());
		this.drawFooter(item.footer);
		this.tick();
		// A row or a group added or settled grows the turn (DES-003 Stream to messages).
		this.intents.follow();
	}

	// --- Head --------------------------------------------------------------------

	/** The state and elapsed time while the turn runs, and the mark, which stays still while the working line shows; none once closed (PRD-001.R15). */
	private drawHead(now: number): void {
		if (!this.headEl || !this.stateEl || !this.elapsedEl) return;
		const activity = this.source.tab.activity;
		const view = headView(this.item, activity, now);
		writeText(this.stateEl, view?.label ?? "");
		writeText(this.elapsedEl, view?.elapsed ?? "");
		writeClass(this.stateEl, "is-waiting", this.item.running && activity === "waiting");
		writeClass(this.headEl, "is-working", headRings(this.item.running, activity));
	}

	/** The elapsed time ticks while the head of a running turn shows. */
	private tick(): void {
		const ticking = this.item.running && this.headEl !== null;
		if (ticking && !this.stopTicking)
			this.stopTicking = this.source.ticker.subscribe({
				shown: () => this.item.running && !this.el.doc.hidden && this.headEl?.isShown() === true,
				tick: (now) => this.drawHead(now),
			});
		else if (!ticking && this.stopTicking) {
			this.stopTicking();
			this.stopTicking = null;
		}
	}

	// --- Footer ------------------------------------------------------------------

	/**
	 * Always visible once the turn closes (PRD-001.R15): Restore files where
	 * its record offers it, Branch once the turn's uuid is known, the copy
	 * button, and the duration and cost (PRD-005.R7) or the error; labels hide
	 * below 360 px, where the label shows as a tooltip.
	 */
	private drawFooter(footer: TurnFooter | null): void {
		if (!footer || this.footerEl) return;
		const el = this.el.createDiv({ cls: "ai-agent-panel-turn-footer" });
		this.footerEl = el;
		const record = footer.record;
		if (record && restorePoint(record)) {
			const button = this.footerButton(el, "rotate-ccw", "Restore files", RESTORE_DESCRIPTION);
			this.intents.attachRestore(button, record);
		}
		const uuid = record?.rewindUuid;
		if (uuid) {
			const button = this.footerButton(el, "git-branch", "Branch", BRANCH_DESCRIPTION, BRANCH_TITLE);
			this.registerDomEvent(button, "click", () => this.intents.onBranch(uuid));
			const description = button.querySelector<HTMLElement>(".ai-agent-panel-visually-hidden");
			this.intents.attachBranch(button, record, (reason) => {
				this.nameButton(button, reason ?? BRANCH_TITLE);
				description?.setText(reason ?? BRANCH_DESCRIPTION);
			});
		}
		const turn = this.item.turn;
		copyButton(el, () => turnCopyText(this.source.tab.items, turn), "Copy message");
		el.createDiv({ cls: "ai-agent-panel-turn-footer-spacer" });
		const text = footerFiguresText(footer);
		if (text) {
			const figures = el.createSpan({ cls: "ai-agent-panel-turn-figures", text });
			if (footer.error !== null) figures.addClass("is-error");
			const tokens = footer.tokens;
			// Focusable only with a card to show: a turn finished since the conversation opened (PRD-005.R7).
			if (tokens && footer.error === null) {
				figures.setAttribute("tabindex", "0");
				this.figuresCard = this.intents.attachHoverCard(figures, (card) => {
					const { rows, note } = tokenRows(tokens);
					card.addClass("mod-fixed");
					for (const [label, value] of rows) {
						const row = card.createDiv({ cls: "ai-agent-panel-hover-row mod-muted" });
						row.createSpan({ cls: "ai-agent-panel-hover-label", text: label });
						row.createSpan({ cls: "ai-agent-panel-hover-value", text: value });
					}
					card.createDiv({ cls: "ai-agent-panel-hover-note mod-footnote", text: note });
				});
			}
		}
		this.intents.follow();
	}

	/**
	 * A footer button named by its label and described by `description`. The
	 * label is also its tooltip, which shows only below 360 px, where the label
	 * hides (`--no-tooltip` in styles.css, PRD-001.R32); `aria-labelledby` wins
	 * over the tooltip's `aria-label`.
	 */
	private footerButton(parent: HTMLElement, icon: string, label: string, description: string, title = label): HTMLButtonElement {
		const id = `ai-agent-panel-turn-action-${++nextActionId}`;
		const button = parent.createEl("button", {
			cls: "ai-agent-panel-turn-action",
			attr: { type: "button", "aria-labelledby": `${id}-label`, "aria-describedby": `${id}-title` },
		});
		writeIcon(button.createSpan({ cls: "ai-agent-panel-turn-action-icon" }), icon);
		button.createSpan({ cls: "ai-agent-panel-turn-action-label", text: label, attr: { id: `${id}-label` } });
		button.createSpan({ cls: "ai-agent-panel-visually-hidden", text: description, attr: { id: `${id}-title` } });
		this.nameButton(button, title);
		return button;
	}

	/** A footer button's tooltip: its label, or the reason it is disabled. */
	private nameButton(button: HTMLButtonElement, text: string): void {
		writeTooltip(button, text);
	}
}
