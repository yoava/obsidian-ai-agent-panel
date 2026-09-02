import {
	arrayBufferToBase64,
	FuzzySuggestModal,
	ItemView,
	Keymap,
	MarkdownRenderer,
	MarkdownView,
	Menu,
	Notice,
	parseLinktext,
	setIcon,
	setTooltip,
	TFile,
	TFolder,
	type App,
	type TAbstractFile,
	type WorkspaceLeaf,
} from "obsidian";
import { ClaudeSession } from "./session";
import {
	ConversationPickerModal,
	newConversationId,
	type StoredConversation,
	type StoredMessage,
} from "./history";
import { FileMentionSuggest, LOCAL_USAGE_COMMANDS, SlashCommandSuggest } from "./suggest";
import {
	MIN_USAGE_REFRESH_SECONDS,
	cliPermissionMode,
	defaultProfile,
	profileById,
	type ChatPermissionMode,
} from "./settings";
import { editTargetPath, isEditTool, planEdit, vaultRelativePath } from "./edits";
import { formatShellResultForChat, runShellCommand, type ShellResult } from "./bash";
import { McpServer, type JsonRpcMessage } from "./mcp/server";
import { createVaultTools } from "./mcp/vault-tools";
import {
	changeTotals,
	renderFileDiff,
	RestoreConfirmModal,
	SessionChangesModal,
	type FileChange,
} from "./diffview";
import { planRestore, type Checkpoint } from "./checkpoints";
import { describeModel, describeModelId, modelOptions, parseCliModels } from "./models";
import { AGENT_ICON } from "./icon";
import {
	creditsMarkdown,
	formatRemaining,
	UsageDetailModal,
	usageMarkdown,
	usageTooltip,
	type UsageClient,
} from "./usage";
import type {
	AssistantMessage,
	BackgroundTask,
	ContentBlock,
	ContextUsage,
	PermissionRequest,
	PermissionResult,
	PermissionMode,
	ResultMessage,
	StreamEventMessage,
	StreamMessage,
	ToolResultBlock,
	ToolUseBlock,
	UserMessage,
} from "./protocol/types";
import type AgentPanelPlugin from "./main";

export const VIEW_TYPE_AGENT_PANEL = "ai-agent-panel-chat";

const MAX_SELECTION_CHARS = 8000;
const MAX_PREVIEW_CHARS = 1500;
const MAX_TAB_LABEL_CHARS = 24;
/** Links/backlinks/properties listed per section in the vault-context chip. */
const MAX_CONTEXT_LINKS = 40;
/** Titles in the overflow tab picker, which has the whole pane width. */
const MAX_TAB_MENU_LABEL_CHARS = 60;
/** Distance from a strip edge at which a dragged tab starts auto-scrolling. */
const TAB_DRAG_EDGE_PX = 28;
const TAB_DRAG_SCROLL_PX = 12;
/** Slack left beside a tab that was just scrolled into view. */
const TAB_REVEAL_PAD_PX = 12;
/**
 * Pane width from which "auto" puts the tabs in a side column: the column plus
 * a transcript still worth reading. The second number is the slack that has to
 * be lost again before it flips back, so dragging the pane edge across the
 * threshold cannot make the layout flicker.
 */
const TABS_SIDE_MIN_WIDTH_PX = 560;
const TABS_SIDE_HYSTERESIS_PX = 40;

/** App.saveLocalStorage key holding the open-tab state (per vault+machine). */
const TAB_STATE_KEY = "ai-agent-panel:open-tabs";

/** Name of the in-process MCP server; tools appear as `mcp__obsidian__…`. */
const OBSIDIAN_MCP_SERVER = "obsidian";

const INPUT_PLACEHOLDER =
	"Ask Claude about your vault… (@ mentions a file, / runs a command, Enter sends)";
const BUSY_PLACEHOLDER = "Claude is working - Enter queues another message…";
const WAITING_PLACEHOLDER = "Claude is waiting for your response above…";

const EFFORT_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "", label: "Default" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
	{ value: "xhigh", label: "Extra high" },
	{ value: "max", label: "Max" },
];

const MODE_OPTIONS: Array<{
	value: ChatPermissionMode;
	label: string;
	short: string;
	icon: string;
	/** Tints the control red: nothing will stop a tool from running. */
	warn?: boolean;
}> = [
	{ value: "default", label: "Ask before acting", short: "Ask", icon: "shield" },
	{
		value: "acceptEdits",
		label: "Accept edits",
		short: "Edits",
		icon: "shield-check",
	},
	{ value: "plan", label: "Plan (read-only)", short: "Plan", icon: "clipboard-list" },
	{
		value: "auto",
		label: "⚠ Auto-approve everything",
		short: "Auto",
		icon: "zap",
		warn: true,
	},
	{
		value: "bypassPermissions",
		label: "⚠ Bypass permissions",
		short: "Bypass",
		icon: "shield-off",
		warn: true,
	},
];

interface ToolCard {
	rootEl: HTMLElement;
	statusEl: HTMLElement;
	bodyEl: HTMLElement;
	/** Extra header slot for an edit card's +/- counts. */
	statEl: HTMLElement;
}

/**
 * A file's contents captured when an edit tool was announced but before it ran.
 * The `tool_use` block arrives ahead of execution, which is the only moment the
 * pre-image is still on disk.
 */
interface EditPreImage {
	/** Path exactly as the tool reported it. */
	reported: string;
	/** Vault-relative form, or null when the path lies outside the vault. */
	vaultPath: string | null;
	/** Contents before the edit, or null when the file did not exist. */
	before: string | null;
}

interface StreamingBlock {
	el: HTMLElement;
	buffer: string;
}

/** The nested, collapsed transcript of one subagent, keyed by its Task tool-use id. */
interface SubagentThread {
	labelEl: HTMLElement;
	metaEl: HTMLElement;
	bodyEl: HTMLElement;
	toolCards: Map<string, { rowEl: HTMLElement; statusEl: HTMLElement }>;
	/** Every model the agent used - it can be stepped down mid-run. */
	models: Set<string>;
	/** Text blocks and tool calls seen, as a progress signal while it runs. */
	steps: number;
	/** Running token total from the agent's own messages. */
	tokens: number;
	subagentType?: string;
	description?: string;
	/** Authoritative totals, once `task_notification` reports them. */
	totalTokens?: number;
	toolUses?: number;
	durationMs?: number;
	status?: string;
}

/** An image waiting in the composer, already base64-encoded for the wire. */
interface PendingImage {
	mediaType: string;
	base64: string;
	name: string;
	bytes: number;
}

/** Image types the API accepts; anything else is refused rather than guessed at. */
const IMAGE_MEDIA_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
]);
const MAX_IMAGES_PER_MESSAGE = 8;
/** Roughly the API's per-image ceiling; the CLI downscales, but not unboundedly. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Cumulative token/cost totals for one conversation, from its result messages. */
interface ConversationUsage {
	inputTokens: number;
	outputTokens: number;
	cacheWriteTokens: number;
	cacheReadTokens: number;
	costUsd: number;
	turns: number;
	context: ContextUsage | null;
}

/**
 * One conversation tab: its CLI session, transcript element, and every piece
 * of state the composer swaps when the tab becomes active. Sessions keep
 * streaming into their own tab's transcript while another tab is shown.
 */
interface ChatTab {
	id: number;
	tabEl: HTMLElement;
	labelEl: HTMLElement;
	messagesEl: HTMLElement;
	session: ClaudeSession | null;
	/** In-flight createSession(), so concurrent sends don't spawn duplicates. */
	sessionInit: Promise<boolean> | null;
	busy: boolean;
	conversation: StoredConversation | null;
	resumeSessionId: string | null;
	toolCards: Map<string, ToolCard>;
	toolRecords: Map<string, Extract<StoredMessage, { kind: "tool" }>>;
	/** Pre-images per tool-use id, in flight from the moment the edit is announced. */
	editPreImages: Map<string, Promise<EditPreImage | null>>;
	/** Net change per file this conversation touched, keyed by path. */
	changedFiles: Map<string, FileChange>;
	/** Nested subagent transcripts, keyed by their parent Task tool-use id. */
	subagentThreads: Map<string, SubagentThread>;
	/** 1-based count of turns sent in this tab; the key for file checkpoints. */
	turn: number;
	/** uuid of the current turn's user message, once the CLI echoes it back. */
	turnUuid: string | null;
	/** Spawn this session as a branch of `resumeSessionId` rather than continuing it. */
	forkOnResume: boolean;
	/** Background work the CLI says is still running. */
	backgroundTasks: Map<string, BackgroundTask>;
	usage: ConversationUsage;
	streamingText: StreamingBlock | null;
	streamingThinking: StreamingBlock | null;
	typingEl: HTMLElement | null;
	/** Elapsed-time label inside the typing indicator. */
	typingTimeEl: HTMLElement | null;
	/** State label inside the typing indicator ("waiting for you"). */
	typingLabelEl: HTMLElement | null;
	/** When the current busy stretch started (drives the elapsed timer). */
	busySince: number | null;
	pendingPermissions: Map<
		string,
		{ resolve: (result: PermissionResult) => void; settle: (label: string) => void }
	>;
	includeContext: boolean;
	/** Whether the active folder is sent as context. */
	includeActiveFolder: boolean;
	/** Whether the active note's links, backlinks and properties are sent. */
	includeVaultContext: boolean;
	/** Files/folders attached via "+"; listed in the next message's context. */
	contextItems: TAbstractFile[];
	/** Images pasted or dropped into the composer, sent with the next message. */
	attachments: PendingImage[];
	selectedModel: string;
	selectedEffort: string;
	selectedMode: ChatPermissionMode;
	/** CLI profile this conversation spawns with; falls back to the default profile. */
	selectedProfileId: string;
	/** Header status line (model name) shown while this tab is active. */
	statusText: string;
	/** Composer draft preserved across tab switches. */
	draft: string;
	/** Scroll state captured on switch-away (lost while display: none). */
	scrollTop: number;
	nearBottom: boolean;
}

export class AgentPanelView extends ItemView {
	private tabs: ChatTab[] = [];
	private active: ChatTab | null = null;
	private nextTabId = 1;
	/** Tab being dragged to a new position, if any. */
	private draggedTab: ChatTab | null = null;
	/** Set when a drag ends on a real drop target (vs. Escape / off-strip). */
	private tabDropCommitted = false;

	private bodyEl!: HTMLElement;
	private tabListEl!: HTMLElement;
	/** Chevron opening the tab picker; only shown while the strip overflows. */
	private tabMenuBtn!: HTMLElement;
	/** Tabs are a column beside the transcript rather than a strip above it. */
	private tabsOnSide = false;
	private messagesContainerEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendButton!: HTMLButtonElement;
	private stopButton!: HTMLButtonElement;
	private composerEl!: HTMLElement;
	/** The four pickers in the row under the composer; profile hides when alone. */
	private modelSegmentEl!: HTMLButtonElement;
	private effortSegmentEl!: HTMLButtonElement;
	private modeSegmentEl!: HTMLButtonElement;
	private profileSegmentEl!: HTMLButtonElement;
	private mentionSuggest!: FileMentionSuggest;
	private slashSuggest!: SlashCommandSuggest;
	private chipsEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private transcriptLinkEl!: HTMLElement;
	private changesLinkEl!: HTMLElement;
	private usageBarEl!: HTMLElement;
	private backgroundTasksEl!: HTMLElement;
	private contextMeterEl!: HTMLElement;
	private usageUnsubscribe: (() => void) | null = null;
	/** 1 Hz elapsed-time updates; runs only while a tab is busy. */
	private busyTimer: number | null = null;
	/** Usage render/refresh poll; runs only while the strip is visible. */
	private usageTimer: number | null = null;
	private usagePeriodMs = 0;
	/** A snapshot arrived while hidden; re-render on next show. */
	private usageDirty = false;

	/** Folder last selected in the file explorer; overrides the note's parent. */
	private selectedFolder: TFolder | null = null;
	/** State fingerprint of the last chips render, to skip no-op re-renders. */
	private chipsKey: string | null = null;
	private lastEditorView: MarkdownView | null = null;
	/** Pending rAF handle coalescing scroll-follows during fast streaming. */
	private streamScrollRaf: number | null = null;
	/** The in-process "obsidian" MCP server, created on first use. */
	private obsidianMcp: McpServer | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: AgentPanelPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_AGENT_PANEL;
	}

	getDisplayText(): string {
		return "AI Agent Panel";
	}

	getIcon(): string {
		return AGENT_ICON;
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("ai-agent-panel-view");

		// Header
		const header = root.createDiv({ cls: "ai-agent-panel-header" });
		const title = header.createDiv({ cls: "ai-agent-panel-title" });
		const titleIcon = title.createSpan({ cls: "ai-agent-panel-title-icon" });
		setIcon(titleIcon, AGENT_ICON);
		title.createSpan({ cls: "ai-agent-panel-title-text", text: "AI Agent Panel" });
		this.statusEl = header.createSpan({ cls: "ai-agent-panel-status" });
		this.transcriptLinkEl = header.createSpan({
			cls: "ai-agent-panel-transcript-link is-hidden",
			text: "transcript",
		});
		this.transcriptLinkEl.addEventListener("click", () => this.openTranscriptNote());
		this.changesLinkEl = header.createSpan({
			cls: "ai-agent-panel-changes-link is-hidden",
		});
		this.changesLinkEl.addEventListener("click", () => this.openSessionChanges());
		const headerActions = header.createDiv({ cls: "ai-agent-panel-header-actions" });
		const historyBtn = headerActions.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": "Previous conversations" },
		});
		setIcon(historyBtn, "history");
		historyBtn.addEventListener("click", () => void this.openHistory());
		const settingsBtn = headerActions.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": "Plugin settings" },
		});
		setIcon(settingsBtn, "settings");
		settingsBtn.addEventListener("click", () => this.plugin.openSettings());

		// Tabs and everything they belong to. The body is a column (tabs above the
		// transcript) or a row (tabs beside it) - see applyTabPosition.
		const body = root.createDiv({ cls: "ai-agent-panel-body" });
		this.bodyEl = body;

		// Tab strip
		const tabs = body.createDiv({ cls: "ai-agent-panel-tabs" });
		this.tabListEl = tabs.createDiv({ cls: "ai-agent-panel-tab-list" });
		// A one-line strip has no vertical axis to scroll, so a plain wheel (the
		// only scroll gesture most mice offer) is redirected sideways. The event
		// is consumed only while the strip can still move that way, leaving the
		// transcript's own scroll untouched at either end. A side column scrolls
		// vertically on its own, so it wants none of this.
		this.registerDomEvent(
			tabs,
			"wheel",
			(evt) => {
				if (this.tabsOnSide) return;
				const delta =
					Math.abs(evt.deltaY) > Math.abs(evt.deltaX) ? evt.deltaY : evt.deltaX;
				const el = this.tabListEl;
				const max = el.scrollWidth - el.clientWidth;
				if (max <= 0) return;
				const next = Math.max(0, Math.min(max, el.scrollLeft + delta));
				if (next === el.scrollLeft) return;
				evt.preventDefault();
				el.scrollLeft = next;
				this.updateTabOverflow();
			},
			{ passive: false }
		);
		this.registerDomEvent(this.tabListEl, "scroll", () => this.updateTabOverflow());
		// Reordering across a scrolled strip needs the edges to pull: a tab held
		// near either end keeps the hidden tabs coming.
		this.registerDomEvent(this.tabListEl, "dragover", (evt) => {
			if (!this.draggedTab) return;
			const rect = this.tabListEl.getBoundingClientRect();
			if (this.tabsOnSide) {
				if (evt.clientY < rect.top + TAB_DRAG_EDGE_PX)
					this.tabListEl.scrollTop -= TAB_DRAG_SCROLL_PX;
				else if (evt.clientY > rect.bottom - TAB_DRAG_EDGE_PX)
					this.tabListEl.scrollTop += TAB_DRAG_SCROLL_PX;
			} else if (evt.clientX < rect.left + TAB_DRAG_EDGE_PX)
				this.tabListEl.scrollLeft -= TAB_DRAG_SCROLL_PX;
			else if (evt.clientX > rect.right - TAB_DRAG_EDGE_PX)
				this.tabListEl.scrollLeft += TAB_DRAG_SCROLL_PX;
		});
		this.tabMenuBtn = tabs.createEl("button", {
			cls: "clickable-icon ai-agent-panel-tab-menu is-hidden",
			attr: { "aria-label": "All conversation tabs" },
		});
		setIcon(this.tabMenuBtn, "chevron-down");
		this.tabMenuBtn.addEventListener("click", () => this.openTabMenu());
		const newTabBtn = tabs.createEl("button", {
			cls: "clickable-icon ai-agent-panel-tab-new",
			attr: { "aria-label": "New conversation tab" },
		});
		setIcon(newTabBtn, "plus");
		newTabBtn.addEventListener("click", () => this.newConversation());

		const main = body.createDiv({ cls: "ai-agent-panel-main" });

		// Transcripts (one per tab; only the active tab's is visible)
		this.messagesContainerEl = main.createDiv({
			cls: "ai-agent-panel-messages-container",
		});
		// Markdown rendered outside a Markdown view carries no link behaviour of
		// its own, so replies' links do nothing until wired up here: vault links
		// open the note (auxclick covers middle-click → new tab), external ones
		// go to the system handler, and hovering feeds the page-preview plugin.
		this.registerDomEvent(this.messagesContainerEl, "click", (evt) =>
			this.handleLinkClick(evt)
		);
		this.registerDomEvent(this.messagesContainerEl, "auxclick", (evt) =>
			this.handleLinkClick(evt)
		);
		this.registerDomEvent(this.messagesContainerEl, "mouseover", (evt) =>
			this.handleLinkHover(evt)
		);

		// Composer
		const composer = main.createDiv({ cls: "ai-agent-panel-composer" });
		this.composerEl = composer;

		this.backgroundTasksEl = composer.createDiv({
			cls: "ai-agent-panel-bgtasks is-hidden",
		});

		this.chipsEl = composer.createDiv({ cls: "ai-agent-panel-chips" });

		this.inputEl = composer.createEl("textarea", {
			cls: "ai-agent-panel-input",
			attr: { placeholder: INPUT_PLACEHOLDER, rows: "3" },
		});
		// Created before the Enter handler below: while their popups are open
		// they consume Enter/Tab/arrows via stopImmediatePropagation.
		this.mentionSuggest = new FileMentionSuggest(this.app, this.inputEl, composer);
		this.slashSuggest = new SlashCommandSuggest(this.inputEl, composer);
		if (this.plugin.slashCommands) this.slashSuggest.setCommands(this.plugin.slashCommands);
		this.inputEl.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" && !evt.shiftKey && !evt.isComposing) {
				evt.preventDefault();
				void this.handleSend();
			}
		});

		// Images: paste into the composer, or drop anywhere on it. Dropping is
		// only intercepted when the payload actually carries files, so Obsidian's
		// own note-link drop still works.
		this.registerDomEvent(this.inputEl, "paste", (evt) => {
			const files = imageFilesFrom(evt.clipboardData);
			if (files.length === 0) return;
			evt.preventDefault();
			void this.attachImages(files);
		});
		this.registerDomEvent(composer, "dragover", (evt) => {
			if (!hasFiles(evt.dataTransfer)) return;
			evt.preventDefault();
			composer.addClass("is-drop-target");
		});
		this.registerDomEvent(composer, "dragleave", (evt) => {
			if (evt.target === composer) composer.removeClass("is-drop-target");
		});
		this.registerDomEvent(composer, "drop", (evt) => {
			composer.removeClass("is-drop-target");
			const files = imageFilesFrom(evt.dataTransfer);
			if (files.length === 0) return;
			evt.preventDefault();
			void this.attachImages(files);
		});

		const footer = composer.createDiv({ cls: "ai-agent-panel-composer-footer" });

		const addBtn = footer.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": "Attach a file as context" },
		});
		setIcon(addBtn, "plus");
		addBtn.addEventListener("click", () => this.openAddContext());

		const slashBtn = footer.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": "Show commands" },
		});
		// Boxed [/] like the CLI's command hint; icon name varies across the
		// Lucide versions bundled with Obsidian.
		for (const name of ["square-slash", "slash-square", "slash"]) {
			setIcon(slashBtn, name);
			if (slashBtn.querySelector("svg")) break;
		}
		slashBtn.addEventListener("click", () => this.openCommandList());

		// This conversation's own token/cost total, next to the account-wide plan
		// usage below - the two answer "how full is this conversation" and "how
		// much of my plan is left", so they read as one line.
		this.contextMeterEl = footer.createDiv({
			cls: "ai-agent-panel-context-meter is-hidden",
		});

		// Compact plan-usage strip (optional; see settings).
		this.usageBarEl = footer.createDiv({ cls: "ai-agent-panel-usage-bar is-hidden" });
		this.usageBarEl.addEventListener("click", () =>
			new UsageDetailModal(this.app, this.plugin.usage, () => ({
				warn: this.plugin.settings.usageWarnPercent,
				crit: this.plugin.settings.usageCritPercent,
			})).open()
		);

		footer.createDiv({ cls: "ai-agent-panel-footer-spacer" });

		this.stopButton = footer.createEl("button", {
			cls: "ai-agent-panel-stop-button",
			attr: { "aria-label": "Stop" },
		});
		setIcon(this.stopButton, "square");
		this.stopButton.addEventListener("click", () => {
			void this.active?.session?.interrupt().catch(() => {
				// Best effort; the process close handler will reset state.
			});
		});

		this.sendButton = footer.createEl("button", {
			cls: "mod-cta ai-agent-panel-send-button",
			attr: { "aria-label": "Send" },
		});
		setIcon(this.sendButton, "send");
		this.sendButton.addEventListener("click", () => void this.handleSend());

		// Second row: what this conversation runs as. Each control opens its own
		// menu, so a change is two clicks rather than a popup and a dropdown.
		const configBar = composer.createDiv({ cls: "ai-agent-panel-config-bar" });
		this.modelSegmentEl = this.createSegment(configBar, "Model", (evt) =>
			this.openModelMenu(evt)
		);
		this.effortSegmentEl = this.createSegment(configBar, "Reasoning effort", (evt) =>
			this.openEffortMenu(evt)
		);
		this.modeSegmentEl = this.createSegment(configBar, "Permissions", (evt) =>
			this.openModeMenu(evt)
		);
		this.profileSegmentEl = this.createSegment(configBar, "Profile", (evt) =>
			this.openProfileMenu(evt)
		);

		this.usageUnsubscribe = this.plugin.usage.subscribe(() => {
			if (this.usageVisible()) this.renderUsageBar();
			else this.usageDirty = true;
		});
		this.renderUsageBar();
		this.updateUsageScheduling();
		this.applyTabPosition();

		// Reopen this machine's tabs from the previous session (falls back to
		// a single fresh tab; switchTab syncs the composer, chips, buttons).
		await this.restoreTabState();

		// The usage poll must stop whenever the strip can't be seen: window
		// hidden, sidebar collapsed, another tab covering the view, …
		this.registerDomEvent(document, "visibilitychange", () =>
			this.updateUsageScheduling()
		);
		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.updateUsageScheduling())
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view instanceof MarkdownView) {
					this.lastEditorView = leaf.view;
					// A note took focus: follow its parent folder again.
					this.selectedFolder = null;
				}
				this.renderChips();
				this.updateUsageScheduling();
			})
		);

		// There is no workspace event for selecting a folder in the file
		// explorer, so watch its DOM: folder rows carry data-path.
		this.registerDomEvent(document, "click", (evt) => {
			const target = evt.target instanceof HTMLElement ? evt.target : null;
			const row = target?.closest(".nav-folder-title[data-path]");
			const path = row?.getAttribute("data-path");
			if (!path) return;
			const folder = this.app.vault.getAbstractFileByPath(path);
			if (folder instanceof TFolder && folder.path !== "/") {
				this.selectedFolder = folder;
				this.renderChips();
			}
		});
	}

	onResize(): void {
		// Fires when the view is revealed/hidden as well as on real resizes.
		// applyTabPosition ends in updateTabOverflow, and is what "auto" needs
		// to reconsider the layout at the new width.
		this.applyTabPosition();
		this.updateUsageScheduling();
	}

	async onClose(): Promise<void> {
		this.usageUnsubscribe?.();
		this.usageUnsubscribe = null;
		this.clearUsageTimer();
		if (this.busyTimer !== null) {
			window.clearInterval(this.busyTimer);
			this.busyTimer = null;
		}
		if (this.streamScrollRaf !== null) {
			window.cancelAnimationFrame(this.streamScrollRaf);
			this.streamScrollRaf = null;
		}
		for (const tab of this.tabs) {
			tab.session?.dispose();
			tab.session = null;
		}
		await Promise.all(
			this.tabs.map((tab) => this.plugin.history.flush(tab.conversation))
		);
	}

	/** Used by the "add selection" command. */
	appendToInput(text: string): void {
		this.inputEl.value = this.inputEl.value
			? this.inputEl.value.trimEnd() + "\n\n" + text
			: text;
		this.inputEl.focus();
	}

	focusInput(): void {
		this.inputEl.focus();
	}

	/** Sync the header's small "transcript" link with the active conversation. */
	private updateTranscriptLink(): void {
		const path = this.active?.conversation?.exportPath;
		this.transcriptLinkEl.toggleClass("is-hidden", !path);
		if (path)
			setTooltip(this.transcriptLinkEl, `Open the exported note\n${path}`, {
				placement: "bottom",
			});
	}

	/** Sync the header's "N files changed" link with the active conversation. */
	private updateChangesLink(): void {
		const changes = this.active ? [...this.active.changedFiles.values()] : [];
		const totals = changeTotals(changes);
		this.changesLinkEl.toggleClass("is-hidden", totals.files === 0);
		if (totals.files === 0) return;
		this.changesLinkEl.empty();
		const icon = this.changesLinkEl.createSpan();
		setIcon(icon, "file-diff");
		this.changesLinkEl.createSpan({
			text: `${totals.files} ${totals.files === 1 ? "file" : "files"}`,
		});
		if (totals.added)
			this.changesLinkEl.createSpan({
				cls: "ai-agent-panel-diff-plus",
				text: `+${totals.added}`,
			});
		if (totals.removed)
			this.changesLinkEl.createSpan({
				cls: "ai-agent-panel-diff-minus",
				text: `-${totals.removed}`,
			});
		setTooltip(this.changesLinkEl, "Show the files this conversation changed", {
			placement: "bottom",
		});
	}

	private openSessionChanges(): void {
		const tab = this.active;
		if (!tab) return;
		new SessionChangesModal(this.app, [...tab.changedFiles.values()], (path) => {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
			else new Notice(`Note not found: ${path}`);
		}).open();
	}

	/** Called by the plugin when the exporter (re)writes a conversation note. */
	onTranscriptExported(conversation: StoredConversation): void {
		if (this.active?.conversation?.id === conversation.id)
			this.updateTranscriptLink();
	}

	private openTranscriptNote(): void {
		const path = this.active?.conversation?.exportPath;
		if (!path) return;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
		else new Notice(`Exported note not found: ${path}`);
	}

	/** Used by the "export conversation" command. */
	async exportCurrent(): Promise<void> {
		const conversation = this.active?.conversation;
		if (!conversation || conversation.messages.length === 0) {
			new Notice("Nothing to export yet.");
			return;
		}
		try {
			const path = await this.plugin.exporter.export(conversation);
			await this.plugin.history.flush(conversation); // persists exportPath
			this.updateTranscriptLink();
			new Notice(`Exported to ${path}`);
		} catch (err) {
			new Notice(`Export failed: ${err instanceof Error ? err.message : err}`);
		}
	}

	/**
	 * Open a fresh conversation tab - always a new one, even when the active tab
	 * is still empty, so "+" (and the command) never silently do nothing.
	 */
	newConversation(): void {
		this.addTab();
	}

	async openHistory(): Promise<void> {
		const items = await this.plugin.history.list();
		if (items.length === 0) {
			new Notice("No previous conversations yet.");
			return;
		}
		new ConversationPickerModal(
			this.app,
			this.plugin.history,
			items,
			(stored) => this.restoreConversation(stored),
			(id) => this.detachDeletedConversation(id)
		).open();
	}

	/**
	 * A conversation was deleted from history: detach it from any open tab so
	 * the tab's next save (or flush on close) can't recreate the JSON file.
	 * The transcript stays on screen; a further message starts a fresh record.
	 */
	private detachDeletedConversation(id: string): void {
		for (const tab of this.tabs) {
			if (tab.conversation?.id !== id) continue;
			tab.conversation = null;
			tab.resumeSessionId = null;
			tab.session?.clearResume();
			this.updateTabTitle(tab);
			if (tab === this.active) this.updateTranscriptLink();
		}
		this.saveTabState();
	}

	// -----------------------------------------------------------------------
	// Tabs
	// -----------------------------------------------------------------------

	private addTab(): ChatTab {
		const settings = this.plugin.settings;
		let mode = settings.defaultPermissionMode;
		if (mode === "bypassPermissions" && !settings.enableBypassMode) mode = "default";

		const tabEl = this.tabListEl.createDiv({ cls: "ai-agent-panel-tab" });
		tabEl.createSpan({ cls: "ai-agent-panel-tab-dot" });
		const labelEl = tabEl.createSpan({
			cls: "ai-agent-panel-tab-label",
			text: "New conversation",
		});
		const closeEl = tabEl.createSpan({
			cls: "ai-agent-panel-tab-close",
			attr: { "aria-label": "Close tab" },
		});
		setIcon(closeEl, "x");

		const messagesEl = this.messagesContainerEl.createDiv({
			cls: "ai-agent-panel-messages is-hidden",
		});

		const tab: ChatTab = {
			id: this.nextTabId++,
			tabEl,
			labelEl,
			messagesEl,
			session: null,
			sessionInit: null,
			busy: false,
			conversation: null,
			resumeSessionId: null,
			toolCards: new Map(),
			toolRecords: new Map(),
			editPreImages: new Map(),
			changedFiles: new Map(),
			subagentThreads: new Map(),
			backgroundTasks: new Map(),
			turn: 0,
			turnUuid: null,
			forkOnResume: false,
			usage: emptyUsage(),
			streamingText: null,
			streamingThinking: null,
			typingEl: null,
			typingTimeEl: null,
			typingLabelEl: null,
			busySince: null,
			pendingPermissions: new Map(),
			includeContext: settings.includeContextByDefault,
			includeActiveFolder: false,
			includeVaultContext: false,
			contextItems: [],
			attachments: [],
			// Seed model/effort from the last conversation's pick, falling back to settings.
			selectedModel: settings.lastModel ?? settings.model,
			selectedEffort: settings.lastEffort ?? settings.effort,
			selectedMode: mode,
			selectedProfileId: settings.defaultProfileId,
			statusText: "",
			draft: "",
			scrollTop: 0,
			nearBottom: true,
		};
		tabEl.addEventListener("click", () => this.switchTab(tab));
		// Middle-click closes, as in the editor tab bar. The mousedown guard stops
		// the browser's middle-click autoscroll/paste before auxclick arrives.
		tabEl.addEventListener("mousedown", (evt) => {
			if (evt.button === 1) evt.preventDefault();
		});
		tabEl.addEventListener("auxclick", (evt) => {
			if (evt.button !== 1) return;
			evt.preventDefault();
			this.closeTab(tab);
		});
		closeEl.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.closeTab(tab);
		});
		this.makeTabDraggable(tab);

		this.renderWelcome(tab);
		this.tabs.push(tab);
		this.switchTab(tab);
		this.updateTabOverflow();
		return tab;
	}

	/**
	 * Put the tabs above the transcript or beside it, per the setting; "auto"
	 * asks the pane how wide it is. Everything else about a tab is the same
	 * either way - only the axis it scrolls and overflows on changes.
	 */
	private applyTabPosition(): void {
		if (!this.bodyEl) return; // onResize can fire before onOpen built the view
		const position = this.plugin.settings.tabPosition ?? "top";
		const threshold =
			TABS_SIDE_MIN_WIDTH_PX - (this.tabsOnSide ? TABS_SIDE_HYSTERESIS_PX : 0);
		const side =
			position === "side" ||
			(position === "auto" && this.contentEl.clientWidth >= threshold);
		if (side !== this.tabsOnSide) {
			this.tabsOnSide = side;
			this.bodyEl.toggleClass("is-tabs-side", side);
			// A list that was scrolled on the other axis keeps a stale offset.
			this.tabListEl.scrollLeft = 0;
			this.tabListEl.scrollTop = 0;
			if (this.active) this.scrollTabIntoView(this.active);
		}
		this.updateTabOverflow();
	}

	/** Called by the plugin when a setting the chat's chrome reflects changes. */
	onViewSettingsChanged(): void {
		this.applyTabPosition();
		this.updateConfigBar();
	}

	/**
	 * Show the picker chevron and edge fades only while the strip really
	 * scrolls: tabs first shrink to a minimum size, and overflow past that.
	 */
	private updateTabOverflow(): void {
		// onResize can fire before onOpen has built the strip.
		if (!this.tabMenuBtn) return;
		const el = this.tabListEl;
		const max = this.tabsOnSide
			? el.scrollHeight - el.clientHeight
			: el.scrollWidth - el.clientWidth;
		const offset = this.tabsOnSide ? el.scrollTop : el.scrollLeft;
		const scrollable = max > 1;
		this.tabMenuBtn.toggleClass("is-hidden", !scrollable);
		el.toggleClass("is-fade-start", scrollable && offset > 1);
		el.toggleClass("is-fade-end", scrollable && offset < max - 1);
	}

	/**
	 * Bring a tab into the visible part of the strip. Done by hand rather than
	 * with scrollIntoView so only the strip moves - that call would also scroll
	 * the surrounding pane and the sidebar.
	 */
	private scrollTabIntoView(tab: ChatTab): void {
		const list = this.tabListEl;
		const listRect = list.getBoundingClientRect();
		const tabRect = tab.tabEl.getBoundingClientRect();
		const pad = TAB_REVEAL_PAD_PX;
		if (this.tabsOnSide) {
			if (list.scrollHeight - list.clientHeight <= 1) return;
			if (tabRect.top < listRect.top)
				list.scrollTop -= listRect.top - tabRect.top + pad;
			else if (tabRect.bottom > listRect.bottom)
				list.scrollTop += tabRect.bottom - listRect.bottom + pad;
		} else {
			if (list.scrollWidth - list.clientWidth <= 1) return;
			if (tabRect.left < listRect.left)
				list.scrollLeft -= listRect.left - tabRect.left + pad;
			else if (tabRect.right > listRect.right)
				list.scrollLeft += tabRect.right - listRect.right + pad;
		}
		this.updateTabOverflow();
	}

	/**
	 * Full list of open tabs as a menu, for when they no longer fit the strip:
	 * every conversation is reachable by name, with its busy/waiting state.
	 */
	private openTabMenu(): void {
		const menu = new Menu();
		for (const tab of this.tabs) {
			const full = tab.conversation?.title || "New conversation";
			const title =
				full.length > MAX_TAB_MENU_LABEL_CHARS
					? full.slice(0, MAX_TAB_MENU_LABEL_CHARS - 1) + "…"
					: full;
			const state =
				tab.pendingPermissions.size > 0
					? " · waiting for you"
					: tab.busy
						? " · working…"
						: "";
			menu.addItem((item) =>
				item
					.setTitle(title + state)
					.setChecked(tab === this.active)
					.onClick(() => this.switchTab(tab))
			);
		}
		const rect = this.tabMenuBtn.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
	}

	/**
	 * HTML5 drag & drop between tabs: the dragged tab's element is moved live
	 * as the pointer crosses tab midpoints, and the tabs array is re-synced to
	 * the DOM order when the drag ends.
	 */
	private makeTabDraggable(tab: ChatTab): void {
		const el = tab.tabEl;
		el.draggable = true;
		el.addEventListener("dragstart", (evt) => {
			this.draggedTab = tab;
			el.addClass("is-dragging");
			if (evt.dataTransfer) {
				evt.dataTransfer.effectAllowed = "move";
				// Some platforms need data for the drag to start at all.
				evt.dataTransfer.setData("text/plain", String(tab.id));
			}
		});
		el.addEventListener("dragend", () => {
			el.removeClass("is-dragging");
			this.draggedTab = null;
			if (this.tabDropCommitted) {
				this.tabs.sort(
					(a, b) =>
						domIndex(this.tabListEl, a.tabEl) - domIndex(this.tabListEl, b.tabEl)
				);
			} else {
				// Cancelled (Escape / dropped off the strip): dragover already
				// moved the element live, so restore the DOM to the array order.
				for (const t of this.tabs) this.tabListEl.appendChild(t.tabEl);
			}
			this.tabDropCommitted = false;
		});
		el.addEventListener("dragover", (evt) => {
			const dragged = this.draggedTab;
			if (!dragged || dragged === tab) return;
			evt.preventDefault();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
			const rect = el.getBoundingClientRect();
			const before = this.tabsOnSide
				? evt.clientY < rect.top + rect.height / 2
				: evt.clientX < rect.left + rect.width / 2;
			this.tabListEl.insertBefore(
				dragged.tabEl,
				before ? el : el.nextElementSibling
			);
		});
		el.addEventListener("drop", (evt) => {
			evt.preventDefault();
			this.tabDropCommitted = true;
		});
	}

	private switchTab(tab: ChatTab): void {
		if (tab === this.active) {
			this.scrollTabIntoView(tab);
			this.focusInput();
			return;
		}
		const prev = this.active;
		if (prev) {
			prev.draft = this.inputEl.value;
			const el = prev.messagesEl;
			prev.scrollTop = el.scrollTop;
			prev.nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
			prev.messagesEl.addClass("is-hidden");
			prev.tabEl.removeClass("is-active");
		}
		this.active = tab;
		tab.tabEl.addClass("is-active");
		tab.messagesEl.removeClass("is-hidden");
		// Scroll state is lost while display: none - restore it, following new
		// content when the tab was previously at the bottom.
		tab.messagesEl.scrollTop = tab.nearBottom
			? tab.messagesEl.scrollHeight
			: tab.scrollTop;
		this.inputEl.value = tab.draft;
		this.statusEl.setText(tab.statusText);
		this.updateTranscriptLink();
		this.updateChangesLink();
		this.renderBackgroundTasks(tab);
		this.renderContextMeter(tab);
		this.chipsKey = null;
		this.renderChips();
		this.updateConfigBar();
		this.updateComposerBusy();
		this.scrollTabIntoView(tab);
		this.focusInput();
		this.saveTabState();
	}

	private closeTab(tab: ChatTab): void {
		const index = this.tabs.indexOf(tab);
		if (index === -1) return;
		tab.session?.dispose();
		tab.session = null;
		void this.plugin.history.flush(tab.conversation);
		this.tabs.splice(index, 1);
		tab.tabEl.remove();
		tab.messagesEl.remove();
		// The closed tab may have been the only busy/typing one - re-evaluate
		// so the 1 Hz elapsed-time timer stops instead of ticking forever.
		this.updateBusyTimer();
		if (tab === this.active) {
			this.active = null;
			if (this.tabs.length > 0)
				this.switchTab(this.tabs[Math.min(index, this.tabs.length - 1)]);
		}
		if (this.tabs.length === 0) this.addTab();
		this.updateTabOverflow();
		this.saveTabState();
	}

	private updateTabTitle(tab: ChatTab): void {
		const full = tab.conversation?.title || "New conversation";
		const label =
			full.length > MAX_TAB_LABEL_CHARS
				? full.slice(0, MAX_TAB_LABEL_CHARS - 1) + "…"
				: full;
		tab.labelEl.setText(label);
		this.refreshTabTooltip(tab);
		// A longer title can push the strip into overflow.
		this.updateTabOverflow();
	}

	/** Hover tooltip with the tab's conversation metadata. */
	private refreshTabTooltip(tab: ChatTab): void {
		const conv = tab.conversation;
		const lines: string[] = [conv?.title || "New conversation"];

		const model = describeModel(
			tab.selectedModel,
			this.plugin.settings.resolvedModels,
			this.plugin.cliModelsFor(tab.selectedProfileId)
		);
		const setup: string[] = [model.label];
		if (tab.selectedEffort) {
			const effort = EFFORT_OPTIONS.find((e) => e.value === tab.selectedEffort);
			setup.push(`${effort?.label ?? tab.selectedEffort} effort`);
		}
		const mode = MODE_OPTIONS.find((m) => m.value === tab.selectedMode);
		setup.push(mode?.short ?? tab.selectedMode);
		lines.push(setup.join(" · "));

		if (conv) {
			const userTurns = conv.messages.filter((m) => m.kind === "user").length;
			lines.push(
				`${userTurns} prompt${userTurns === 1 ? "" : "s"}, ${conv.messages.length} entries`
			);
			lines.push(`Started ${new Date(conv.createdAt).toLocaleString()}`);
		}
		const cost = tab.session?.totalCostUsd ?? 0;
		if (cost > 0) lines.push(`$${cost.toFixed(4)} this session`);
		if (tab.pendingPermissions.size > 0) lines.push("Waiting for your response…");
		else if (tab.busy) lines.push("Working…");
		setTooltip(tab.tabEl, lines.join("\n"), { placement: "bottom" });
	}

	private setTabStatus(tab: ChatTab, text: string): void {
		tab.statusText = text;
		if (tab === this.active) this.statusEl.setText(text);
	}

	private setTabBusy(tab: ChatTab, busy: boolean): void {
		tab.busy = busy;
		if (busy) tab.busySince ??= Date.now();
		else tab.busySince = null;
		tab.tabEl.toggleClass("is-busy", busy);
		if (!busy) this.removeTyping(tab);
		if (tab === this.active) this.updateComposerBusy();
		this.refreshTabTooltip(tab);
		this.updateBusyTimer();
	}

	/**
	 * Re-render a stored conversation and arrange for the next message to
	 * resume its CLI session (the CLI restores context silently - it never
	 * replays messages, which is why we keep our own transcript).
	 */
	private restoreConversation(stored: StoredConversation): void {
		const open = this.tabs.find((t) => t.conversation?.id === stored.id);
		if (open) {
			this.switchTab(open);
			return;
		}
		let tab = this.active;
		if (!tab || tab.conversation || tab.session) tab = this.addTab();
		else tab.messagesEl.empty();

		tab.conversation = stored;
		tab.resumeSessionId = stored.sessionId;
		if (stored.model !== undefined) tab.selectedModel = stored.model ?? "";
		if (stored.effort !== undefined) tab.selectedEffort = stored.effort ?? "";
		if (
			stored.permissionMode &&
			this.modeOptions().some((o) => o.value === stored.permissionMode)
		)
			tab.selectedMode = stored.permissionMode;
		this.updateConfigBar();
		this.updateTabTitle(tab);

		for (const msg of stored.messages) this.renderStored(tab, msg);
		// Continue numbering where the conversation left off, so a new turn's
		// checkpoint cannot overwrite one belonging to an earlier turn.
		tab.turn = stored.messages.reduce(
			(highest, msg) =>
				msg.kind === "meta" && typeof msg.turn === "number"
					? Math.max(highest, msg.turn)
					: highest,
			0
		);
		this.setTabStatus(tab, stored.model ?? "");
		this.updateTranscriptLink();
		this.scrollToBottom(tab, true);
		this.focusInput();
		this.saveTabState();
	}

	/**
	 * Open-tab persistence: which conversations are open and which is active.
	 * Goes through App.saveLocalStorage, so it is scoped to this vault on
	 * this machine and never syncs - other devices keep their own layout.
	 * Only conversation ids are stored; messages live in the history store.
	 */
	private saveTabState(): void {
		const ids = this.tabs
			.map((tab) => tab.conversation?.id)
			.filter((id): id is string => !!id);
		this.app.saveLocalStorage(TAB_STATE_KEY, {
			ids,
			activeId: this.active?.conversation?.id ?? null,
		});
	}

	private async restoreTabState(): Promise<void> {
		const raw = this.app.loadLocalStorage(TAB_STATE_KEY) as {
			ids?: unknown;
			activeId?: unknown;
		} | null;
		const ids = Array.isArray(raw?.ids)
			? raw.ids.filter((id): id is string => typeof id === "string")
			: [];
		for (const id of ids) {
			// Deleted conversations just drop out of the restored set.
			const stored = await this.plugin.history.load(id);
			if (stored) this.restoreConversation(stored);
		}
		if (this.tabs.length === 0) this.addTab();
		else {
			const activeTab = this.tabs.find(
				(tab) => tab.conversation?.id === raw?.activeId
			);
			if (activeTab) this.switchTab(activeTab);
		}
		this.updateTabOverflow();
		this.saveTabState();
	}

	// -----------------------------------------------------------------------
	// Sending
	// -----------------------------------------------------------------------

	private async handleSend(): Promise<void> {
		const tab = this.active;
		if (!tab) return;
		const text = this.inputEl.value.trim();
		if (!text && tab.attachments.length === 0) return;

		// Usage commands are answered by the plugin itself: sending them to the
		// CLI would hand them to the model as plain text and burn tokens.
		const command = /^\/([\w-]+)(?:\s|$)/.exec(text)?.[1]?.toLowerCase();
		if (command && (LOCAL_USAGE_COMMANDS as readonly string[]).includes(command)) {
			this.inputEl.value = "";
			this.runLocalUsageCommand(tab, text, command);
			return;
		}

		// "!" is the composer's shell escape, as in the CLI's own TUI: the user's
		// command, run locally, shown here - not sent to the model.
		if (text.startsWith("!") && this.plugin.settings.enableBashMode) {
			const shellCommand = text.slice(1).trim();
			if (shellCommand) {
				this.inputEl.value = "";
				void this.runBashCommand(tab, shellCommand);
				return;
			}
		}

		// Mid-turn sends go straight to the CLI, which steers the running turn
		// with them (or queues them for the next turn, depending on version).
		const queued = tab.session?.busy === true;

		if (!tab.session) {
			// Share one createSession() across concurrent sends (a double Enter
			// while the CLI path resolves) so we never spawn a second, orphaned
			// process that the first send's tab.session assignment would leak.
			const created = await (tab.sessionInit ??= this.createSession(tab));
			tab.sessionInit = null;
			if (!created || tab.session === null) return;
		}

		// Steering messages are short corrections - skip the context block.
		const context = queued ? null : this.buildContext(tab);
		const fullText = context ? `${context}\n\n${text}` : text;

		const contextName = context ? this.describeContext(tab) : null;
		const contextPaths = this.collectContextPaths(tab, text, !queued);
		const attachments = tab.attachments;
		tab.attachments = [];
		// A steering message joins the running turn rather than starting one, so
		// its edits belong to the checkpoint already open.
		if (!queued) {
			tab.turn++;
			tab.turnUuid = null;
		}
		this.renderUserMessage(tab, text, contextName, true, queued, attachments);
		this.record(tab, {
			kind: "user",
			text,
			contextName: contextName ?? undefined,
			contextPaths: contextPaths.length ? contextPaths : undefined,
			images: attachments.length || undefined,
		});
		this.inputEl.value = "";
		this.renderChips();
		try {
			// Images lead, text last - the shape the CLI passes through to the API.
			const content: ContentBlock[] = [
				...attachments.map((image) => ({
					type: "image",
					source: {
						type: "base64",
						media_type: image.mediaType,
						data: image.base64,
					},
				})),
				...(fullText ? [{ type: "text", text: fullText }] : []),
			];
			tab.session?.send(attachments.length ? content : fullText);
		} catch (err) {
			this.renderError(tab, err instanceof Error ? err.message : String(err));
		}
	}

	// -----------------------------------------------------------------------
	// "!" shell mode
	// -----------------------------------------------------------------------

	/**
	 * Run a command the user typed and show its output. Deliberately local: the
	 * user is the one issuing it, and neither the command nor its output reaches
	 * the model unless they press "Add output to chat".
	 */
	private async runBashCommand(tab: ChatTab, command: string): Promise<void> {
		this.renderUserMessage(tab, `!${command}`, null, false);
		const card = this.createBashCard(tab, command);
		this.scrollToBottom(tab, true);

		let result: ShellResult;
		try {
			// The "!" escape runs where this conversation's CLI runs, so paths and
			// tools behave the way the conversation sees them.
			const profile =
				profileById(this.plugin.settings, tab.selectedProfileId) ??
				defaultProfile(this.plugin.settings);
			result = await runShellCommand(command, {
				cwd: this.plugin.getVaultPath(),
				useWsl: profile.useWsl,
			});
		} catch (err) {
			result = {
				command,
				stdout: "",
				stderr: "",
				code: null,
				timedOut: false,
				error: err instanceof Error ? err.message : String(err),
				durationMs: 0,
				truncated: false,
			};
		}
		this.fillBashCard(tab, card, result);
		// Recorded once, when the outcome is known - the history holds finished
		// messages, not intermediate states.
		this.record(tab, {
			kind: "bash",
			command,
			stdout: result.stdout.slice(0, MAX_PREVIEW_CHARS) || undefined,
			stderr: result.stderr.slice(0, MAX_PREVIEW_CHARS) || undefined,
			code: result.code ?? undefined,
			timedOut: result.timedOut || undefined,
			durationMs: result.durationMs,
		});
		this.scrollToBottom(tab);
	}

	private createBashCard(tab: ChatTab, command: string): ToolCard {
		const rootEl = tab.messagesEl.createDiv({ cls: "ai-agent-panel-tool is-bash" });
		const headerEl = rootEl.createDiv({ cls: "ai-agent-panel-tool-header" });
		const iconEl = headerEl.createSpan();
		setIcon(iconEl, "terminal");
		headerEl.createSpan({ cls: "ai-agent-panel-tool-name", text: "Shell" });
		headerEl.createSpan({ cls: "ai-agent-panel-tool-summary", text: command });
		const statEl = headerEl.createSpan({ cls: "ai-agent-panel-tool-stat" });
		const statusEl = headerEl.createSpan({
			cls: "ai-agent-panel-tool-status",
			text: "running",
		});
		const bodyEl = rootEl.createDiv();
		return { rootEl, statusEl, bodyEl, statEl };
	}

	private fillBashCard(tab: ChatTab, card: ToolCard, result: ShellResult): void {
		const failed = result.timedOut || result.error !== undefined || result.code !== 0;
		card.statusEl.setText(
			result.timedOut
				? "timed out"
				: result.error
					? "failed"
					: result.code === 0
						? "done"
						: `exit ${result.code}`
		);
		card.rootEl.toggleClass("is-error", failed);
		card.rootEl.toggleClass("is-done", !failed);
		card.statEl.setText(formatElapsed(result.durationMs));

		card.bodyEl.empty();
		if (result.error)
			card.bodyEl.createDiv({ cls: "ai-agent-panel-diff-note", text: result.error });
		if (result.stdout.trim())
			card.bodyEl
				.createEl("pre", { cls: "ai-agent-panel-tool-result" })
				.setText(result.stdout.trimEnd());
		if (result.stderr.trim())
			card.bodyEl
				.createEl("pre", { cls: "ai-agent-panel-tool-result is-stderr" })
				.setText(result.stderr.trimEnd());
		if (!result.error && !result.stdout.trim() && !result.stderr.trim())
			card.bodyEl.createDiv({ cls: "ai-agent-panel-diff-note", text: "No output." });

		const actions = card.bodyEl.createDiv({ cls: "ai-agent-panel-bash-actions" });
		actions
			.createEl("button", { text: "Add output to chat" })
			.addEventListener("click", () => {
				this.appendToInput(formatShellResultForChat(result));
			});
	}

	/**
	 * Answer /usage, /usage-credits, or /extra-usage from the plugin: a forced
	 * (but rate-floored) fetch of the account usage endpoint - no CLI session,
	 * no tokens. The card is recorded as assistant markdown so restore and
	 * export show it too.
	 */
	private runLocalUsageCommand(tab: ChatTab, text: string, command: string): void {
		this.renderUserMessage(tab, text, null, false);
		this.record(tab, { kind: "user", text });
		const card = tab.messagesEl.createDiv({ cls: "ai-agent-panel-msg-assistant" });
		card.setText("Checking usage…");
		this.scrollToBottom(tab, true);
		void this.plugin.usage.refresh(true).then(async (snapshot) => {
			const markdown =
				command === "usage"
					? usageMarkdown(snapshot, this.plugin.usage.lastError)
					: creditsMarkdown(snapshot, this.plugin.usage.lastError);
			card.empty();
			await this.renderMarkdown(markdown, card);
			addCopyButton(card, () => markdown);
			this.record(tab, { kind: "assistant", text: markdown });
			this.scrollToBottom(tab, true);
		});
	}

	// -----------------------------------------------------------------------
	// Image attachments
	// -----------------------------------------------------------------------

	private async attachImages(files: File[]): Promise<void> {
		const tab = this.active;
		if (!tab) return;
		const rejected: string[] = [];
		for (const file of files) {
			if (tab.attachments.length >= MAX_IMAGES_PER_MESSAGE) {
				rejected.push(`only ${MAX_IMAGES_PER_MESSAGE} images per message`);
				break;
			}
			if (file.size > MAX_IMAGE_BYTES) {
				rejected.push(`${file.name || "image"} is over 4 MB`);
				continue;
			}
			try {
				const buffer = await file.arrayBuffer();
				tab.attachments.push({
					mediaType: file.type,
					base64: arrayBufferToBase64(buffer),
					name: file.name || "pasted image",
					bytes: file.size,
				});
			} catch {
				rejected.push(`${file.name || "image"} could not be read`);
			}
		}
		// The chips key does not see attachment changes, so force a re-render.
		this.chipsKey = null;
		this.renderChips();
		this.focusInput();
		if (rejected.length) new Notice(`Not attached: ${rejected.join("; ")}`);
	}

	/** Active note and folder, as far as they participate in context. */
	private activeTargets(): { file: TFile | null; folder: TFolder | null } {
		const file = this.lastEditorView?.file ?? this.app.workspace.getActiveFile();
		const parent = file?.parent && file.parent.path !== "/" ? file.parent : null;
		return { file, folder: this.selectedFolder ?? parent };
	}

	/**
	 * A running session's client, for the plan-usage lookup - the active tab's
	 * if it has one, otherwise any other tab that happens to be up. Returns null
	 * rather than spawning: usage is never worth starting a CLI process for.
	 */
	liveUsageClient(): UsageClient | null {
		const running = (tab: ChatTab | null) => tab?.session?.liveClient ?? null;
		return running(this.active) ?? this.tabs.map(running).find(Boolean) ?? null;
	}

	/** Used by the file/folder context menu ("Add to agent chat"). */
	addContextItem(item: TAbstractFile): void {
		const tab = this.active;
		if (!tab) return;
		if (!tab.contextItems.includes(item)) {
			tab.contextItems.push(item);
			this.renderChips();
		}
	}

	/** True when buildContext() skips this attachment as already covered. */
	private isRedundantAttachment(tab: ChatTab, item: TAbstractFile): boolean {
		const { file, folder } = this.activeTargets();
		return (
			(tab.includeContext && item.path === file?.path) ||
			(tab.includeActiveFolder && item.path === folder?.path)
		);
	}

	/** Short label describing what buildContext() will attach, for the bubble. */
	private describeContext(tab: ChatTab): string | null {
		const labels: string[] = [];
		const { file, folder } = this.activeTargets();
		if (tab.includeContext && file) labels.push(file.name);
		if (tab.includeActiveFolder && folder) labels.push(`${folder.name}/`);
		if (tab.includeVaultContext && file) labels.push("links & properties");
		const attached = tab.contextItems.filter(
			(item) => !this.isRedundantAttachment(tab, item)
		).length;
		if (attached > 0) labels.push(`${attached} attached`);
		return labels.length ? labels.join(" · ") : null;
	}

	/**
	 * Every vault path this message references, mirroring buildContext() plus
	 * "@" mentions in the prompt. Folders carry a trailing "/". Stored with
	 * the message so exports can link them.
	 */
	private collectContextPaths(
		tab: ChatTab,
		text: string,
		includeAttached: boolean
	): string[] {
		const paths: string[] = [];
		const add = (p: string) => {
			if (!paths.includes(p)) paths.push(p);
		};
		if (includeAttached) {
			const { file, folder } = this.activeTargets();
			if (tab.includeContext && file) add(file.path);
			if (tab.includeActiveFolder && folder) add(`${folder.path}/`);
			for (const item of tab.contextItems) {
				if (this.isRedundantAttachment(tab, item)) continue;
				add(item instanceof TFolder ? `${item.path}/` : item.path);
			}
		}
		for (const p of findMentionedPaths(this.app, text)) add(p);
		return paths;
	}

	private async createSession(tab: ChatTab): Promise<boolean> {
		const settings = this.plugin.settings;
		const profile =
			profileById(settings, tab.selectedProfileId) ?? defaultProfile(settings);
		const cli = await this.plugin.resolveCli(profile);
		if (!cli) {
			this.renderError(
				tab,
				"Claude Code CLI not found. Install it from https://code.claude.com, " +
					"or set the path in Settings → AI Agent Panel."
			);
			return false;
		}
		tab.session = new ClaudeSession(
			{
				cliPath: cli.cliPath,
				cwd: this.plugin.getVaultPath(),
				useWsl: cli.useWsl && process.platform === "win32",
				model: tab.selectedModel || undefined,
				effort: tab.selectedEffort || undefined,
				// "auto" is ours, not the CLI's: it launches in the normal mode and
				// this view answers every prompt (see handlePermissionRequest).
				permissionMode: cliPermissionMode(tab.selectedMode),
				resumeSessionId: tab.resumeSessionId ?? undefined,
				appendSystemPrompt: settings.vaultInstructions || undefined,
				allowBypassPermissions: settings.enableBypassMode,
				forkSession: tab.forkOnResume,
				// Our own turns are only echoed back (with their uuids) when this is
				// on, and the rewind controls key off those uuids.
				replayUserMessages: true,
				sdkMcpServers: settings.enableObsidianMcp ? [OBSIDIAN_MCP_SERVER] : undefined,
			},
			{
				onStreamMessage: (msg) => this.handleStreamMessage(tab, msg),
				onPermissionRequest: (req) => this.handlePermissionRequest(tab, req),
				onPermissionCancelled: (id) => this.handlePermissionCancelled(tab, id),
				onBusyChanged: (busy) => this.setTabBusy(tab, busy),
				onEnded: (error) => this.handleSessionEnded(tab, error),
				onMcpMessage: (server, message) => this.handleMcpMessage(server, message),
				onInitInfo: (info) => {
					// The handshake reports the models this CLI + account accept;
					// the picker offers exactly that list from now on.
					const models = parseCliModels((info as { models?: unknown }).models);
					if (models) void this.plugin.rememberCliModels(profile.id, models);
				},
			}
		);
		return true;
	}

	/**
	 * The `obsidian` MCP server, built once per view and shared by every tab -
	 * its tools act on the workspace, which is shared too. Every call still goes
	 * through the usual permission prompt; the CLI asks before invoking any MCP
	 * tool.
	 */
	private mcpServer(): McpServer {
		this.obsidianMcp ??= new McpServer(
			{
				name: OBSIDIAN_MCP_SERVER,
				version: this.plugin.manifest.version,
				instructions:
					"Tools for the Obsidian vault this session is running in. Use them for " +
					"anything that depends on Obsidian's link graph or metadata index - " +
					"renaming a note without breaking its backlinks, finding notes by tag " +
					"or frontmatter property, reading or setting properties, or seeing what " +
					"the user currently has open. Plain file reads and text searches are " +
					"better served by Read and Grep.",
			},
			createVaultTools(this.app)
		);
		return this.obsidianMcp;
	}

	private async handleMcpMessage(serverName: string, message: unknown): Promise<unknown> {
		if (serverName !== OBSIDIAN_MCP_SERVER)
			throw new Error(`Unknown in-process MCP server: ${serverName}`);
		if (message === null || typeof message !== "object")
			throw new Error("mcp_message carried no JSON-RPC message");
		return this.mcpServer().handle(message as JsonRpcMessage);
	}

	private handleSessionEnded(tab: ChatTab, error?: string): void {
		// The process is gone, so anything mid-flight must be closed out now -
		// otherwise partial streamed text is lost (and later recorded out of
		// order behind the error) and permission cards stay clickable, wrongly
		// reporting "Allowed" for a decision that can never be delivered.
		this.finalizeThinking(tab);
		if (tab.streamingText) this.finalizeText(tab, tab.streamingText.buffer);
		this.failPendingPermissions(tab);
		this.removeTyping(tab);

		if (!error) return;
		let message = error;
		// A restored conversation whose CLI session never initialized: the
		// transcript on the CLI side is probably gone. Fall back to a fresh
		// session while keeping the restored messages on screen.
		if (tab.resumeSessionId && tab.session && !tab.session.sessionId) {
			tab.resumeSessionId = null;
			tab.session.clearResume();
			if (tab.conversation) tab.conversation.sessionId = null;
			message +=
				"\n\nCould not resume the original session - your next message starts a fresh one (the restored transcript above is kept).";
		}
		// Record the failure too: without it the transcript (and its exported
		// note) just stops mid-turn with no hint that the session died.
		if (tab.conversation)
			this.record(tab, { kind: "meta", error: message.slice(0, 500) });
		this.renderError(tab, message);
	}

	// -----------------------------------------------------------------------
	// History recording
	// -----------------------------------------------------------------------

	private ensureConversation(tab: ChatTab): StoredConversation {
		if (!tab.conversation) {
			tab.conversation = {
				version: 1,
				id: newConversationId(),
				sessionId: null,
				title: "",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				model: tab.selectedModel || undefined,
				effort: tab.selectedEffort || undefined,
				permissionMode: tab.selectedMode,
				messages: [],
			};
		}
		return tab.conversation;
	}

	private record(tab: ChatTab, msg: StoredMessage): void {
		const conversation = this.ensureConversation(tab);
		conversation.messages.push(msg);
		if (msg.kind === "user" && !conversation.title) {
			conversation.title = msg.text.split("\n")[0].slice(0, 80) || "Untitled";
			this.updateTabTitle(tab);
		}
		this.refreshTabTooltip(tab);
		this.plugin.history.queueSave(conversation);
		// The first recorded message is the moment the tab gains a
		// conversation id worth restoring after a reload.
		if (conversation.messages.length === 1) this.saveTabState();
	}

	private buildContext(tab: ChatTab): string | null {
		const editorView =
			this.lastEditorView && this.lastEditorView.file ? this.lastEditorView : null;
		const { file: contextFile, folder: contextFolder } = this.activeTargets();
		const parts: string[] = [];
		if (tab.includeContext && contextFile) {
			parts.push(`Active note: ${contextFile.path}`);
			const selection = editorView?.editor.getSelection();
			if (selection && selection.trim()) {
				parts.push(
					`Selected text:\n"""\n${selection.slice(0, MAX_SELECTION_CHARS)}\n"""`
				);
			}
		}
		if (tab.includeActiveFolder && contextFolder)
			parts.push(`Active folder: ${contextFolder.path}/`);
		if (tab.includeVaultContext && contextFile) {
			const vault = this.describeNoteGraph(contextFile);
			if (vault) parts.push(vault);
		}
		for (const item of tab.contextItems) {
			if (this.isRedundantAttachment(tab, item)) continue;
			parts.push(
				item instanceof TFolder
					? `Attached folder: ${item.path}/`
					: `Attached file: ${item.path}`
			);
		}
		if (parts.length === 0) return null;
		return `<context>\nThe user is working in an Obsidian vault.\n${parts.join(
			"\n"
		)}\n</context>`;
	}

	/**
	 * The active note's place in the vault: its properties, what it links to,
	 * what links back, and what it links to that does not exist. Off by default -
	 * it is only worth the tokens when the question is about the vault's
	 * structure, which is why it is a per-message chip rather than always on.
	 */
	private describeNoteGraph(file: TFile): string | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const lines: string[] = [];

		const frontmatter = cache?.frontmatter;
		if (frontmatter && Object.keys(frontmatter).length > 0) {
			const rendered = Object.entries(frontmatter)
				.slice(0, MAX_CONTEXT_LINKS)
				.map(([key, value]) => `  ${key}: ${stringifyProperty(value)}`);
			lines.push("Properties:", ...rendered);
		}

		const outgoing = new Set<string>();
		const unresolved = new Set<string>();
		for (const link of [...(cache?.links ?? []), ...(cache?.frontmatterLinks ?? [])]) {
			const target = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
			if (target) outgoing.add(target.path);
			else unresolved.add(link.link);
		}
		for (const embed of cache?.embeds ?? []) {
			const target = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
			if (target) outgoing.add(target.path);
		}
		for (const link of Object.keys(
			this.app.metadataCache.unresolvedLinks[file.path] ?? {}
		))
			unresolved.add(link);

		const backlinks: string[] = [];
		for (const [source, targets] of Object.entries(this.app.metadataCache.resolvedLinks)) {
			if (source === file.path) continue;
			if (Object.prototype.hasOwnProperty.call(targets, file.path)) backlinks.push(source);
		}

		const section = (title: string, values: string[]) => {
			if (values.length === 0) return;
			const shown = values.slice(0, MAX_CONTEXT_LINKS);
			lines.push(
				`${title} (${values.length}):`,
				...shown.map((value) => `  ${value}`),
				...(values.length > shown.length
					? [`  … ${values.length - shown.length} more`]
					: [])
			);
		};
		section("Links to", [...outgoing].sort());
		section("Linked from", backlinks.sort());
		section("Broken links", [...unresolved].sort());

		return lines.length ? lines.join("\n") : null;
	}

	// -----------------------------------------------------------------------
	// Stream rendering
	// -----------------------------------------------------------------------

	private handleStreamMessage(tab: ChatTab, msg: StreamMessage): void {
		switch (msg.type) {
			case "system": {
				const subtype = (msg as { subtype?: string }).subtype;
				if (subtype === "init") {
					const init = msg as {
						model?: string;
						session_id?: string;
						slash_commands?: string[];
					};
					this.setTabStatus(tab, init.model ?? "");
					if (init.model) {
						// Teach the picker what this alias currently points at.
						void this.plugin.rememberModelResolution(
							tab.session?.spawnedModel ?? "",
							init.model
						);
					}
					if (init.slash_commands?.length) {
						this.plugin.slashCommands = init.slash_commands;
						this.slashSuggest.setCommands(init.slash_commands);
					}
					if (tab.conversation) {
						if (init.session_id) tab.conversation.sessionId = init.session_id;
						if (init.model) tab.conversation.model = init.model;
						this.plugin.history.queueSave(tab.conversation);
					}
					return;
				}
				this.handleSystemMessage(tab, subtype, msg as Record<string, unknown>);
				return;
			}
			case "stream_event":
				this.handleStreamEvent(tab, msg as StreamEventMessage);
				return;
			case "assistant":
				if ((msg as AssistantMessage).parent_tool_use_id)
					this.handleSubagentAssistant(tab, msg as AssistantMessage);
				else this.handleAssistantMessage(tab, msg as AssistantMessage);
				return;
			case "user":
				if ((msg as UserMessage).parent_tool_use_id)
					this.handleSubagentToolResults(tab, msg as UserMessage);
				else {
					this.noteTurnUuid(tab, msg as UserMessage);
					this.handleToolResults(tab, msg as UserMessage);
				}
				return;
			case "result":
				this.handleResult(tab, msg as ResultMessage);
				return;
			default:
				return; // rate limits, hooks, thinking token counts, …
		}
	}

	private handleStreamEvent(tab: ChatTab, msg: StreamEventMessage): void {
		if (msg.parent_tool_use_id) return; // subagent traffic
		const event = msg.event;
		if (event.type === "content_block_start") {
			const block = event.content_block;
			if (block?.type === "text") tab.streamingText = this.startStreamingText(tab);
			else if (block?.type === "thinking")
				tab.streamingThinking = this.startStreamingThinking(tab);
		} else if (event.type === "content_block_delta") {
			const delta = event.delta ?? {};
			if (delta.type === "text_delta" && typeof delta.text === "string") {
				if (!tab.streamingText) tab.streamingText = this.startStreamingText(tab);
				tab.streamingText.buffer += delta.text;
				// Append just the new text - re-setting the whole growing buffer
				// each delta was O(n²) over a long message. finalizeText later
				// replaces this node with the rendered Markdown.
				tab.streamingText.el.appendText(delta.text);
				this.scrollToBottomThrottled(tab);
			} else if (
				delta.type === "thinking_delta" &&
				typeof delta.thinking === "string"
			) {
				if (!tab.streamingThinking)
					tab.streamingThinking = this.startStreamingThinking(tab);
				tab.streamingThinking.buffer += delta.thinking;
				tab.streamingThinking.el.appendText(delta.thinking);
			}
		}
	}

	// -----------------------------------------------------------------------
	// Subagent threads
	// -----------------------------------------------------------------------

	/**
	 * The collapsible thread nested under a Task card, created on the subagent's
	 * first message. When the parent card is missing (a restored conversation, or
	 * a Task whose block never arrived) the thread stands alone in the transcript
	 * rather than being dropped.
	 */
	private subagentThread(tab: ChatTab, parentId: string): SubagentThread {
		const existing = tab.subagentThreads.get(parentId);
		if (existing) return existing;

		const host = tab.toolCards.get(parentId)?.rootEl ?? tab.messagesEl;
		const detailsEl = host.createEl("details", { cls: "ai-agent-panel-subagent" });
		const summaryEl = detailsEl.createEl("summary");
		const icon = summaryEl.createSpan();
		setIcon(icon, "bot");
		const labelEl = summaryEl.createSpan({ cls: "ai-agent-panel-subagent-label" });
		const metaEl = summaryEl.createSpan({ cls: "ai-agent-panel-subagent-meta" });
		const bodyEl = detailsEl.createDiv({ cls: "ai-agent-panel-subagent-body" });

		const thread: SubagentThread = {
			labelEl,
			metaEl,
			bodyEl,
			toolCards: new Map(),
			models: new Set(),
			steps: 0,
			tokens: 0,
		};
		tab.subagentThreads.set(parentId, thread);
		this.updateSubagentSummary(thread);
		return thread;
	}

	private updateSubagentSummary(thread: SubagentThread): void {
		thread.labelEl.setText(
			thread.description ?? (thread.subagentType ? `${thread.subagentType} agent` : "Subagent")
		);
		const parts: string[] = [];
		if (thread.steps)
			parts.push(`${thread.steps} ${thread.steps === 1 ? "step" : "steps"}`);
		// Subagent messages report a concrete model id, so its own label is right.
		for (const model of thread.models)
			parts.push(describeModelId(model)?.short ?? model);
		if (thread.toolUses !== undefined)
			parts.push(`${thread.toolUses} ${thread.toolUses === 1 ? "tool" : "tools"}`);
		const tokens = thread.totalTokens ?? thread.tokens;
		if (tokens) parts.push(`${formatTokens(tokens)} tokens`);
		if (thread.durationMs !== undefined) parts.push(formatElapsed(thread.durationMs));
		if (thread.status && thread.status !== "completed") parts.push(thread.status);
		thread.metaEl.setText(parts.join(" · "));
	}

	private handleSubagentAssistant(tab: ChatTab, msg: AssistantMessage): void {
		const parentId = msg.parent_tool_use_id;
		if (!parentId) return;
		const thread = this.subagentThread(tab, parentId);
		const extra = msg as unknown as {
			subagent_type?: string;
			task_description?: string;
		};
		if (extra.subagent_type) thread.subagentType = extra.subagent_type;
		if (extra.task_description) thread.description = extra.task_description;
		if (msg.message.model) thread.models.add(msg.message.model);
		const usage = msg.message.usage as Record<string, unknown> | undefined;
		if (usage) {
			// Cache reads dominate and are not "work done" - count what the agent
			// actually spent, matching how the CLI reports a subagent's totals.
			const input = numberOr(usage.input_tokens, 0);
			const output = numberOr(usage.output_tokens, 0);
			const created = numberOr(usage.cache_creation_input_tokens, 0);
			thread.tokens += input + output + created;
		}

		const content = msg.message.content;
		const blocks = typeof content === "string" ? [{ type: "text", text: content }] : content;
		for (const block of blocks as ContentBlock[]) {
			if (block.type === "text") {
				const text = (block as { text: string }).text;
				if (!text.trim()) continue;
				thread.steps++;
				const el = thread.bodyEl.createDiv({ cls: "ai-agent-panel-subagent-text" });
				void this.renderMarkdown(text, el).catch(() => el.setText(text));
			} else if (block.type === "thinking") {
				const details = thread.bodyEl.createEl("details", {
					cls: "ai-agent-panel-thinking",
				});
				details.createEl("summary", { text: "Thought process" });
				details.createDiv().setText((block as { thinking?: string }).thinking ?? "");
			} else if (block.type === "tool_use") {
				thread.steps++;
				const use = block as ToolUseBlock;
				// A subagent's edits are real edits to the vault, and the CLI's own
				// checkpointing does not cover them - so snapshot them too.
				if (isEditTool(use.name)) {
					const reported = editTargetPath(use.input);
					const vaultPath = reported === null ? null : this.resolveReportedPath(reported);
					if (vaultPath !== null)
						void this.readVaultText(vaultPath).then((before) =>
							this.checkpointFile(tab, vaultPath, before)
						);
				}
				const row = thread.bodyEl.createDiv({ cls: "ai-agent-panel-subagent-tool" });
				const iconEl = row.createSpan();
				setIcon(iconEl, toolIcon(use.name));
				row.createSpan({ cls: "ai-agent-panel-tool-name", text: use.name });
				const summary = summarizeToolInput(use.name, use.input);
				if (summary)
					row.createSpan({ cls: "ai-agent-panel-tool-summary", text: summary });
				const statusEl = row.createSpan({
					cls: "ai-agent-panel-tool-status",
					text: "running",
				});
				thread.toolCards.set(use.id, { rowEl: row, statusEl });
			}
		}
		this.updateSubagentSummary(thread);
		this.scrollToBottomThrottled(tab);
	}

	private handleSubagentToolResults(tab: ChatTab, msg: UserMessage): void {
		const parentId = msg.parent_tool_use_id;
		if (!parentId) return;
		const thread = tab.subagentThreads.get(parentId);
		if (!thread) return;
		const content = msg.message.content;
		if (typeof content === "string") return;
		for (const block of content) {
			if (block.type !== "tool_result") continue;
			const result = block as ToolResultBlock;
			const row = thread.toolCards.get(result.tool_use_id);
			if (!row) continue;
			const isError = result.is_error === true;
			row.statusEl.setText(isError ? "error" : "done");
			row.rowEl.toggleClass("is-error", isError);
			row.rowEl.toggleClass("is-done", !isError);
		}
	}

	// -----------------------------------------------------------------------
	// Background tasks
	// -----------------------------------------------------------------------

	/**
	 * Everything the CLI reports about long-running work: subagents it launched,
	 * and tools that were pushed to the background. `background_tasks_changed` is
	 * authoritative for what is still running; the others fill in detail.
	 */
	private handleSystemMessage(
		tab: ChatTab,
		subtype: string | undefined,
		msg: Record<string, unknown>
	): void {
		switch (subtype) {
			case "task_started": {
				const taskId = asString(msg.task_id);
				if (!taskId) return;
				tab.backgroundTasks.set(taskId, {
					taskId,
					description: asString(msg.description),
					taskType: asString(msg.task_type),
					subagentType: asString(msg.subagent_type),
					toolUseId: asString(msg.tool_use_id),
					status: "running",
				});
				this.renderBackgroundTasks(tab);
				return;
			}
			case "background_tasks_changed": {
				const running = new Set<string>();
				for (const raw of Array.isArray(msg.tasks) ? msg.tasks : []) {
					const entry = raw as Record<string, unknown>;
					const taskId = asString(entry.task_id);
					if (!taskId) continue;
					running.add(taskId);
					const existing = tab.backgroundTasks.get(taskId);
					tab.backgroundTasks.set(taskId, {
						...existing,
						taskId,
						description: asString(entry.description) ?? existing?.description,
						taskType: asString(entry.task_type) ?? existing?.taskType,
						status: "running",
					});
				}
				for (const taskId of [...tab.backgroundTasks.keys()])
					if (!running.has(taskId)) tab.backgroundTasks.delete(taskId);
				this.renderBackgroundTasks(tab);
				return;
			}
			case "task_updated": {
				const taskId = asString(msg.task_id);
				const patch = (msg.patch ?? {}) as Record<string, unknown>;
				const task = taskId ? tab.backgroundTasks.get(taskId) : undefined;
				if (!task) return;
				task.status = asString(patch.status) ?? task.status;
				this.renderBackgroundTasks(tab);
				return;
			}
			case "task_notification": {
				this.applyTaskNotification(tab, msg);
				return;
			}
			default:
				return; // compaction boundaries, status pings, thinking counts, …
		}
	}

	/** A finished agent's totals, folded into the Task card it belongs to. */
	private applyTaskNotification(tab: ChatTab, msg: Record<string, unknown>): void {
		const taskId = asString(msg.task_id);
		if (taskId) tab.backgroundTasks.delete(taskId);
		this.renderBackgroundTasks(tab);

		const toolUseId = asString(msg.tool_use_id);
		if (!toolUseId) return;
		const thread = tab.subagentThreads.get(toolUseId);
		if (!thread) return;
		const usage = (msg.usage ?? {}) as Record<string, unknown>;
		thread.status = asString(msg.status);
		thread.totalTokens = numberOrUndefined(usage.total_tokens);
		thread.toolUses = numberOrUndefined(usage.tool_uses);
		thread.durationMs = numberOrUndefined(usage.duration_ms);
		this.updateSubagentSummary(thread);
	}

	/** The strip above the composer listing what is still running. */
	private renderBackgroundTasks(tab: ChatTab): void {
		if (tab !== this.active) return;
		const el = this.backgroundTasksEl;
		el.empty();
		const tasks = [...tab.backgroundTasks.values()];
		el.toggleClass("is-hidden", tasks.length === 0);
		if (tasks.length === 0) return;
		for (const task of tasks) {
			const row = el.createDiv({ cls: "ai-agent-panel-bgtask" });
			const icon = row.createSpan();
			setIcon(icon, task.taskType === "local_agent" ? "bot" : "loader");
			row.createSpan({
				cls: "ai-agent-panel-bgtask-label",
				text: task.description ?? task.subagentType ?? "Background task",
			});
			const stop = row.createEl("button", {
				cls: "clickable-icon",
				attr: { "aria-label": "Stop this background task" },
			});
			setIcon(stop, "square");
			stop.addEventListener("click", () => {
				void tab.session?.stopTask(task.taskId).catch(() => {
					new Notice("Could not stop that task.");
				});
			});
		}
	}

	private handleAssistantMessage(tab: ChatTab, msg: AssistantMessage): void {
		if (msg.parent_tool_use_id) return;
		const content = msg.message.content;
		if (typeof content === "string") {
			this.finalizeText(tab, content);
			return;
		}
		for (const block of content) {
			if (block.type === "text") {
				this.finalizeText(tab, (block as { text: string }).text);
			} else if (block.type === "thinking") {
				this.finalizeThinking(tab);
			} else if (block.type === "tool_use") {
				this.renderToolUse(tab, block as ToolUseBlock);
			}
		}
	}

	/**
	 * `--replay-user-messages` echoes our own turns back with a uuid, which is
	 * what the rewind controls address. Tool results come back as `user` messages
	 * too, so the echo is identified by carrying no tool_result block - and only
	 * the first one per turn is the turn's own prompt.
	 */
	private noteTurnUuid(tab: ChatTab, msg: UserMessage): void {
		if (tab.turnUuid || !msg.uuid) return;
		const content = msg.message.content;
		if (Array.isArray(content) && content.some((block) => block.type === "tool_result"))
			return;
		tab.turnUuid = msg.uuid;
	}

	private handleToolResults(tab: ChatTab, msg: UserMessage): void {
		const content = msg.message.content;
		if (typeof content === "string") return;
		for (const block of content) {
			if (block.type !== "tool_result") continue;
			const result = block as ToolResultBlock;
			const card = tab.toolCards.get(result.tool_use_id);
			if (!card) continue;
			const isError = result.is_error === true;
			const preview = this.stringifyToolResult(result.content);
			const stored = tab.toolRecords.get(result.tool_use_id);
			const pending = tab.editPreImages.get(result.tool_use_id);
			tab.editPreImages.delete(result.tool_use_id);
			// An edit's outcome is its diff, not its "the file has been updated"
			// text - the raw result adds nothing next to the real change.
			this.applyToolOutcome(card, pending && !isError ? null : preview, isError);
			if (pending && !isError)
				void this.settleEditCard(tab, card, stored?.name ?? "", stored, pending);
			if (stored) {
				stored.isError = isError;
				if (preview) stored.result = preview.slice(0, MAX_PREVIEW_CHARS);
				if (tab.conversation) this.plugin.history.queueSave(tab.conversation);
			}
		}
	}

	private applyToolOutcome(
		card: ToolCard,
		preview: string | null,
		isError: boolean
	): void {
		card.statusEl.setText(isError ? "error" : "done");
		card.rootEl.toggleClass("is-error", isError);
		card.rootEl.toggleClass("is-done", !isError);
		if (preview) {
			card.bodyEl
				.createEl("pre", { cls: "ai-agent-panel-tool-result" })
				.setText(preview.slice(0, MAX_PREVIEW_CHARS));
		}
	}

	// -----------------------------------------------------------------------
	// Edit diffs
	// -----------------------------------------------------------------------

	/** Vault-relative form of a path the CLI reported, or null if outside. */
	private resolveReportedPath(reported: string): string | null {
		try {
			return vaultRelativePath(reported, this.plugin.getVaultPath());
		} catch {
			// Vault is not on a local filesystem - the plugin refuses to run there
			// anyway, but a diff must not be the thing that throws.
			return null;
		}
	}

	/** File contents, or null when it does not exist or cannot be read. */
	private async readVaultText(vaultPath: string): Promise<string | null> {
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(vaultPath))) return null;
			return await adapter.read(vaultPath);
		} catch {
			return null;
		}
	}

	/**
	 * Snapshot the file an edit is about to change. The `tool_use` block is
	 * announced before the tool runs, so this is the last moment the pre-image
	 * exists; the read is started here and awaited when the result lands.
	 */
	private capturePreImage(tab: ChatTab, block: ToolUseBlock): void {
		const reported = editTargetPath(block.input);
		if (reported === null) return;
		const vaultPath = this.resolveReportedPath(reported);
		const pending: Promise<EditPreImage> = (async () => {
			const before = vaultPath === null ? null : await this.readVaultText(vaultPath);
			// The same read serves the diff and the turn's restore point.
			if (vaultPath !== null) void this.checkpointFile(tab, vaultPath, before);
			return { reported, vaultPath, before };
		})();
		tab.editPreImages.set(block.id, pending);
	}

	/**
	 * Record a file's pre-image against the current turn, so the whole turn can
	 * be undone later. Best effort: a checkpoint that cannot be written must not
	 * stop the edit from happening.
	 */
	private async checkpointFile(
		tab: ChatTab,
		vaultPath: string,
		before: string | null
	): Promise<void> {
		const conversation = tab.conversation;
		if (!conversation || tab.turn < 1) return;
		try {
			await this.plugin.checkpoints.capture(
				conversation.id,
				tab.turn,
				vaultPath,
				before
			);
		} catch {
			// Nothing to do - the turn simply has no restore point.
		}
	}

	/**
	 * Replace an edit card's body with the diff that actually landed: the
	 * captured pre-image against the file as it now stands on disk.
	 */
	private async settleEditCard(
		tab: ChatTab,
		card: ToolCard,
		name: string,
		stored: Extract<StoredMessage, { kind: "tool" }> | undefined,
		pending: Promise<EditPreImage | null>
	): Promise<void> {
		const pre = await pending;
		if (!pre) return;
		const after =
			pre.vaultPath === null ? null : await this.readVaultText(pre.vaultPath);
		const input = (stored?.input ?? {}) as Record<string, unknown>;
		const before = pre.before;

		card.bodyEl.empty();
		const rendered = this.renderEditDiff(card.bodyEl, name, input, before, after);
		if (!rendered) {
			card.bodyEl.createEl("pre").setText(safeJsonPreview(input, 2000));
			return;
		}
		if (rendered.added || rendered.removed) {
			card.statEl.empty();
			if (rendered.added)
				card.statEl.createSpan({ cls: "ai-agent-panel-diff-plus", text: `+${rendered.added}` });
			if (rendered.removed)
				card.statEl.createSpan({
					cls: "ai-agent-panel-diff-minus",
					text: `-${rendered.removed}`,
				});
		}
		if (stored) {
			stored.added = rendered.added;
			stored.removed = rendered.removed;
			if (tab.conversation) this.plugin.history.queueSave(tab.conversation);
		}
		if (after !== null) this.recordFileChange(tab, pre, before, after);
	}

	/**
	 * Fold one edit into the conversation's running per-file change. `before` is
	 * only taken from the first edit to a file, so the panel always shows the net
	 * change since the conversation started rather than the last edit alone.
	 */
	private recordFileChange(
		tab: ChatTab,
		pre: EditPreImage,
		before: string | null,
		after: string
	): void {
		const key = pre.vaultPath ?? pre.reported;
		const existing = tab.changedFiles.get(key);
		if (existing) {
			existing.after = after;
			existing.edits++;
		} else {
			tab.changedFiles.set(key, {
				path: key,
				inVault: pre.vaultPath !== null,
				before: before ?? "",
				after,
				created: before === null,
				edits: 1,
			});
		}
		if (tab === this.active) this.updateChangesLink();
	}

	/**
	 * Render the diff for one edit tool call into `el`.
	 *
	 * `before`/`after` are the file's real contents when known. When they are
	 * not - a permission prompt for a file outside the vault, a restored
	 * conversation, a search string that no longer matches - this falls back to
	 * diffing the tool's own strings, which still shows what it intends to do.
	 * Returns null when the tool has nothing diffable.
	 */
	private renderEditDiff(
		el: HTMLElement,
		name: string,
		input: Record<string, unknown>,
		before: string | null,
		after: string | null
	): { added: number; removed: number } | null {
		if (!isEditTool(name)) return null;
		// Markdown is what the vault is made of, so every edit diff can be flipped
		// to a rendered before/after of the changed section.
		const renderMarkdown = (markdown: string, target: HTMLElement) =>
			this.renderMarkdown(markdown, target);
		if (after !== null) {
			// The real outcome is on disk; no need to model the tool's semantics.
			const plan = planEdit(name, input, before);
			const diff = renderFileDiff(el, before ?? "", after, {
				note: plan?.note,
				badge: before === null ? "new file" : undefined,
				renderMarkdown,
			});
			return { added: diff.added, removed: diff.removed };
		}
		const plan = planEdit(name, input, before);
		if (!plan) return null;
		const diff = renderFileDiff(el, plan.before, plan.after, {
			note: plan.note,
			hideLineNumbers: plan.scope === "fragment",
			badge: plan.creates ? "new file" : plan.scope === "fragment" ? "excerpt" : undefined,
			renderMarkdown,
		});
		return { added: diff.added, removed: diff.removed };
	}

	private handleResult(tab: ChatTab, msg: ResultMessage): void {
		this.finalizeThinking(tab);
		if (tab.streamingText) this.finalizeText(tab, tab.streamingText.buffer);
		this.removeTyping(tab);
		this.accumulateUsage(tab, msg);

		const conversationId = tab.conversation?.id;
		const hadCheckpoint =
			conversationId !== undefined &&
			this.plugin.checkpoints.hasOpen(conversationId, tab.turn);
		if (conversationId !== undefined)
			this.plugin.checkpoints.closeTurn(conversationId, tab.turn);

		const meta: Extract<StoredMessage, { kind: "meta" }> = msg.is_error
			? { kind: "meta", error: msg.result?.slice(0, 500) ?? "Turn failed" }
			: { kind: "meta", durationMs: msg.duration_ms, costUsd: msg.total_cost_usd };
		if (tab.turn > 0) meta.turn = tab.turn;
		if (hadCheckpoint) meta.restorable = true;
		if (tab.turnUuid) meta.rewindUuid = tab.turnUuid;
		this.record(tab, meta);
		this.renderTurnMeta(tab, meta);
		this.scrollToBottom(tab);
		// A finished turn consumed quota; re-fetch usage right away (cheap
		// metadata call, still rate-floored) so the strip reflects it.
		if (this.usageVisible()) void this.plugin.usage.refresh(true);
	}

	private renderTurnMeta(
		tab: ChatTab,
		msg: Extract<StoredMessage, { kind: "meta" }>
	): void {
		const meta = tab.messagesEl.createDiv({ cls: "ai-agent-panel-turn-meta" });
		if (msg.error) {
			meta.addClass("is-error");
			meta.createSpan({ text: `Error: ${msg.error}` });
		} else {
			const parts: string[] = [];
			if (typeof msg.durationMs === "number")
				parts.push(`${(msg.durationMs / 1000).toFixed(1)}s`);
			if (typeof msg.costUsd === "number") parts.push(`$${msg.costUsd.toFixed(4)}`);
			if (parts.length) meta.createSpan({ text: parts.join(" · ") });
		}
		this.addTurnActions(tab, meta, msg);
	}

	/**
	 * "Restore files" and "Branch from here" on a finished turn. Both are added
	 * only when they can actually work: the first needs a checkpoint still on
	 * disk, the second needs the user message's uuid and a live CLI session.
	 */
	private addTurnActions(
		tab: ChatTab,
		meta: HTMLElement,
		msg: Extract<StoredMessage, { kind: "meta" }>
	): void {
		const conversationId = tab.conversation?.id;
		const turn = msg.turn;
		if (conversationId !== undefined && msg.restorable && turn !== undefined) {
			const button = meta.createEl("button", {
				cls: "ai-agent-panel-turn-action",
				text: "Restore files",
			});
			setTooltip(button, "Put the files this turn changed back as they were", {
				placement: "top",
			});
			button.addEventListener("click", () => {
				void this.confirmRestore(tab, conversationId, turn, button);
			});
			// A restored conversation's checkpoint may have been pruned; hide the
			// action rather than offer something that will fail.
			void this.plugin.checkpoints
				.has(conversationId, turn)
				.then((exists) => button.toggleClass("is-hidden", !exists));
		}

		if (msg.rewindUuid) {
			const uuid = msg.rewindUuid;
			const button = meta.createEl("button", {
				cls: "ai-agent-panel-turn-action",
				text: "Branch from here",
			});
			setTooltip(
				button,
				"Open a new tab that continues from just before this turn, leaving this conversation as it is",
				{ placement: "top" }
			);
			button.addEventListener("click", () => this.branchFrom(tab, uuid));
		}
	}

	// -----------------------------------------------------------------------
	// Restore and branch
	// -----------------------------------------------------------------------

	private async confirmRestore(
		tab: ChatTab,
		conversationId: string,
		turn: number,
		button: HTMLElement
	): Promise<void> {
		const checkpoint = await this.plugin.checkpoints.load(conversationId, turn);
		if (!checkpoint) {
			new Notice("That restore point is no longer available.");
			button.addClass("is-hidden");
			return;
		}
		const plan = planRestore(checkpoint);
		// Pair each file with what is on disk now, so the modal can show the diff
		// the restore would undo.
		const previews = await Promise.all([
			...plan.rewrite.map(async (entry) => ({
				path: entry.path,
				before: await this.readVaultText(entry.path),
				after: entry.content,
				removing: false,
			})),
			...plan.remove.map(async (path) => ({
				path,
				before: await this.readVaultText(path),
				after: "",
				removing: true,
			})),
		]);
		new RestoreConfirmModal(this.app, previews, plan.skipped, () => {
			void this.applyRestore(tab, checkpoint);
		}).open();
	}

	private async applyRestore(tab: ChatTab, checkpoint: Checkpoint): Promise<void> {
		const plan = planRestore(checkpoint);
		let restored = 0;
		let removed = 0;
		const failed: string[] = [];

		for (const entry of plan.rewrite) {
			try {
				const file = this.app.vault.getAbstractFileByPath(entry.path);
				// Through the Vault API where possible, so open panes and the
				// metadata cache see the change; `process` makes the rewrite
				// atomic against anything else touching the file mid-restore.
				if (file instanceof TFile)
					await this.app.vault.process(file, () => entry.content);
				else await this.app.vault.create(entry.path, entry.content);
				restored++;
			} catch {
				failed.push(entry.path);
			}
		}
		for (const path of plan.remove) {
			try {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					await this.app.fileManager.trashFile(file);
					removed++;
				}
			} catch {
				failed.push(path);
			}
		}

		// The vault no longer matches what the "changes this conversation" panel
		// believes; re-point each touched file's "after" at what is on disk now.
		for (const entry of [...plan.rewrite, ...plan.remove.map((path) => ({ path }))]) {
			const change = tab.changedFiles.get(entry.path);
			if (!change) continue;
			const current = await this.readVaultText(entry.path);
			if (current === null) tab.changedFiles.delete(entry.path);
			else change.after = current;
		}
		this.updateChangesLink();

		const parts: string[] = [];
		if (restored) parts.push(`${restored} restored`);
		if (removed) parts.push(`${removed} deleted`);
		if (plan.skipped.length) parts.push(`${plan.skipped.length} skipped`);
		if (failed.length) parts.push(`${failed.length} failed`);
		new Notice(parts.length ? `Files: ${parts.join(", ")}.` : "Nothing to restore.");
	}

	/**
	 * Branch the conversation into a new tab. The fork is a copy of the CLI
	 * session (`--resume` + `--fork-session`), trimmed back to the chosen turn by
	 * a `rewind_conversation` issued before the branch's first message - so this
	 * conversation keeps its own history untouched.
	 */
	private branchFrom(tab: ChatTab, userMessageUuid: string): void {
		const sessionId = tab.session?.sessionId ?? tab.conversation?.sessionId ?? null;
		if (!sessionId) {
			new Notice("This conversation has no CLI session to branch from yet.");
			return;
		}
		const branch = this.addTab();
		branch.resumeSessionId = sessionId;
		branch.forkOnResume = true;
		branch.selectedModel = tab.selectedModel;
		branch.selectedEffort = tab.selectedEffort;
		branch.selectedMode = tab.selectedMode;
		// The fork resumes a transcript that lives on the original's CLI side.
		branch.selectedProfileId = tab.selectedProfileId;
		const conversation = this.ensureConversation(branch);
		conversation.title = branchTitle(tab.conversation?.title);
		this.updateTabTitle(branch);
		void this.createSession(branch).then((created) => {
			if (created) branch.session?.rewindOnStart(userMessageUuid);
		});
		branch.messagesEl.querySelector(".ai-agent-panel-welcome")?.remove();
		branch.messagesEl.createDiv({
			cls: "ai-agent-panel-branch-note",
			text: `Branched from "${tab.conversation?.title ?? "a conversation"}". Claude keeps everything up to that point in context; this conversation's later turns are not part of the branch.`,
		});
		this.updateConfigBar();
		this.focusInput();
	}

	// -----------------------------------------------------------------------
	// Conversation usage
	// -----------------------------------------------------------------------

	/**
	 * Fold a finished turn's usage into the conversation's totals. Tokens add up
	 * per turn; `total_cost_usd` is already cumulative for the session, so it is
	 * assigned rather than summed - and only ever allowed to grow, so a restart's
	 * fresh process (whose counter starts at zero again) cannot lose the total.
	 */
	private accumulateUsage(tab: ChatTab, msg: ResultMessage): void {
		const usage = msg.usage ?? {};
		tab.usage.turns++;
		tab.usage.inputTokens += numberOr(usage.input_tokens, 0);
		tab.usage.outputTokens += numberOr(usage.output_tokens, 0);
		tab.usage.cacheWriteTokens += numberOr(usage.cache_creation_input_tokens, 0);
		tab.usage.cacheReadTokens += numberOr(usage.cache_read_input_tokens, 0);
		if (typeof msg.total_cost_usd === "number")
			tab.usage.costUsd = Math.max(tab.usage.costUsd, msg.total_cost_usd);
		this.renderContextMeter(tab);
		// The window occupancy only the CLI knows; it refuses this before the
		// first turn, which is why it is asked for here rather than on spawn.
		void tab.session?.contextUsage().then((context) => {
			if (!context) return;
			tab.usage.context = context;
			this.renderContextMeter(tab);
		});
	}

	private renderContextMeter(tab: ChatTab): void {
		if (tab !== this.active) return;
		const el = this.contextMeterEl;
		const usage = tab.usage;
		el.toggleClass("is-hidden", usage.turns === 0);
		if (usage.turns === 0) return;
		el.empty();

		const context = usage.context;
		if (context) {
			const fill = el.createDiv({ cls: "ai-agent-panel-context-track" });
			const bar = fill.createDiv({ cls: "ai-agent-panel-context-fill" });
			bar.style.setProperty(
				"--ai-agent-panel-fill",
				`${Math.min(100, Math.max(0, context.percentage))}%`
			);
			el.toggleClass("is-tight", context.percentage >= 80);
			el.createSpan({ text: `${context.percentage}%` });
		}
		if (usage.costUsd > 0)
			el.createSpan({ text: `$${usage.costUsd.toFixed(usage.costUsd < 1 ? 4 : 2)}` });

		const lines: string[] = [];
		if (context)
			lines.push(
				`Context: ${formatTokens(context.totalTokens)} of ${formatTokens(context.maxTokens)} (${context.percentage}%)`
			);
		// The suffix is ours to add: `getContextUsage` strips any copy the CLI
		// embedded in `name`, so the flag is the single source of truth here.
		for (const category of context?.categories ?? [])
			if (category.tokens > 0)
				lines.push(
					`  ${category.name}${category.deferred ? " (deferred)" : ""}: ${formatTokens(category.tokens)}`
				);
		lines.push(
			`This conversation: ${usage.turns} ${usage.turns === 1 ? "turn" : "turns"}`,
			`  Input: ${formatTokens(usage.inputTokens)}`,
			`  Output: ${formatTokens(usage.outputTokens)}`,
			`  Cache written: ${formatTokens(usage.cacheWriteTokens)}`,
			`  Cache read: ${formatTokens(usage.cacheReadTokens)}`
		);
		if (usage.costUsd > 0) lines.push(`  Cost: $${usage.costUsd.toFixed(4)}`);
		setTooltip(el, lines.join("\n"), { placement: "top" });
	}

	// -----------------------------------------------------------------------
	// Permission prompts
	// -----------------------------------------------------------------------

	private handlePermissionRequest(
		tab: ChatTab,
		req: PermissionRequest
	): Promise<PermissionResult> {
		if (req.toolName === "AskUserQuestion") {
			const questions = parseAskUserQuestions(req.input);
			if (questions) return this.handleQuestionRequest(tab, req, questions);
		}
		// Auto-approve mode: answer instead of asking. The CLI's own rules and
		// hooks have already run by the time a request reaches us - anything they
		// denied never gets here - and every tool still draws its activity card,
		// so the transcript keeps showing what ran. AskUserQuestion above is not
		// a permission prompt and still gets its form.
		if (tab.selectedMode === "auto")
			return Promise.resolve({ behavior: "allow", updatedInput: req.input });
		return new Promise<PermissionResult>((resolve) => {
			// Re-anchor the typing indicator below the card so the "waiting"
			// state sits where the eye already is.
			this.removeTyping(tab);
			const card = tab.messagesEl.createDiv({ cls: "ai-agent-panel-permission" });
			const title = card.createDiv({ cls: "ai-agent-panel-permission-title" });
			const icon = title.createSpan();
			// A vault tool of ours gets a sentence rather than its wire name.
			const vaultPrompt = obsidianToolPrompt(req.toolName, req.input);
			setIcon(icon, vaultPrompt?.icon ?? "shield-alert");
			title.createSpan({
				text: vaultPrompt?.title ?? req.title ?? `Allow ${req.toolName}?`,
			});
			if (req.description)
				card.createDiv({
					cls: "ai-agent-panel-permission-desc",
					text: req.description,
				});
			const summary = summarizeToolInput(req.toolName, req.input);
			if (summary)
				card.createEl("code", { cls: "ai-agent-panel-permission-summary", text: summary });

			// Approving an edit means approving a change, so show the change - the
			// file is read now, while it is still in its pre-edit state.
			if (isEditTool(req.toolName)) {
				const diffEl = card.createDiv({ cls: "ai-agent-panel-permission-diff" });
				void this.fillPermissionDiff(diffEl, req);
			}

			const details = card.createEl("details");
			details.createEl("summary", { text: "Full input" });
			details
				.createEl("pre")
				.setText(safeJsonPreview(req.input, 2000));

			const buttons = card.createDiv({ cls: "ai-agent-panel-permission-buttons" });
			const settle = (result: PermissionResult, label: string) => {
				if (!tab.pendingPermissions.delete(req.requestId)) return;
				buttons.remove();
				card.addClass("is-settled");
				card.createDiv({ cls: "ai-agent-panel-permission-outcome", text: label });
				this.updateWaitingState(tab);
				resolve(result);
			};
			tab.pendingPermissions.set(req.requestId, {
				resolve,
				settle: (label: string) => {
					buttons.remove();
					card.addClass("is-settled");
					card.createDiv({ cls: "ai-agent-panel-permission-outcome", text: label });
				},
			});

			buttons
				.createEl("button", { cls: "mod-cta", text: "Allow" })
				.addEventListener("click", () =>
					settle({ behavior: "allow", updatedInput: req.input }, "Allowed")
				);
			if (req.suggestions && req.suggestions.length > 0) {
				buttons
					.createEl("button", { text: "Always allow" })
					.addEventListener("click", () =>
						settle(
							{
								behavior: "allow",
								updatedInput: req.input,
								updatedPermissions: req.suggestions,
							},
							"Always allowed"
						)
					);
			}
			buttons
				.createEl("button", { cls: "mod-warning", text: "Deny" })
				.addEventListener("click", () =>
					settle(
						{ behavior: "deny", message: "The user denied this action in Obsidian." },
						"Denied"
					)
				);

			this.showTyping(tab);
			this.scrollToBottom(tab, true);
		});
	}

	/**
	 * Fill an edit permission card's diff. Reading the file is async, so the card
	 * renders immediately with a placeholder and this fills it in; if the prompt
	 * was answered in the meantime the element is already detached and the write
	 * is harmless.
	 */
	private async fillPermissionDiff(
		el: HTMLElement,
		req: PermissionRequest
	): Promise<void> {
		el.createDiv({ cls: "ai-agent-panel-diff-loading", text: "Reading the file…" });
		const reported = editTargetPath(req.input);
		const vaultPath = reported === null ? null : this.resolveReportedPath(reported);
		const before = vaultPath === null ? null : await this.readVaultText(vaultPath);
		el.empty();
		const rendered = this.renderEditDiff(el, req.toolName, req.input, before, null);
		if (!rendered) el.remove();
		else if (vaultPath === null && reported !== null)
			el.createDiv({
				cls: "ai-agent-panel-diff-note",
				text: `${reported} is outside this vault.`,
			});
	}

	/**
	 * AskUserQuestion gets a real form instead of the generic Allow/Deny JSON
	 * prompt: one option list per question (toggles when multiSelect), plus a
	 * free-text "Other" answer. The answers travel back through the permission
	 * response as `updatedInput.answers` keyed by question text, which is how
	 * the CLI hands them to the model.
	 */
	private handleQuestionRequest(
		tab: ChatTab,
		req: PermissionRequest,
		questions: UserQuestion[]
	): Promise<PermissionResult> {
		return new Promise<PermissionResult>((resolve) => {
			this.removeTyping(tab);
			const card = tab.messagesEl.createDiv({ cls: "ai-agent-panel-question" });
			const title = card.createDiv({ cls: "ai-agent-panel-question-title" });
			const icon = title.createSpan();
			setIcon(icon, "help-circle");
			title.createSpan({
				text: questions.length > 1 ? "Claude has questions" : "Claude has a question",
			});

			const picked: Array<Set<number>> = questions.map(() => new Set());
			const otherInputs: HTMLInputElement[] = [];
			const optionEls: HTMLButtonElement[][] = [];
			let submitBtn: HTMLButtonElement | null = null;
			const answered = (qi: number): boolean =>
				picked[qi].size > 0 || otherInputs[qi].value.trim().length > 0;
			const refreshSubmit = () => {
				if (submitBtn) submitBtn.disabled = !questions.every((_, qi) => answered(qi));
			};

			questions.forEach((q, qi) => {
				const block = card.createDiv({ cls: "ai-agent-panel-question-block" });
				const text = block.createDiv({ cls: "ai-agent-panel-question-text" });
				if (q.header)
					text.createSpan({ cls: "ai-agent-panel-question-chip", text: q.header });
				text.createSpan({ text: q.question });
				if (q.multiSelect)
					block.createDiv({
						cls: "ai-agent-panel-question-hint",
						text: "Select all that apply",
					});
				const opts = block.createDiv({ cls: "ai-agent-panel-question-options" });
				const els: HTMLButtonElement[] = [];
				optionEls.push(els);
				q.options.forEach((opt, oi) => {
					const btn = opts.createEl("button", { cls: "ai-agent-panel-question-option" });
					btn.createDiv({ cls: "ai-agent-panel-question-option-label", text: opt.label });
					if (opt.description)
						btn.createDiv({
							cls: "ai-agent-panel-question-option-desc",
							text: opt.description,
						});
					btn.addEventListener("click", () => {
						if (picked[qi].has(oi)) {
							picked[qi].delete(oi);
						} else {
							if (!q.multiSelect) {
								picked[qi].clear();
								otherInputs[qi].value = "";
							}
							picked[qi].add(oi);
						}
						els.forEach((el, i) => el.toggleClass("is-selected", picked[qi].has(i)));
						refreshSubmit();
					});
					els.push(btn);
				});
				const otherInput = opts.createEl("input", {
					cls: "ai-agent-panel-question-other",
					type: "text",
					placeholder: "Other…",
				});
				otherInput.addEventListener("input", () => {
					if (otherInput.value.trim() && !q.multiSelect) {
						picked[qi].clear();
						els.forEach((el) => el.removeClass("is-selected"));
					}
					refreshSubmit();
				});
				otherInputs.push(otherInput);
			});

			const buttons = card.createDiv({ cls: "ai-agent-panel-permission-buttons" });
			const settleUi = (label: string) => {
				buttons.remove();
				card.addClass("is-settled");
				for (const els of optionEls) for (const el of els) el.disabled = true;
				for (const input of otherInputs) input.disabled = true;
				card.createDiv({ cls: "ai-agent-panel-permission-outcome", text: label });
			};
			const settle = (result: PermissionResult, label: string) => {
				if (!tab.pendingPermissions.delete(req.requestId)) return;
				settleUi(label);
				this.updateWaitingState(tab);
				resolve(result);
			};
			tab.pendingPermissions.set(req.requestId, { resolve, settle: settleUi });

			submitBtn = buttons.createEl("button", { cls: "mod-cta", text: "Submit" });
			submitBtn.disabled = true;
			submitBtn.addEventListener("click", () => {
				const answers: Record<string, string> = {};
				const chosen: string[] = [];
				questions.forEach((q, qi) => {
					const labels = q.options
						.filter((_, oi) => picked[qi].has(oi))
						.map((o) => o.label);
					const other = otherInputs[qi].value.trim();
					if (other) labels.push(other);
					answers[q.question] = labels.join(", ");
					chosen.push(answers[q.question]);
				});
				settle(
					{ behavior: "allow", updatedInput: { ...req.input, answers } },
					`Answered: ${chosen.join(" · ")}`
				);
			});
			buttons
				.createEl("button", { text: "Dismiss" })
				.addEventListener("click", () =>
					settle(
						{
							behavior: "deny",
							message: "The user dismissed the question without answering.",
						},
						"Dismissed"
					)
				);

			this.showTyping(tab);
			this.scrollToBottom(tab, true);
		});
	}

	private handlePermissionCancelled(tab: ChatTab, requestId: string): void {
		const pending = tab.pendingPermissions.get(requestId);
		if (!pending) return;
		tab.pendingPermissions.delete(requestId);
		pending.settle("Cancelled");
		pending.resolve({ behavior: "deny", message: "Cancelled" });
		this.updateWaitingState(tab);
	}

	/** Close out every unanswered permission prompt (the CLI process is gone). */
	private failPendingPermissions(tab: ChatTab): void {
		for (const pending of tab.pendingPermissions.values()) {
			pending.settle("Session ended");
			pending.resolve({
				behavior: "deny",
				message: "The agent session ended before this was answered.",
			});
		}
		tab.pendingPermissions.clear();
		this.updateWaitingState(tab);
	}

	// -----------------------------------------------------------------------
	// Rendering helpers
	// -----------------------------------------------------------------------

	/** The one way replies reach the DOM: Markdown with vault links repaired. */
	private renderMarkdown(markdown: string, el: HTMLElement): Promise<void> {
		return MarkdownRenderer.render(this.app, repairLinkTargets(markdown), el, "", this);
	}

	/** Vault link → open the note; external link → the system handler. */
	private handleLinkClick(evt: MouseEvent): void {
		// Left and middle click only; right-click stays Obsidian's context menu.
		if (evt.button !== 0 && evt.button !== 1) return;
		const anchor = linkAnchor(evt);
		if (!anchor) return;
		const linktext = internalLinktext(anchor);
		if (linktext) {
			evt.preventDefault();
			// A bare heading link has no note to open from a chat transcript.
			if (linktext.startsWith("#")) return;
			const resolved = this.resolveLinktext(linktext);
			if (!resolved) {
				new Notice(`No file in this vault matches "${linktext}".`);
				return;
			}
			const newLeaf = evt.button === 1 ? "tab" : Keymap.isModEvent(evt);
			void this.app.workspace.openLinkText(resolved, "", newLeaf);
			return;
		}
		const href = anchor.getAttribute("href") ?? "";
		if (!EXTERNAL_SCHEME.test(href)) return;
		evt.preventDefault();
		window.open(href, "_blank");
	}

	/** Feeds the 'Page preview' core plugin so vault links preview on hover. */
	private handleLinkHover(evt: MouseEvent): void {
		const anchor = linkAnchor(evt);
		const linktext = anchor && internalLinktext(anchor);
		if (!anchor || !linktext) return;
		const resolved = this.resolveLinktext(linktext);
		if (!resolved) return;
		this.app.workspace.trigger("hover-link", {
			event: evt,
			source: VIEW_TYPE_AGENT_PANEL,
			hoverParent: this,
			targetEl: anchor,
			linktext: resolved,
			sourcePath: "",
		});
	}

	/**
	 * Map a link target from a reply onto a vault file, or null if it hits
	 * nothing. Resolving up front matters: `openLinkText` on an unresolved
	 * target offers to create the note, and a stray click shouldn't do that.
	 */
	private resolveLinktext(linktext: string): string | null {
		const { path, subpath } = parseLinktext(linktext);
		if (!path) return null;
		for (const candidate of pathCandidates(path)) {
			// The heading half is matched against the note's text, so it wants
			// the decoded form ("#My%20Heading" resolves to nothing).
			if (this.app.metadataCache.getFirstLinkpathDest(candidate, ""))
				return candidate + safeDecode(subpath);
		}
		return null;
	}

	private renderWelcome(tab: ChatTab): void {
		const welcome = tab.messagesEl.createDiv({ cls: "ai-agent-panel-welcome" });
		const icon = welcome.createDiv({ cls: "ai-agent-panel-welcome-icon" });
		setIcon(icon, AGENT_ICON);
		welcome.createDiv({
			text: "Ask the agent anything about this vault - summarize, refactor, link, or draft notes. It can read and edit files with your permission.",
		});
	}

	private renderUserMessage(
		tab: ChatTab,
		text: string,
		contextName: string | null,
		live: boolean,
		queued = false,
		images: PendingImage[] | number = []
	): void {
		tab.messagesEl.querySelector(".ai-agent-panel-welcome")?.remove();
		const wrapper = tab.messagesEl.createDiv({ cls: "ai-agent-panel-msg-user" });
		if (queued)
			wrapper.createDiv({ cls: "ai-agent-panel-msg-context", text: "↳ queued mid-turn" });
		if (contextName)
			wrapper.createDiv({ cls: "ai-agent-panel-msg-context", text: contextName });
		// A restored message only knows how many images there were; a live one
		// still has the bytes and shows them.
		if (typeof images === "number") {
			if (images > 0)
				wrapper.createDiv({
					cls: "ai-agent-panel-msg-context",
					text: `🖼 ${images} ${images === 1 ? "image" : "images"}`,
				});
		} else if (images.length > 0) {
			const strip = wrapper.createDiv({ cls: "ai-agent-panel-msg-images" });
			for (const image of images) {
				if (!IMAGE_MEDIA_TYPES.has(image.mediaType)) continue;
				const thumb = strip.createEl("img", { cls: "ai-agent-panel-msg-image" });
				thumb.src = `data:${image.mediaType};base64,${image.base64}`;
				thumb.alt = image.name;
				setTooltip(thumb, image.name);
			}
		}
		if (text) wrapper.createDiv({ cls: "ai-agent-panel-msg-user-text", text });
		addCopyButton(wrapper, () => text);
		if (live) {
			this.showTyping(tab);
			this.scrollToBottom(tab, true);
		}
	}

	/** Render one message of a restored conversation (no typing/recording). */
	private renderStored(tab: ChatTab, msg: StoredMessage): void {
		switch (msg.kind) {
			case "user":
				this.renderUserMessage(
					tab,
					msg.text,
					msg.contextName ?? null,
					false,
					false,
					msg.images ?? 0
				);
				return;
			case "bash": {
				this.renderUserMessage(tab, `!${msg.command}`, null, false);
				const card = this.createBashCard(tab, msg.command);
				this.fillBashCard(tab, card, {
					command: msg.command,
					stdout: msg.stdout ?? "",
					stderr: msg.stderr ?? "",
					code: msg.code ?? null,
					timedOut: msg.timedOut === true,
					durationMs: msg.durationMs ?? 0,
					truncated: false,
				});
				return;
			}
			case "assistant": {
				const el = tab.messagesEl.createDiv({ cls: "ai-agent-panel-msg-assistant" });
				void this.renderMarkdown(msg.text, el);
				addCopyButton(el, () => msg.text);
				return;
			}
			case "thinking": {
				const details = tab.messagesEl.createEl("details", {
					cls: "ai-agent-panel-thinking",
				});
				details.createEl("summary", { text: "Thought process" });
				details.createDiv().setText(msg.text);
				return;
			}
			case "tool": {
				const card = this.createToolCard(
					tab,
					msg.name,
					(msg.input ?? {}) as Record<string, unknown>,
					{ added: msg.added, removed: msg.removed }
				);
				if (msg.isError !== undefined || msg.result)
					this.applyToolOutcome(card, msg.result ?? null, msg.isError === true);
				else card.statusEl.setText("");
				return;
			}
			case "meta":
				this.renderTurnMeta(tab, msg);
				return;
		}
	}

	private startStreamingText(tab: ChatTab): StreamingBlock {
		this.removeTyping(tab);
		const el = tab.messagesEl.createDiv({
			cls: "ai-agent-panel-msg-assistant is-streaming",
		});
		return { el, buffer: "" };
	}

	private finalizeText(tab: ChatTab, text: string): void {
		const target = tab.streamingText?.el;
		tab.streamingText = null;
		if (!text.trim()) {
			target?.remove();
			return;
		}
		const el =
			target ?? tab.messagesEl.createDiv({ cls: "ai-agent-panel-msg-assistant" });
		el.removeClass("is-streaming");
		el.empty();
		// The render is async: a failure must not eat the reply (the streamed
		// plain text was just emptied away), and the follow-scroll has to wait
		// until the rendered Markdown has actually grown the element.
		this.renderMarkdown(text, el)
			.catch(() => el.setText(text))
			.then(() => this.scrollToBottom(tab));
		addCopyButton(el, () => text);
		this.record(tab, { kind: "assistant", text });
		// The turn usually isn't over after a text block (tool calls or more
		// text follow) - keep the indicator up until the result removes it.
		if (tab.busy) this.showTyping(tab);
		this.scrollToBottom(tab);
	}

	private startStreamingThinking(tab: ChatTab): StreamingBlock {
		this.removeTyping(tab);
		const details = tab.messagesEl.createEl("details", {
			cls: "ai-agent-panel-thinking",
		});
		details.createEl("summary", { text: "Thinking…" });
		const el = details.createDiv();
		// Thinking streams into a collapsed <details>, so nothing on screen
		// moves - keep the animated dots below it as the visible heartbeat.
		this.showTyping(tab);
		return { el, buffer: "" };
	}

	private finalizeThinking(tab: ChatTab): void {
		if (!tab.streamingThinking) return;
		const details = tab.streamingThinking.el.parentElement;
		const summary = details?.querySelector("summary");
		if (summary) summary.setText("Thought process");
		if (tab.streamingThinking.buffer.trim())
			this.record(tab, { kind: "thinking", text: tab.streamingThinking.buffer });
		tab.streamingThinking = null;
	}

	private renderToolUse(tab: ChatTab, block: ToolUseBlock): void {
		this.removeTyping(tab);
		// Before the card, so the pre-image read starts as early as possible -
		// the tool is already on its way.
		if (isEditTool(block.name)) this.capturePreImage(tab, block);
		const card = this.createToolCard(tab, block.name, block.input);
		tab.toolCards.set(block.id, card);
		const stored: Extract<StoredMessage, { kind: "tool" }> = {
			kind: "tool",
			name: block.name,
			input: block.input,
		};
		tab.toolRecords.set(block.id, stored);
		this.record(tab, stored);
		this.showTyping(tab);
		this.scrollToBottom(tab);
	}

	private createToolCard(
		tab: ChatTab,
		name: string,
		input: Record<string, unknown>,
		stat?: { added?: number; removed?: number }
	): ToolCard {
		const rootEl = tab.messagesEl.createDiv({ cls: "ai-agent-panel-tool" });
		const headerEl = rootEl.createDiv({ cls: "ai-agent-panel-tool-header" });
		const iconEl = headerEl.createSpan();
		setIcon(iconEl, toolIcon(name));
		headerEl.createSpan({ cls: "ai-agent-panel-tool-name", text: name });
		const summary = summarizeToolInput(name, input);
		if (summary)
			headerEl.createSpan({ cls: "ai-agent-panel-tool-summary", text: summary });
		const statEl = headerEl.createSpan({ cls: "ai-agent-panel-tool-stat" });
		if (stat?.added)
			statEl.createSpan({ cls: "ai-agent-panel-diff-plus", text: `+${stat.added}` });
		if (stat?.removed)
			statEl.createSpan({ cls: "ai-agent-panel-diff-minus", text: `-${stat.removed}` });
		const statusEl = headerEl.createSpan({
			cls: "ai-agent-panel-tool-status",
			text: "running",
		});

		const details = rootEl.createEl("details", { cls: "ai-agent-panel-tool-details" });
		const isEdit = isEditTool(name);
		details.createEl("summary", { text: isEdit ? "Diff" : "Details" });
		const bodyEl = details.createDiv();
		// An edit gets a diff of its own intent right away; once the tool
		// finishes, settleEditCard swaps in the diff that actually landed.
		if (!isEdit || !this.renderEditDiff(bodyEl, name, input, null, null))
			bodyEl.createEl("pre").setText(safeJsonPreview(input, 2000));

		return { rootEl, statusEl, bodyEl, statEl };
	}

	private renderError(tab: ChatTab, message: string): void {
		this.removeTyping(tab);
		const el = tab.messagesEl.createDiv({ cls: "ai-agent-panel-error" });
		el.setText(message.slice(0, 2000));
		this.scrollToBottom(tab, true);
	}

	private showTyping(tab: ChatTab): void {
		if (tab.typingEl) return;
		// The send path renders typing before the session flips busy - start
		// the clock here so the very first seconds count too.
		tab.busySince ??= Date.now();
		tab.typingEl = tab.messagesEl.createDiv({ cls: "ai-agent-panel-typing" });
		for (let i = 0; i < 3; i++) tab.typingEl.createSpan({ cls: "ai-agent-panel-dot" });
		tab.typingLabelEl = tab.typingEl.createSpan({ cls: "ai-agent-panel-typing-label" });
		tab.typingTimeEl = tab.typingEl.createSpan({ cls: "ai-agent-panel-typing-time" });
		this.updateTypingTime(tab);
		this.updateWaitingState(tab);
		this.updateBusyTimer();
	}

	private removeTyping(tab: ChatTab): void {
		tab.typingEl?.remove();
		tab.typingEl = null;
		tab.typingTimeEl = null;
		tab.typingLabelEl = null;
		this.updateBusyTimer();
	}

	/**
	 * Reflect "blocked on the user" (open permission or question prompts)
	 * everywhere the working state shows: tab dot turns steady orange, the
	 * typing dots stop pulsing and gain a label, and the composer placeholder
	 * points at the prompt.
	 */
	private updateWaitingState(tab: ChatTab): void {
		const waiting = tab.pendingPermissions.size > 0;
		tab.tabEl.toggleClass("is-waiting", waiting);
		tab.typingEl?.toggleClass("is-waiting", waiting);
		tab.typingLabelEl?.setText(waiting ? "waiting for you" : "");
		if (tab === this.active) this.updateComposerBusy();
		this.refreshTabTooltip(tab);
	}

	/** True when the usage strip is enabled and can actually be seen. */
	private usageVisible(): boolean {
		return (
			this.plugin.settings.showUsage &&
			!document.hidden &&
			this.containerEl.isShown()
		);
	}

	/**
	 * Start or stop the usage poll so that NOTHING runs in the background
	 * while the strip is disabled or off-screen. The poll both re-renders
	 * (keeps "resets in" fresh) and calls refresh(), which is a no-op until
	 * the cache outlives the configured interval.
	 */
	private updateUsageScheduling(): void {
		this.usageBarEl.toggleClass("is-hidden", !this.plugin.settings.showUsage);
		if (!this.usageVisible()) {
			this.clearUsageTimer();
			return;
		}
		// Tick at the refresh interval, but at least every 30s so countdown
		// labels don't go stale between fetches.
		const periodMs = Math.min(
			30_000,
			Math.max(MIN_USAGE_REFRESH_SECONDS, this.plugin.settings.usageRefreshSeconds) *
				1000
		);
		const starting = this.usageTimer === null;
		if (starting || periodMs !== this.usagePeriodMs) {
			this.clearUsageTimer();
			this.usagePeriodMs = periodMs;
			this.usageTimer = window.setInterval(() => this.usageTick(), periodMs);
		}
		// Catch up right away when coming back from hidden/disabled.
		if (starting) this.usageTick();
		else if (this.usageDirty) this.renderUsageBar();
	}

	private usageTick(): void {
		this.renderUsageBar();
		void this.plugin.usage.refresh();
	}

	private clearUsageTimer(): void {
		if (this.usageTimer !== null) {
			window.clearInterval(this.usageTimer);
			this.usageTimer = null;
		}
	}

	/** Called by the plugin when usage-related settings change. */
	onUsageSettingsChanged(): void {
		this.clearUsageTimer(); // restart so a new interval takes effect
		this.updateUsageScheduling();
	}

	/** Keep the 1 Hz elapsed-time updates running only while needed. */
	private updateBusyTimer(): void {
		const anyBusy = this.tabs.some((tab) => tab.busy || tab.typingEl);
		if (anyBusy && this.busyTimer === null) {
			this.busyTimer = window.setInterval(() => {
				for (const tab of this.tabs) this.updateTypingTime(tab);
			}, 1000);
		} else if (!anyBusy && this.busyTimer !== null) {
			window.clearInterval(this.busyTimer);
			this.busyTimer = null;
		}
	}

	/** Rebuild the compact usage strip from the current snapshot. */
	private renderUsageBar(): void {
		this.usageDirty = false;
		const el = this.usageBarEl;
		const show = this.plugin.settings.showUsage;
		el.toggleClass("is-hidden", !show);
		if (!show) return;
		el.empty();
		const usage = this.plugin.usage;
		const snapshot = usage.snapshot;
		el.setAttribute("title", usageTooltip(snapshot, usage.lastError));
		if (!snapshot) {
			el.createSpan({
				cls: "ai-agent-panel-usage-note",
				text: usage.lastError ? "usage unavailable - click to retry" : "usage…",
			});
			return;
		}
		const { usageWarnPercent, usageCritPercent } = this.plugin.settings;
		const addItem = (label: string, percent: number): HTMLElement => {
			const item = el.createSpan({ cls: "ai-agent-panel-usage-item" });
			item.createSpan({ cls: "ai-agent-panel-usage-label", text: label });
			item.createSpan({
				cls: "ai-agent-panel-usage-pct",
				text: `${Math.floor(percent)}%`,
			});
			if (percent >= usageCritPercent) item.addClass("is-crit");
			else if (percent >= usageWarnPercent) item.addClass("is-warn");
			return item;
		};
		if (snapshot.fiveHour?.utilization != null) {
			const item = addItem("5h", snapshot.fiveHour.utilization);
			const remaining = snapshot.fiveHour.resetsAt
				? formatRemaining(new Date(snapshot.fiveHour.resetsAt).getTime() - Date.now())
				: "";
			if (remaining)
				item.createSpan({ cls: "ai-agent-panel-usage-reset", text: `· ${remaining}` });
		}
		if (snapshot.sevenDay?.utilization != null)
			addItem("wk", snapshot.sevenDay.utilization);
		if (snapshot.sevenDaySonnet?.utilization != null)
			addItem("Sonnet", snapshot.sevenDaySonnet.utilization);
		for (const limit of snapshot.modelLimits) addItem(limit.name, limit.percent);
		if (el.childElementCount === 0)
			el.createSpan({ cls: "ai-agent-panel-usage-note", text: "no usage limits" });
	}

	private updateTypingTime(tab: ChatTab): void {
		if (!tab.typingTimeEl || tab.busySince === null) return;
		tab.typingTimeEl.setText(formatElapsed(Date.now() - tab.busySince));
	}

	private updateComposerBusy(): void {
		const busy = this.active?.busy ?? false;
		const waiting = (this.active?.pendingPermissions.size ?? 0) > 0;
		// The send button stays visible while busy: sends then queue/steer.
		this.stopButton.toggleClass("is-hidden", !busy);
		this.sendButton.setAttribute("aria-label", busy ? "Queue message" : "Send");
		this.inputEl.setAttribute(
			"placeholder",
			waiting ? WAITING_PLACEHOLDER : busy ? BUSY_PLACEHOLDER : INPUT_PLACEHOLDER
		);
	}

	// -----------------------------------------------------------------------
	// Composer toolbar
	// -----------------------------------------------------------------------

	private openAddContext(): void {
		const tab = this.active;
		if (!tab) return;
		// Active folder first, then recent files, then remaining folders.
		const { folder: activeFolder } = this.activeTargets();
		const files = this.app.vault
			.getFiles()
			.slice()
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter(
				(f): f is TFolder =>
					f instanceof TFolder && f.path !== "/" && f !== activeFolder
			)
			.sort((a, b) => a.path.localeCompare(b.path));
		const items: TAbstractFile[] = [
			...(activeFolder ? [activeFolder] : []),
			...files,
			...folders,
		].filter((item) => !tab.contextItems.includes(item));
		new AddContextModal(this.app, items, (item) => {
			if (!tab.contextItems.includes(item)) {
				tab.contextItems.push(item);
				this.renderChips();
			}
			this.focusInput();
		}).open();
	}

	private openCommandList(): void {
		if (!this.inputEl.value.startsWith("/"))
			this.inputEl.value = "/" + this.inputEl.value;
		this.inputEl.focus();
		this.inputEl.setSelectionRange(1, 1);
		// Fire the suggests' input listeners so the command popup opens.
		this.inputEl.dispatchEvent(new Event("input"));
	}

	private renderChips(): void {
		const tab = this.active;
		if (!tab) return;
		const { file, folder } = this.activeTargets();

		// Re-rendering replaces the chip elements mid-click when the pane is
		// being activated (mousedown lands on the old chip, mouseup on the new
		// one, so no click fires). Skip when nothing visible changed.
		const key = [
			String(tab.id),
			file?.path ?? "",
			String(tab.includeContext),
			folder?.path ?? "",
			String(tab.includeActiveFolder),
			String(tab.includeVaultContext),
			...tab.contextItems.map((item) => item.path),
			...tab.attachments.map((image) => `${image.name}:${image.bytes}`),
		].join("\n");
		if (key === this.chipsKey) return;
		this.chipsKey = key;

		this.chipsEl.empty();

		// Pasted or dropped images: a thumbnail each, click to drop it again.
		for (const image of tab.attachments) {
			const chip = this.chipsEl.createDiv({ cls: "ai-agent-panel-chip is-image" });
			if (IMAGE_MEDIA_TYPES.has(image.mediaType)) {
				const thumb = chip.createEl("img", { cls: "ai-agent-panel-chip-thumb" });
				// A data URL, not markup - the bytes never go through innerHTML.
				thumb.src = `data:${image.mediaType};base64,${image.base64}`;
				thumb.alt = "";
			} else {
				const icon = chip.createSpan();
				setIcon(icon, "image");
			}
			chip.createSpan({ cls: "ai-agent-panel-chip-name", text: image.name });
			chip.setAttribute(
				"aria-label",
				`${image.name} (${formatBytes(image.bytes)}) - click to remove`
			);
			chip.addEventListener("click", () => {
				tab.attachments = tab.attachments.filter((entry) => entry !== image);
				this.chipsKey = null;
				this.renderChips();
			});
		}

		// Active note and its folder: click toggles whether they are sent.
		if (file) {
			const chip = this.chipsEl.createDiv({ cls: "ai-agent-panel-chip" });
			chip.toggleClass("is-off", !tab.includeContext);
			const icon = chip.createSpan();
			setIcon(icon, "file-text");
			chip.createSpan({ cls: "ai-agent-panel-chip-name", text: file.name });
			chip.setAttribute(
				"aria-label",
				tab.includeContext
					? "Active note is attached - click to exclude"
					: "Active note is excluded - click to attach"
			);
			chip.addEventListener("click", () => {
				tab.includeContext = !tab.includeContext;
				this.renderChips();
			});
		}
		if (folder) {
			const chip = this.chipsEl.createDiv({ cls: "ai-agent-panel-chip" });
			chip.toggleClass("is-off", !tab.includeActiveFolder);
			const icon = chip.createSpan();
			setIcon(icon, "folder");
			chip.createSpan({ cls: "ai-agent-panel-chip-name", text: `${folder.name}/` });
			chip.setAttribute(
				"aria-label",
				tab.includeActiveFolder
					? `Active folder (${folder.path}/) is attached - click to exclude`
					: `Click to attach the active folder (${folder.path}/)`
			);
			chip.addEventListener("click", () => {
				tab.includeActiveFolder = !tab.includeActiveFolder;
				this.renderChips();
			});
		}
		// The note's place in the vault: links, backlinks, properties. Off by
		// default, since it is only worth the tokens when the question is about
		// the vault's structure.
		if (file) {
			const chip = this.chipsEl.createDiv({ cls: "ai-agent-panel-chip" });
			chip.toggleClass("is-off", !tab.includeVaultContext);
			const icon = chip.createSpan();
			setIcon(icon, "git-fork");
			chip.createSpan({ cls: "ai-agent-panel-chip-name", text: "links & properties" });
			chip.setAttribute(
				"aria-label",
				tab.includeVaultContext
					? `${file.name}'s links, backlinks and properties are attached - click to exclude`
					: `Click to attach ${file.name}'s links, backlinks and properties`
			);
			chip.addEventListener("click", () => {
				tab.includeVaultContext = !tab.includeVaultContext;
				this.renderChips();
			});
		}

		// Items attached via "+": x removes, clicking a file's name opens it.
		for (const attached of tab.contextItems) {
			const isFolder = attached instanceof TFolder;
			const chip = this.chipsEl.createDiv({ cls: "ai-agent-panel-chip" });
			chip.setAttribute("aria-label", isFolder ? `${attached.path}/` : attached.path);
			const icon = chip.createSpan();
			setIcon(icon, isFolder ? "folder" : "paperclip");
			chip.createSpan({
				cls: "ai-agent-panel-chip-name",
				text: isFolder ? `${attached.name}/` : (attached as TFile).basename,
			});
			if (attached instanceof TFile) {
				chip.addEventListener("click", () => {
					void this.app.workspace.getLeaf(false).openFile(attached);
				});
			}
			const remove = chip.createSpan({
				cls: "ai-agent-panel-chip-remove",
				attr: { "aria-label": "Remove from context" },
			});
			setIcon(remove, "x");
			remove.addEventListener("click", (evt) => {
				evt.stopPropagation();
				tab.contextItems = tab.contextItems.filter((f) => f !== attached);
				this.renderChips();
			});
		}

		this.chipsEl.toggleClass("is-hidden", this.chipsEl.childElementCount === 0);
	}

	private modeOptions(): typeof MODE_OPTIONS {
		return this.plugin.settings.enableBypassMode
			? MODE_OPTIONS
			: MODE_OPTIONS.filter((o) => o.value !== "bypassPermissions");
	}

	/** Re-render labels after an alias resolved to a newer model id. */
	refreshModelLabels(): void {
		if (!this.active) return;
		for (const tab of this.tabs) this.refreshTabTooltip(tab);
		this.updateConfigBar();
	}

	/**
	 * One control in the row under the composer: icon, label, and a menu of its
	 * own. The elements are built once here and refilled by updateConfigBar().
	 */
	private createSegment(
		parent: HTMLElement,
		name: string,
		open: (evt: MouseEvent) => void
	): HTMLButtonElement {
		const btn = parent.createEl("button", {
			cls: "ai-agent-panel-config-segment",
			attr: { "aria-label": name },
		});
		btn.createSpan({ cls: "ai-agent-panel-config-icon" });
		btn.createSpan({ cls: "ai-agent-panel-config-text" });
		btn.addEventListener("click", (evt) => open(evt));
		return btn;
	}

	private fillSegment(
		btn: HTMLButtonElement,
		icon: string,
		text: string,
		tooltip: string,
		warn = false
	): void {
		setIcon(btn.firstElementChild as HTMLElement, icon);
		(btn.lastElementChild as HTMLElement).setText(text);
		btn.toggleClass("is-warn", warn);
		setTooltip(btn, tooltip, { placement: "top" });
	}

	/** Sync the model/effort/permissions/profile row with the active tab. */
	private updateConfigBar(): void {
		const tab = this.active;
		if (!tab) return;

		const model = describeModel(
			tab.selectedModel,
			this.plugin.settings.resolvedModels,
			this.plugin.cliModelsFor(tab.selectedProfileId)
		);
		this.fillSegment(this.modelSegmentEl, AGENT_ICON, model.short, `Model: ${model.label}`);

		const effort = EFFORT_OPTIONS.find((e) => e.value === tab.selectedEffort);
		this.fillSegment(
			this.effortSegmentEl,
			"gauge",
			effort?.label ?? tab.selectedEffort,
			`Reasoning effort: ${effort?.label ?? tab.selectedEffort}`
		);

		const mode = MODE_OPTIONS.find((m) => m.value === tab.selectedMode);
		this.fillSegment(
			this.modeSegmentEl,
			mode?.icon ?? "shield",
			mode?.short ?? tab.selectedMode,
			`Permissions: ${mode?.label ?? tab.selectedMode}`,
			mode?.warn === true
		);

		// The profile only matters - and only shows - once there are several.
		const settings = this.plugin.settings;
		const several = settings.cliProfiles.length > 1;
		this.profileSegmentEl.toggleClass("is-hidden", !several);
		if (several) {
			const profile =
				profileById(settings, tab.selectedProfileId) ?? defaultProfile(settings);
			this.fillSegment(
				this.profileSegmentEl,
				"terminal",
				profile.name || "Unnamed",
				`Profile: ${profile.name || "Unnamed"}\nWhich Claude Code install this conversation runs on`
			);
		}

		this.refreshTabTooltip(tab);
	}

	private openModelMenu(evt: MouseEvent): void {
		const tab = this.active;
		if (!tab) return;
		const resolved = this.plugin.settings.resolvedModels;
		const cliModels = this.plugin.cliModelsFor(tab.selectedProfileId);
		const models = modelOptions(resolved, cliModels);
		// Whatever is configured or already picked stays selectable even when the
		// CLI's list does not mention it.
		for (const extra of [this.plugin.settings.model, tab.selectedModel]) {
			if (extra && !models.some((m) => m.value === extra))
				models.push({ value: extra, ...describeModel(extra, resolved, cliModels) });
		}
		const menu = new Menu();
		for (const option of models)
			menu.addItem((item) =>
				item
					.setTitle(option.label)
					.setChecked(option.value === tab.selectedModel)
					.onClick(() => this.chooseModel(tab, option.value))
			);
		menu.showAtMouseEvent(evt);
	}

	private chooseModel(tab: ChatTab, value: string): void {
		const previous = tab.selectedModel;
		if (value === previous) return;
		tab.selectedModel = value;
		this.plugin.settings.lastModel = value;
		void this.plugin.saveSettings();
		this.updateConfigBar();
		void this.applyModel(tab, value || undefined).then((ok) => {
			if (ok) return;
			// The CLI rejected the model (e.g. this account lacks it). Put the
			// previous choice back everywhere, or the broken pick would stick and
			// fail again on the next spawn.
			tab.selectedModel = previous;
			this.plugin.settings.lastModel = previous;
			if (tab.conversation) tab.conversation.model = previous || undefined;
			void this.plugin.saveSettings();
			this.updateConfigBar();
		});
	}

	private openEffortMenu(evt: MouseEvent): void {
		const tab = this.active;
		if (!tab) return;
		// Grey out effort levels the selected model does not accept, per the
		// CLI's own report ("CLI default" always stays available).
		const cli = this.plugin
			.cliModelsFor(tab.selectedProfileId)
			?.find((m) => m.value === tab.selectedModel);
		const levels = cli ? cli.supportedEffortLevels ?? [] : null;
		const menu = new Menu();
		for (const option of EFFORT_OPTIONS)
			menu.addItem((item) =>
				item
					.setTitle(option.label)
					.setChecked(option.value === tab.selectedEffort)
					.setDisabled(
						!!option.value && levels !== null && !levels.includes(option.value)
					)
					.onClick(() => {
						if (option.value === tab.selectedEffort) return;
						tab.selectedEffort = option.value;
						this.plugin.settings.lastEffort = option.value;
						void this.plugin.saveSettings();
						this.updateConfigBar();
						this.applyEffort(tab, option.value || undefined);
					})
			);
		menu.showAtMouseEvent(evt);
	}

	private openModeMenu(evt: MouseEvent): void {
		const tab = this.active;
		if (!tab) return;
		const menu = new Menu();
		for (const option of this.modeOptions())
			menu.addItem((item) =>
				item
					.setTitle(option.label)
					.setChecked(option.value === tab.selectedMode)
					.setWarning(option.warn === true)
					.onClick(() => {
						if (option.value === tab.selectedMode) return;
						tab.selectedMode = option.value;
						this.updateConfigBar();
						void this.applyPermissionMode(tab, tab.selectedMode);
					})
			);
		menu.showAtMouseEvent(evt);
	}

	private openProfileMenu(evt: MouseEvent): void {
		const tab = this.active;
		if (!tab) return;
		const settings = this.plugin.settings;
		const current = (
			profileById(settings, tab.selectedProfileId) ?? defaultProfile(settings)
		).id;
		const menu = new Menu();
		for (const profile of settings.cliProfiles)
			menu.addItem((item) =>
				item
					.setTitle(profile.name || "Unnamed profile")
					.setChecked(profile.id === current)
					.onClick(() => {
						if (profile.id === current) return;
						tab.selectedProfileId = profile.id;
						this.updateConfigBar();
						// A live session keeps its process (and its transcript, which
						// the other CLI could not resume); the choice lands on the
						// next spawn.
						if (tab.session?.running)
							new Notice("Profile applies when the next conversation starts.");
					})
			);
		menu.showAtMouseEvent(evt);
	}

	private async applyPermissionMode(
		tab: ChatTab,
		mode: ChatPermissionMode
	): Promise<void> {
		try {
			await tab.session?.setPermissionMode(cliPermissionMode(mode));
		} catch (err) {
			new Notice(`Could not switch mode: ${err instanceof Error ? err.message : err}`);
		}
	}

	/** False when the CLI rejected the model, so the caller can roll back. */
	private async applyModel(tab: ChatTab, model: string | undefined): Promise<boolean> {
		if (tab.conversation) tab.conversation.model = model;
		try {
			await tab.session?.setModel(model);
			return true;
		} catch (err) {
			new Notice(`Could not switch model: ${err instanceof Error ? err.message : err}`);
			return false;
		}
	}

	/**
	 * Effort has no runtime control request, so the session swaps its CLI
	 * process. That is entirely the session's business now -
	 * it waits for any running turn, resumes, and warms the replacement up - so
	 * there is nothing to tell the user about.
	 */
	private applyEffort(tab: ChatTab, effort: string | undefined): void {
		if (tab.conversation) tab.conversation.effort = effort;
		tab.session?.setEffort(effort);
	}

	private stringifyToolResult(
		content: ToolResultBlock["content"]
	): string | null {
		if (content == null) return null;
		if (typeof content === "string") return content;
		const texts = content
			.map((c) => (typeof c.text === "string" ? c.text : null))
			.filter((t): t is string => t !== null);
		return texts.length ? texts.join("\n") : null;
	}

	private scrollToBottom(tab: ChatTab, force = false): void {
		const el = tab.messagesEl;
		const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
		if (force || nearBottom) el.scrollTop = el.scrollHeight;
	}

	/**
	 * Follow streamed output without forcing a layout on every token: many
	 * deltas in one frame coalesce into a single scroll on the next frame.
	 */
	private scrollToBottomThrottled(tab: ChatTab): void {
		if (this.streamScrollRaf !== null) return;
		this.streamScrollRaf = window.requestAnimationFrame(() => {
			this.streamScrollRaf = null;
			if (tab === this.active) this.scrollToBottom(tab);
		});
	}
}

// ---------------------------------------------------------------------------

/** "+" button: pick a vault file or folder to attach as context. */
class AddContextModal extends FuzzySuggestModal<TAbstractFile> {
	constructor(
		app: App,
		private items: TAbstractFile[],
		private onPick: (item: TAbstractFile) => void
	) {
		super(app);
		this.setPlaceholder("Attach a file or folder as context…");
	}

	getItems(): TAbstractFile[] {
		return this.items;
	}

	getItemText(item: TAbstractFile): string {
		// The trailing slash marks folders apart from files.
		return item instanceof TFolder ? `${item.path}/` : item.path;
	}

	onChooseItem(item: TAbstractFile): void {
		this.onPick(item);
	}
}

/**
 * Vault paths referenced with "@" in the prompt. The mention autocomplete
 * inserts full vault paths (folders with a trailing "/"), so each "@" token
 * is matched against real paths - longest match wins, and the character
 * after it must end the token (paths may contain spaces, so this is the
 * only reliable boundary).
 */
function findMentionedPaths(app: App, text: string): string[] {
	const found: string[] = [];
	const trigger = /(^|[\s([{'"])@/g;
	let match: RegExpExecArray | null;
	while ((match = trigger.exec(text))) {
		const rest = text.slice(match.index + match[0].length);
		let best: string | null = null;
		for (const item of app.vault.getAllLoadedFiles()) {
			if (item.path === "/") continue;
			const tokens =
				item instanceof TFolder ? [`${item.path}/`, item.path] : [item.path];
			for (const token of tokens) {
				if (!rest.startsWith(token)) continue;
				const next = rest[token.length];
				if (next !== undefined && !/[\s.,;:!?)\]}'"]/.test(next)) continue;
				const canonical = item instanceof TFolder ? `${item.path}/` : item.path;
				if (!best || canonical.length > best.length) best = canonical;
			}
		}
		if (best && !found.includes(best)) found.push(best);
	}
	return found;
}

/**
 * Hover-revealed copy button in a message's top-right corner. Copies the raw
 * text (assistant messages: their Markdown source), not the rendered DOM.
 */
function addCopyButton(messageEl: HTMLElement, getText: () => string): void {
	const btn = messageEl.createEl("button", {
		cls: "clickable-icon ai-agent-panel-copy-button",
		attr: { "aria-label": "Copy message" },
	});
	setIcon(btn, "copy");
	btn.addEventListener("click", () => {
		void navigator.clipboard.writeText(getText()).then(
			() => {
				setIcon(btn, "check");
				btn.setAttribute("aria-label", "Copied");
				window.setTimeout(() => {
					setIcon(btn, "copy");
					btn.setAttribute("aria-label", "Copy message");
				}, 1500);
			},
			() => new Notice("Could not copy to the clipboard.")
		);
	});
}

/** "42s", "3m 05s", "1h 12m" */
function formatElapsed(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	if (total < 60) return `${total}s`;
	const minutes = Math.floor(total / 60);
	if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
	return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function domIndex(parent: HTMLElement, child: HTMLElement): number {
	return Array.prototype.indexOf.call(parent.children, child);
}

interface UserQuestionOption {
	label: string;
	description: string;
}

interface UserQuestion {
	question: string;
	header: string;
	multiSelect: boolean;
	options: UserQuestionOption[];
}

/** Extract AskUserQuestion's questions; null when the shape is unexpected. */
function parseAskUserQuestions(input: Record<string, unknown>): UserQuestion[] | null {
	const raw = input.questions;
	if (!Array.isArray(raw) || raw.length === 0) return null;
	const questions: UserQuestion[] = [];
	for (const item of raw) {
		if (typeof item !== "object" || item === null) return null;
		const q = item as Record<string, unknown>;
		if (typeof q.question !== "string" || !Array.isArray(q.options)) return null;
		const options: UserQuestionOption[] = [];
		for (const rawOpt of q.options) {
			const opt = rawOpt as Record<string, unknown> | null;
			if (typeof opt?.label !== "string") return null;
			options.push({
				label: opt.label,
				description: typeof opt.description === "string" ? opt.description : "",
			});
		}
		if (options.length === 0) return null;
		questions.push({
			question: q.question,
			header: typeof q.header === "string" ? q.header : "",
			multiSelect: q.multiSelect === true,
			options,
		});
	}
	return questions;
}

// Links in replies ----------------------------------------------------------

/** Schemes handed to the OS rather than resolved inside the vault. */
const EXTERNAL_SCHEME = /^(?:https?|mailto|obsidian|file):/i;
/** Fenced blocks and inline code, kept out of link repair (capturing: split). */
const CODE_SEGMENT = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/;
/** The `](target)` half of an inline Markdown link. */
const LINK_TARGET = /\]\(([^()\n]+)\)/g;

function linkAnchor(evt: Event): HTMLAnchorElement | null {
	const target = evt.target;
	return target instanceof HTMLElement ? target.closest("a") : null;
}

/** The vault target of a rendered link, or null if it points outside. */
function internalLinktext(anchor: HTMLAnchorElement): string | null {
	if (anchor.dataset.href) return anchor.dataset.href;
	const href = anchor.getAttribute("href");
	return href && anchor.classList.contains("internal-link") ? href : null;
}

/**
 * Shapes a vault path arrives in: as written, percent-decoded (how Obsidian
 * escapes its own Markdown links), and without a leading slash.
 */
function pathCandidates(path: string): string[] {
	const forms = new Set<string>();
	for (const base of [path, safeDecode(path)]) {
		forms.add(base);
		forms.add(base.replace(/^\/+/, ""));
	}
	return [...forms].filter(Boolean);
}

function safeDecode(path: string): string {
	try {
		return decodeURIComponent(path);
	} catch {
		return path; // A stray '%' - not percent-encoding after all.
	}
}

/**
 * Claude writes vault paths verbatim, so a link to a note whose name contains
 * a space - `[Log](Projects/Progress Log.md)` - isn't a link at all to a
 * Markdown parser and renders as literal text. Percent-encode those spaces
 * (the form Obsidian itself writes), leaving code untouched.
 */
function repairLinkTargets(markdown: string): string {
	return markdown
		.split(CODE_SEGMENT)
		.map((part, i) => (i % 2 ? part : part.replace(LINK_TARGET, encodeTargetSpaces)))
		.join("");
}

function encodeTargetSpaces(whole: string, target: string): string {
	const trimmed = target.trim();
	// Angle-wrapped targets already carry spaces; schemes aren't vault paths.
	if (!trimmed.includes(" ") || trimmed.startsWith("<") || EXTERNAL_SCHEME.test(trimmed))
		return whole;
	// CommonMark allows a title after the target: `(path "Title")`.
	const title = /\s+["'].*$/.exec(trimmed);
	const path = title ? trimmed.slice(0, title.index) : trimmed;
	if (!path.includes(" ")) return whole;
	return `](${path.replace(/ /g, "%20")}${title ? ` ${title[0].trim()}` : ""})`;
}

function emptyUsage(): ConversationUsage {
	return {
		inputTokens: 0,
		outputTokens: 0,
		cacheWriteTokens: 0,
		cacheReadTokens: 0,
		costUsd: 0,
		turns: 0,
		context: null,
	};
}

function numberOr(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberOrUndefined(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value !== "" ? value : undefined;
}

/** "12.1k" / "1.2M" - compact enough for a one-line meter. */
function formatTokens(tokens: number): string {
	if (tokens < 1000) return String(tokens);
	if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
	return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/** "Research notes" → "Research notes (branch)", without stacking suffixes. */
function branchTitle(title: string | undefined): string {
	const base = (title ?? "Conversation").replace(/ \(branch(?: \d+)?\)$/, "");
	return `${base} (branch)`;
}

/** A frontmatter value as one readable line. */
function stringifyProperty(value: unknown): string {
	if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
	if (value !== null && typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasFiles(data: DataTransfer | null): boolean {
	return data ? Array.from(data.types).includes("Files") : false;
}

/** Image files out of a paste or drop, ignoring anything else in the payload. */
function imageFilesFrom(data: DataTransfer | null): File[] {
	if (!data?.files) return [];
	return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
}

/**
 * Our own MCP tools deserve better than "Allow mcp__obsidian__obsidian_rename?".
 * Returns null for anything else, so the CLI's own title still wins.
 */
function obsidianToolPrompt(
	toolName: string,
	input: Record<string, unknown>
): { title: string; icon: string } | null {
	const prefix = `mcp__${OBSIDIAN_MCP_SERVER}__`;
	if (!toolName.startsWith(prefix)) return null;
	const path = typeof input.file_path === "string" ? input.file_path : input.path;
	const named = typeof path === "string" ? path : "a note";
	switch (toolName.slice(prefix.length)) {
		case "obsidian_rename": {
			const target = typeof input.newPath === "string" ? input.newPath : "a new path";
			return { title: `Rename ${named} to ${target}, updating backlinks?`, icon: "pencil" };
		}
		case "obsidian_properties":
			return input.patch === undefined || input.patch === null
				? { title: `Read ${named}'s properties?`, icon: "list" }
				: { title: `Update ${named}'s properties?`, icon: "list" };
		case "obsidian_links":
			return { title: `Look up ${named}'s links and backlinks?`, icon: "link" };
		case "obsidian_search":
			return {
				title: `Search the vault's metadata for ${
					typeof input.query === "string" ? `"${input.query}"` : "notes"
				}?`,
				icon: "search",
			};
		case "obsidian_open":
			return { title: `Open ${named} in your window?`, icon: "file-text" };
		case "obsidian_active":
			return { title: "Read which note you have open, and your selection?", icon: "file-text" };
		default:
			return null;
	}
}

function toolIcon(name: string): string {
	if (name === "Bash") return "terminal";
	if (name === "AskUserQuestion") return "help-circle";
	if (name === "Read") return "file-text";
	if (name === "Edit" || name === "Write" || name === "NotebookEdit") return "pencil";
	if (name.startsWith("Web")) return "globe";
	if (name === "Task" || name === "Agent") return "bot";
	if (name === "Grep" || name === "Glob") return "search";
	return "wrench";
}

export function summarizeToolInput(
	name: string,
	input: Record<string, unknown>
): string {
	const pick = (...keys: string[]): string => {
		for (const key of keys) {
			const value = input[key];
			if (typeof value === "string" && value.trim()) return value;
		}
		return "";
	};
	let summary =
		pick("file_path", "path", "notebook_path") ||
		pick("command") ||
		pick("pattern") ||
		pick("url") ||
		pick("description", "prompt", "query");
	if (name === "AskUserQuestion") {
		const first = (parseAskUserQuestions(input) ?? [])[0];
		if (first) summary = first.question;
	}
	return summary.length > 96 ? summary.slice(0, 93) + "…" : summary;
}

function safeJsonPreview(value: unknown, maxChars: number): string {
	let json: string;
	try {
		json = JSON.stringify(value, null, 2) ?? "";
	} catch {
		json = String(value);
	}
	return json.length > maxChars ? json.slice(0, maxChars) + "\n…" : json;
}
