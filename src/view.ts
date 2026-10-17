import {
	Component,
	Events,
	ItemView,
	Notice,
	type Menu,
	TFile,
	type HoverPopover,
	type TAbstractFile,
	type WorkspaceLeaf,
} from "obsidian";
import type { TurnEnd } from "./session";
import { ConfirmModal, RenameModal } from "./confirm-modal";
import {
	ConversationPickerModal,
	DeleteConversationModal,
	relativeTime,
	type StoredConversation,
} from "./history";
import { displayTitle, renamedTitle } from "./conversation-list";
import { conversationCost, parseCliCommands } from "./commands";
import { costNote, decideForkBase, sessionTotal } from "./state/fork-base";
import { UNDO_FAILED } from "./state/clear-divider";
import { latestClearId } from "./state/segments";
import {
	defaultProfile,
	keptProfileNotice,
	profileById,
	profilePick,
	reopenMode,
	reopenPicks,
	type MenuMode,
} from "./settings";
import { DEFAULT_SETTINGS, isSafeArgValue, launchSignature, promptLayout, safeCliModels, THEME_CHOICES, THEME_LABELS } from "./settings-core";
import { OBSIDIAN_MCP_SERVER } from "./tool-labels";
import { McpServer } from "./mcp/server";
import { createVaultTools } from "./mcp/vault-tools";
import { SessionChangesModal } from "./diffview";
import { AGENT_ICON } from "./state/agent-icon";
import { loadLocalRecord, loadLocalValue } from "./local-store";
import type { UsageClient } from "./usage-core";
import type { StreamMessage } from "./protocol/types";
import type AgentPanelPlugin from "./main";
import { ContextBuilder } from "./context-builder";
import { placeInVault } from "./edits";
import { ChatTab } from "./tab/chat-tab";
import { PanelCommands } from "./tab/panel-commands";
import { ClearFlow } from "./tab/clear-flow";
import { Recorder, type NewConversationFields } from "./tab/recorder";
import { PermissionFlow } from "./tab/permission-flow";
import { holdSessions, SessionLink } from "./tab/session-link";
import { Announcer } from "./ui/announcer";
import { Composer } from "./ui/composer";
import { ChangesBar } from "./ui/changes-bar";
import { JumpRail } from "./ui/jump-rail";
import { renderMarkdown } from "./ui/markdown";
import { Messages } from "./ui/messages";
import { Header } from "./ui/header";
import { HoverCardHost } from "./ui/hover-card-host";
import { PopoverHost } from "./ui/popover-host";
import { StopConfirm } from "./ui/popovers/clear-confirm";
import { countTasks, settleOnce, stopAskMode, stopTitle, type StopAnswer } from "./state/clear-dialog";
import { RunBar } from "./ui/run-bar";
import { Shell } from "./ui/shell";
import { StatusLine, type StatusTab } from "./ui/status-line";
import { ConversationColumn, showRowMenu, type ColumnOpenTab, type RowMenuIntents, type RowTarget } from "./ui/conversation-column";
import { OpenTabsList, Switcher } from "./ui/switcher";
import { TabStrip } from "./ui/tab-strip";
import { onOwnDocument, type AttachHoverCard, type OpenPopover } from "./ui/dom";
import { branchRecord, holdsSession, latestPrompt, pendingBranch, summarizedAway } from "./state/branch-history";
import { INVALID_BRANCH_TEXT, INVALID_TARGET_TEXT } from "./state/branch-failure";
import { compactAllowed } from "./state/cache-surfaces";
import { isSessionId } from "./state/session-id";
import { FOREIGN_SESSION_NOTICE, freshStartRecord, turnSource } from "./state/boundary-records";
import { appendText } from "./state/composer";
import { closeNeedsConfirmation, reopenReusesTab } from "./state/tab";
import { modelSegment, shownMode, type ShownMode } from "./state/status-line";
import { promptCount } from "./state/prompts";
import { reorder, stepTab, type TabCardInput, type TitleBlockInput } from "./state/tabs";
import { Ticker } from "./state/ticker";
import { TabEditTracker } from "./tab/edit-tracker";
import { RestoreBranch, type BranchSpec } from "./tab/restore-branch";
import { ShellEscape } from "./tab/shell-escape";

export const VIEW_TYPE_AGENT_PANEL = "ai-agent-panel-chat";

/** App.saveLocalStorage key holding the open-tab state (per vault+machine). */
const TAB_STATE_KEY = "ai-agent-panel:open-tabs";
/**
 * Width of the side column, in the same per-device store as the open tabs: how
 * wide a column fits is a property of this screen, not of the vault, so it must
 * not ride along with the synced settings onto a laptop with a narrower one.
 */
const SIDE_WIDTH_KEY = "ai-agent-panel:side-width";
/** Which of the column's sections are collapsed; per device, like the width. */
const SIDE_SECTIONS_KEY = "ai-agent-panel:side-sections";

/**
 * One conversation tab as the view wires it (DES-001 View jobs): its state
 * owner `chat` (`tab/chat-tab`), which fires the events its components
 * follow, and the per-tab parts the view's jobs reach. A hidden tab's CLI
 * keeps streaming into its own model.
 */
interface PanelTab {
	id: number;
	chat: ChatTab;
	/** The tab's messages (`ui/messages`), a child of the view, removed when the tab closes. */
	messages: Messages;
	/** History recording (`tab/recorder`). */
	recorder: Recorder;
	/**
	 * Parent of everything this tab's Markdown renders (embeds, code-block and
	 * post processors). A child of the view, unloaded when the tab closes.
	 */
	renderer: Component;
	/** The CLI session (`tab/session-link`). */
	link: SessionLink;
	/** `/clear` (`tab/clear-flow`). */
	clear: ClearFlow;
	/** Permission prompts: the pending set, automatic decisions, answers (`tab/permission-flow`). */
	flow: PermissionFlow;
	/** `!` runs and usage commands still to finish; each records into the tab's conversation when it does. */
	localRuns: number;
	/** Panel commands and their cards (`tab/panel-commands`). */
	commands: PanelCommands;
	/** The `!` escape (`tab/shell-escape`). */
	shell: ShellEscape;
	conversation: StoredConversation | null;
	/** Pre-edit reads of the main agent's and subagents' edits, and the change list they make. */
	edits: TabEditTracker;
	/** Restore files and Branch on this tab's turns. */
	restore: RestoreBranch;
	/** Bumped by each model pick; only the latest pick rolls back on a refusal. */
	modelGeneration: number;
	/**
	 * The reopened conversation was saved in Auto-approve, which applies only
	 * once the user confirms it (PRD-002.R9); asked when the tab is shown.
	 */
	confirmAuto: boolean;
	/** A Stop and clear question waiting for this tab to be shown (PRD-001.R38). */
	askStop: (() => void) | null;
}

export class AgentPanelView extends ItemView {
	private tabs: PanelTab[] = [];
	private active: PanelTab | null = null;
	private nextTabId = 1;

	/** `tabs`, `active` and `history` (DES-003 Events). */
	private readonly events = new Events();
	private shell!: Shell;
	private header!: Header;
	private composer!: Composer;
	private popovers!: PopoverHost;
	/** Counts the questions Stop and clear asked, for a popover id each. */
	private stopAsks = 0;
	/** A Stop and clear question is open: a second one is answered no. */
	private stopOpen = false;
	private hoverCards!: HoverCardHost;
	/** The shared 1 s ticker of the panel's per-second labels (PRD-001.R29). */
	private ticker!: Ticker;
	/** The strip and the switcher in strip layout, the column in column layout. */
	private strip: TabStrip | null = null;
	private switcher: Switcher | null = null;
	private column: ConversationColumn | null = null;
	/** The jump rail, mounted while Card and "Prompt jump rail" are on (PRD-001.R33). */
	private rail: JumpRail | null = null;

	/** The active note, folder and selection the context chips name (DES-003 Context block and chips). */
	private context!: ContextBuilder;
	/** The page preview open for a link in the messages (`HoverParent`). */
	hoverPopover: HoverPopover | null = null;
	/** The in-process "obsidian" MCP server, created on first use. */
	private obsidianMcp: McpServer | null = null;

	/** The launch settings the open tabs run with (`launchSignature`). */
	private launchSeen: string;

	constructor(leaf: WorkspaceLeaf, private plugin: AgentPanelPlugin) {
		super(leaf);
		this.launchSeen = launchSignature(plugin.settings);
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

	/**
	 * The panel's menu (right-click on its sidebar tab, "More options" in the
	 * main area): "Show tooltips" (PRD-001.R32) and "Theme: Auto", "Light",
	 * "Dark" (PRD-001.R34), checkable, in the "view" section.
	 */
	onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu(menu, source);
		const settings = this.plugin.settings;
		menu.addItem((item) =>
			item
				.setSection("view")
				.setTitle("Show tooltips")
				.setChecked(settings.showTooltips)
				.onClick(() => this.plugin.setShowTooltips(!settings.showTooltips))
		);
		for (const choice of THEME_CHOICES)
			menu.addItem((item) =>
				item
					.setSection("view")
					.setTitle(`Theme: ${THEME_LABELS[choice]}`)
					.setChecked(settings.theme === choice)
					.onClick(() => void this.plugin.setTheme(choice))
			);
	}

	async onOpen(): Promise<void> {
		const content = this.contentEl;
		content.empty();
		content.addClass("ai-agent-panel-view");

		this.shell = this.addChild(
			new Shell(content, {
				settingsEvents: this.plugin.events,
				workspaceEvents: this.app.workspace,
				tabPosition: () => this.plugin.settings.tabPosition ?? DEFAULT_SETTINGS.tabPosition,
				prompts: () => ({
					style: this.plugin.settings.promptStyle,
					pin: this.plugin.settings.pinPrompt,
					rail: this.plugin.settings.promptRail,
				}),
				showTooltips: () => this.plugin.settings.showTooltips,
				loadColumnWidth: () => loadLocalValue(this.app, SIDE_WIDTH_KEY),
				saveColumnWidth: (width) => this.app.saveLocalStorage(SIDE_WIDTH_KEY, width),
			})
		);
		this.ticker = new Ticker(() => this.containerEl.win as typeof window);
		this.register(() => this.ticker.stop());
		this.shell.register(this.plugin.theme.attach(this.shell.rootEl));
		this.hoverCards = this.addChild(new HoverCardHost(this.shell.layerEl, this.shell.mainEl, this.shell.rootEl));
		this.addChild(new Announcer(this.shell.announcerEl, { viewEvents: this.events, activeTab: () => this.active?.chat ?? null }));
		this.popovers = this.addChild(
			new PopoverHost(this.shell.layerEl, this.shell.mainEl, {
				viewEvents: this.events,
				focusComposer: () => this.composer.focus(),
				onShow: () => this.hoverCards.popoverOpened(),
				onHide: () => this.hoverCards.popoverClosed(),
				onReturnFocus: (trigger) => this.hoverCards.focusReturning(trigger),
			})
		);
		// "More", the changes chip and the open-tabs list open down from the top region.
		const openDown: OpenPopover = (trigger, id, content, focus) =>
			this.popovers.open(trigger, id, content, focus, "down");
		this.header = this.addChild(
			new Header(
				this.shell.topEl,
				{
					viewEvents: this.events,
					shellEvents: this.shell.events,
					isColumn: () => this.shell.isColumn,
					titleBlock: () => (this.active ? this.titleBlockOf(this.active) : null),
					exportPath: () => this.exportPath(),
				},
				{
					onNew: () => this.newConversation(),
					onHistory: () => void this.openHistory(),
					onSettings: () => this.plugin.openSettings(),
					onExport: () => void this.exportCurrent(),
					onTranscript: () => this.openTranscript(),
					openPopover: openDown,
				}
			)
		);
		this.addChild(
			new ChangesBar(
				this.shell.topEl,
				{
					viewEvents: this.events,
					changes: () => this.active?.edits ?? null,
					tabEvents: () => this.active?.chat ?? null,
					restoreEvents: () => this.active?.restore ?? null,
					resizePass: this.shell,
					exportPath: () => this.exportPath(),
					restoreBefore: () => this.active?.restore.before() ?? null,
				},
				{
					openPopover: openDown,
					onReviewChanges: () => this.reviewChanges(),
					onRestoreBefore: () => this.active?.restore.restoreBefore(),
					onTranscript: () => this.openTranscript(),
					onOpenFile: (path) => this.openNote(path, "Note not found"),
				}
			)
		);

		this.context = this.addChild(new ContextBuilder(this.app, () => this.composer.contextChanged()));
		this.addChild(
			new RunBar(
				this.shell.composerAreaEl,
				{ viewEvents: this.events, activeTab: () => this.active?.chat ?? null },
				{
					onStopTask: (source, taskId) => {
						const tab = this.tabs.find((entry) => entry.chat === source);
						void tab?.link.session?.stopTask(taskId).catch(() => {
							new Notice("Could not stop that task.");
						});
					},
				}
			)
		);
		this.composer = this.addChild(
			new Composer(
				this.shell.composerAreaEl,
				{
					app: this.app,
					viewEvents: this.events,
					activeTab: () => this.active?.chat ?? null,
					contextTargets: () => this.context.targets(),
					cliCommands: () => this.plugin.cliCommands,
					popoverOpen: () => this.popovers.isOpen,
					resizePass: this.shell,
				},
				{
					onSend: (text) => void this.active?.chat.send(text),
					onStop: () => this.interrupt(),
					onToggleChip: (kind) => this.active?.chat.toggleChip(kind),
					onRemoveChip: (item) => this.active?.chat.detach(item),
					onRemoveImage: (image) => {
						const chat = this.active?.chat;
						chat?.setImages(chat.composer.images.filter((entry) => entry !== image));
					},
					onOpenChip: (file) => void this.app.workspace.getLeaf(false).openFile(file),
					onAttach: (tab, item) => this.chatOf(tab)?.attach(item),
					onImages: (tab, images) => this.chatOf(tab)?.addImages(images),
					openPopover: (trigger, id, content, focus) => this.popovers.open(trigger, id, content, focus),
				}
			)
		);
		this.addChild(
			new StatusLine(
				this.shell.composerAreaEl,
				{
					viewEvents: this.events,
					settingsEvents: this.plugin.events,
					workspaceEvents: this.app.workspace,
					activeTab: () => this.active?.chat ?? null,
					settings: () => this.plugin.settings,
					cliModelsFor: (profileId) => this.plugin.cliModelsFor(profileId),
					usage: this.plugin.usage,
					resizePass: this.shell,
					ticker: this.ticker,
				},
				{
					openPopover: (trigger, id, content, focus) => this.popovers.open(trigger, id, content, focus),
					attachHoverCard: (el, render) => this.hoverCards.attach(el, render),
					onPickModel: (tab, value) => this.onTab(tab, (panel) => this.chooseModel(panel, value)),
					onPickEffort: (tab, value) => this.onTab(tab, (panel) => this.pickEffort(panel, value)),
					onPickMode: (tab, mode) => this.onTab(tab, (panel) => this.pickMode(panel, mode)),
					onPickProfile: (tab, id) => this.onTab(tab, (panel) => this.pickProfile(panel, id)),
					onRefreshUsage: (force) => void this.plugin.usage.refresh(force),
					onRunCommand: (tab, name) => {
						const panel = this.tabs.find((entry) => entry.chat === tab);
						return !!panel && this.runStatusCommand(panel, name);
					},
					onCompact: (tab) => {
						const panel = this.tabs.find((entry) => entry.chat === tab);
						return !!panel && this.compactNow(panel);
					},
					canCompact: (tab) => {
						const panel = this.tabs.find((entry) => entry.chat === tab);
						return !!panel && this.canCompact(panel);
					},
				}
			)
		);

		this.registerEvent(
			this.shell.events.on("layout", () => this.mountTabs())
		);
		this.registerEvent(this.shell.events.on("messages-resize", () => this.active?.messages.keepEnd()));
		this.shell.relayout();
		this.mountTabs();
		this.registerEvent(
			this.plugin.events.on("settings", () => this.mountRail())
		);
		this.mountRail();

		// Reopen this machine's tabs from the previous session (falls back to
		// a single fresh tab).
		await this.restoreTabState();

		// The only full folder scan: from here the store's cache is kept
		// current by save/delete. Deliberately not awaited - the open tabs are
		// already on screen, and "Recent" fills in when the scan lands.
		void this.plugin.history.refresh().then(() => {
			// Restore files and Branch wait for the scan that migrates this device's session record.
			for (const tab of this.tabs) tab.restore.update();
		});

		// Whether a per-second label shows can change with any of these (ADR-016).
		this.registerEvent(this.app.workspace.on("resize", () => this.ticker.check()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.ticker.check()));
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.ticker.check()));
		onOwnDocument(this, this.containerEl, "visibilitychange", () => this.ticker.check());
	}

	onResize(): void {
		// Fires when the view is revealed/hidden as well as on real resizes;
		// undefined members: before onOpen built the view.
		this.shell?.relayout();
		this.ticker?.check();
	}

	async onClose(): Promise<void> {
		for (const tab of this.tabs) {
			// Recorded before the flush, so a reopen sees where the turn ended.
			tab.chat.endRunningTurn();
			// First, so the exit the dispose causes completes no clear (as in closeTab).
			tab.clear.dispose();
			tab.link.dispose();
		}
		await Promise.all(
			this.tabs.map((tab) => this.plugin.history.flush(tab.conversation))
		);
	}

	/** Used by "Add selection to chat" and a shell card's "Add output to chat". */
	appendToInput(text: string): void {
		this.composer.append(text);
	}

	focusInput(): void {
		this.composer.focus();
	}

	/** An open tab's state owner, for an intent naming the tab it began in; null once it closed. */
	private chatOf(source: object): ChatTab | null {
		return this.tabs.find((tab) => tab.chat === source)?.chat ?? null;
	}

	/** Run a status-line pick on the tab it was made in, if that is still open. */
	private onTab(source: StatusTab, pick: (tab: PanelTab) => void): void {
		const tab = this.tabs.find((entry) => entry.chat === source);
		if (tab) pick(tab);
	}

	/**
	 * The send path took the composer's text: clear it where it still is,
	 * the composer or the draft of a tab switched away from meanwhile.
	 */
	private takeText(tab: PanelTab, text: string): void {
		if (tab === this.active) this.composer.clearSent(text);
		else if (tab.chat.composer.draft.trim() === text) tab.chat.setDraft("");
	}

	/** Unsent text goes back after what the tab's composer holds: its message box, or the draft of a tab switched away from. */
	private returnText(tab: PanelTab, text: string): void {
		if (!text) return;
		if (tab === this.active) this.composer.append(text);
		else tab.chat.setDraft(appendText(tab.chat.composer.draft, text));
	}

	/** Whether the active tab's turn runs, so "Stop Claude's turn" is offered (PRD-001.R1). */
	get turnRunning(): boolean {
		return this.active?.chat.turnRunning ?? false;
	}

	/** "Stop Claude's turn": as Stop (PRD-001.R1, R11). */
	stopTurn(): void {
		this.interrupt();
	}

	/** Whether there is another tab to step to, so "Next" and "Previous conversation tab" are offered (PRD-001.R1). */
	get canStepTab(): boolean {
		return this.tabs.length > 1;
	}

	/** "Next" (+1) or "Previous conversation tab" (-1): the tab after or before the active one in strip order, wrapping (`stepTab`). */
	stepTab(delta: -1 | 1): void {
		const key = stepTab(this.summaries(), this.active?.id ?? null, delta);
		if (key !== null) this.selectTab(key);
	}

	/** Stop and Escape (PRD-001.R11): interrupt the active tab's turn, never its background tasks. */
	private interrupt(): void {
		void this.active?.link.session?.interrupt().catch(() => {
			// Best effort; the process close handler resets the state.
		});
	}

	/** The active conversation's exported note, if any. */
	private exportPath(): string | null {
		return this.active?.conversation?.exportPath ?? null;
	}

	/** The column layout's title block (PRD-001.R30); the tab hover card shows the same. */
	private titleBlockOf(tab: PanelTab): TitleBlockInput {
		const messages = tab.conversation?.messages ?? [];
		return {
			title: displayTitle(tab.conversation?.title),
			prompts: promptCount(messages),
			startedAt: messages.length > 0 ? (tab.conversation?.createdAt ?? null) : null,
		};
	}

	/** A vault note opened in the workspace, or `<missing>: <path>` when it is gone. */
	private openNote(path: string, missing: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
		else new Notice(`${missing}: ${path}`);
	}

	/** "Transcript" and "Open transcript" (PRD-003.R11). */
	private openTranscript(): void {
		const path = this.exportPath();
		if (path) this.openNote(path, "Exported note not found");
	}

	/** "Review changes": "Changes this conversation" (PRD-002.R7). */
	private reviewChanges(): void {
		const tab = this.active;
		if (tab) new SessionChangesModal(this.app, tab.edits.files, (path) => this.openNote(path, "Note not found")).open();
	}

	/**
	 * The exporter wrote a conversation's note: the view's `export` event when
	 * a tab here holds it.
	 */
	onTranscriptExported(conversation: StoredConversation): void {
		if (this.tabs.some((tab) => tab.conversation?.id === conversation.id)) this.events.trigger("export");
	}

	/** Used by the "export conversation" command. */
	async exportCurrent(): Promise<void> {
		const id = this.active?.conversation?.id;
		if (id) await this.exportConversation(id);
		else new Notice("Nothing to export yet.");
	}

	/**
	 * Open a fresh conversation tab - always a new one, even when the active tab
	 * is still empty, so "+" (and the command) never silently do nothing.
	 */
	newConversation(): void {
		// A filter left over from finding something else would hide the tab
		// that was just asked for, leaving "+" looking broken.
		this.column?.clearFilter();
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
			this.plugin.settings.showTooltips
		).open();
	}

	/**
	 * A conversation was deleted from history (`history.onDeleted`, for every
	 * view): detach it from any open tab so the tab's next save (or flush on
	 * close) can't recreate the JSON file. The transcript stays on screen; a
	 * further message starts a fresh record.
	 */
	onConversationDeleted(id: string): void {
		const shown = this.tabs.filter((tab) => tab.conversation?.id === id);
		// Nothing to detach here: skip the redraw, and the tab state this device
		// shares between its views must not be rewritten by a view that holds none.
		if (shown.length === 0) return;
		for (const tab of shown) {
			// Its next message starts a new conversation record; the tab's turns count on (PRD-002.R18).
			tab.restore.detach(promptCount(tab.conversation?.messages ?? []));
			tab.conversation = null;
			tab.link.forgetResume();
			tab.restore.update();
			tab.chat.setCost(0);
		}
		this.events.trigger("tabs");
		this.saveTabState();
	}

	// -----------------------------------------------------------------------
	// Tabs
	// -----------------------------------------------------------------------

	private addTab(): PanelTab {
		// Mode, model, effort, profile and note chip from the settings (`newTabData`).
		const chat = new ChatTab(this.plugin.settings);
		const edits = new TabEditTracker({ adapter: this.app.vault.adapter, root: () => this.plugin.getVaultPath() });
		const flow = new PermissionFlow({ tab: chat, edits });
		const clear = new ClearFlow({
			conversation: () => tab.conversation,
			session: () => tab.link.session,
			resumeId: () => tab.link.clearOldId,
			unstartedBranch: () => tab.link.unstartedBranch,
			dropBranch: () => {
				tab.link.dropBranch();
				if (tab.conversation) this.plugin.history.queueSave(tab.conversation);
			},
			// The committing id joins this device's record as one the panel began, before the file holds it (ADR-018 Decision 1).
			recordSession: (sessionId) => {
				if (tab.conversation) this.plugin.provenance.record(tab.conversation.id, tab.link.profileId, sessionId, true);
			},
			record: (message) => tab.recorder.record(message),
			cleared: (sessionId) => tab.link.cleared(sessionId),
			resolvedModels: () => this.plugin.settings.resolvedModels ?? {},
			// The new session's init showed what the CLI lost; the picks are back, and the next init reports the model id.
			reapplied: ({ permissionMode, model }) => {
				if (permissionMode) tab.link.noteCliMode(permissionMode, false);
				if (model) tab.chat.setReportedModel("");
			},
			picking: () => tab.link.picking,
			// The panel's init and status adoption stood aside during the clear; the tab shows what the CLI runs now.
			released: ({ permissionMode }) => tab.link.noteCliMode(permissionMode, false),
			foreignSession: (sessionId) => {
				const profileId = this.tabProfileId(tab);
				if (!tab.conversation || !profileById(this.plugin.settings, profileId)) return true;
				return this.plugin.provenance.decide(tab.conversation.id, profileId, sessionId) === "foreign";
			},
			facts: () => ({
				working: tab.chat.working || tab.link.busy,
				restoring: tab.restore.restoring,
				starting: tab.link.starting,
				picking: tab.link.pickPending,
			}),
			launchGeneration: () => tab.link.launchGeneration,
			startUndo: (sessionId, gate) => tab.link.startUndo(sessionId, gate),
			probeUndo: () => tab.link.probeUndo(),
			stopUndo: () => tab.link.stopUndo(),
			adoptUndo: (sessionId) => tab.link.adoptUndo(sessionId),
			undone: async (usage) => {
				// The record's removal and the resumed id reach disk now, not after the debounce; the sends wait for it.
				// Started first, so no presentation step below can skip it.
				const saved = tab.conversation ? this.plugin.history.save(tab.conversation) : Promise.resolve();
				try {
					tab.chat.removeClear(usage);
					tab.restore.uncleared(tab.conversation?.messages ?? []);
					this.saveTabState();
				} finally {
					await saved;
				}
			},
			undoFailed: () => tab.chat.addError(UNDO_FAILED),
			undoChanged: () => tab.chat.refreshClears(),
			heldChanged: (note) => tab.chat.refreshHeld(note),
			deliver: (send) => tab.chat.deliverHeld(send),
			// A held /clear asks first when an agent or background task runs, and does not run in a restore (PRD-001.R38).
			clearBlock: () => tab.chat.clearBlock(),
			declined: (cause, text, sends) => tab.chat.clearDeclined(cause, text, sends),
			tasks: () => tab.chat.unfinished,
			turnRunning: () => tab.chat.turnRunning || tab.link.busy,
			processReplaced: () => tab.chat.processEnded(),
			// Stop and clear denies the open cards and any that come, so no tool is approved after it (PRD-001.R38).
			denyCards: (on) => flow.refuse(on),
			confirmStop: () => this.confirmStop(tab),
			onCleared: (at) => {
				tab.chat.addClear({ at });
				tab.chat.refreshClears();
				tab.restore.cleared();
				this.saveTabState();
				// The clear and the new id reach disk now, not after the debounce.
				if (tab.conversation) void this.plugin.history.save(tab.conversation);
			},
		});
		const tab: PanelTab = {
			id: this.nextTabId++,
			chat,
			messages: this.addChild(
				new Messages(
					this.shell.messagesHostEl,
					{
						app: this.app,
						tab: chat,
						hoverSource: VIEW_TYPE_AGENT_PANEL,
						hoverParent: this,
						workspaceEvents: this.app.workspace,
						context: () => this.starterContext(),
						ticker: this.ticker,
					},
					{
						renderMarkdown: (markdown, el, owner) => this.renderMarkdown(tab, markdown, el, owner),
						attachHoverCard: (el, render) => this.hoverCards.attach(el, render),
						attachRestore: (button, record) => tab.restore.addTurn(button, record, tab.conversation?.messages ?? []),
						attachBranch: (button, record, retitle) => tab.restore.addBranch(button, record, retitle),
						onBranch: (uuid) => this.branchFrom(tab, uuid),
						toVaultPath: (reported) => this.vaultRelative(reported),
						onPinned: (number) => {
							if (tab === this.active) this.rail?.setCurrent(number);
						},
						onStarter: (prompt) => this.composer.setText(prompt),
						onAnswer: (requestId, answer, key) => flow.answer(requestId, answer, key),
						onCardFailed: (card, error) => flow.failed(card, error),
						onRefreshReport: (id) => tab.commands.refresh(id),
						onReportAction: (id, action) => tab.commands.act(id, action),
						onInsertCommand: (name) => this.composer.insertCommand(name),
						onAddOutput: (result) => tab.shell.addOutput(result),
						onCompact: () => this.compactNow(tab),
						canCompact: () => this.canCompact(tab),
						onFoldLayout: () => {
							if (tab === this.active) this.shell.requestPass();
						},
						undoState: (id) => (id === latestClearId(tab.chat.items) ? clear.undoView() : null),
						onUndo: () => clear.undo(),
						heldView: () => clear.heldView(),
						onCancelHeld: () => clear.cancelHeld(),
					}
				)
			),
			recorder: new Recorder(
				{
					get conversation() {
						return tab.conversation;
					},
					set conversation(conversation) {
						tab.conversation = conversation;
					},
				},
				{
					queueSave: (conversation) => this.plugin.history.queueSave(conversation),
					fields: () => this.newConversationFields(tab),
					// A new branch is recorded before anything else, so a close before its rewind lands reopens as the branch (PRD-002.R15).
					leadRecord: () => {
						const intent = tab.link.takeBranchIntent();
						return intent && branchRecord(intent);
					},
					onFirstMessage: () => {
						// A conversation attached to a live session (the old one was deleted mid-turn) records that session too (ADR-018 Decision 1).
						const live = tab.link.session?.sessionId;
						if (tab.conversation && live)
							this.plugin.provenance.record(tab.conversation.id, tab.link.profileId, live, tab.link.startedFresh);
						this.saveTabState();
					},
					onPrompt: () => this.events.trigger("tabs"),
				}
			),
			renderer: this.addChild(new Component()),
			link: new SessionLink({
				tab: chat,
				settings: () => this.plugin.settings,
				resolveCli: (profile) => this.plugin.resolveCli(profile),
				cli: this.plugin.cliMissing,
				vaultPath: () => this.plugin.getVaultPath(),
				conversation: () => tab.conversation,
				save: (conversation) => this.plugin.history.queueSave(conversation),
				events: {
					onStreamMessage: (msg) => this.handleStreamMessage(tab, msg),
					onPermissionRequest: (req) => flow.request(req),
					onPermissionCancelled: (id) => flow.cancelled(id),
					onBusyChanged: (busy, ended) => this.setTabBusy(tab, busy, ended),
					onEnded: (error) => this.handleSessionEnded(tab, error),
					onBranchFailed: (failure) => {
						// A fork that will not be retried leaves no base behind (PRD-005.R7).
						if (!failure.retry) tab.link.abandonForkBase();
						this.returnText(tab, tab.chat.branchFailed(failure));
					},
					onForkStart: (source) => this.recordForkBase(tab, source),
					// No result will come for a call the old process ran (a background subagent's).
					onRestarted: () => {
						tab.edits.clear();
						tab.chat.processEnded();
					},
					onMcpMessage: (server, message) => this.handleMcpMessage(server, message),
				},
				onInit: (profileId, info) => this.learnInit(profileId, info),
				rememberStartupMode: (profileId, mode) => void this.plugin.rememberStartupMode(profileId, mode),
				showError: (message) => tab.chat.addError(message),
				restoring: () => tab.restore.restoring,
				onSessionChanged: () => tab.restore.update(),
				decide: (sessionId, profileId) => {
					const id = tab.conversation?.id;
					return id ? this.plugin.provenance.decide(id, profileId, sessionId) : "foreign";
				},
				resolve: async () => {
					await this.plugin.history.settled();
					// A failed first listing leaves the migration pending: look again now (ADR-018 Decision 1).
					if (this.plugin.provenance.migrating) await this.plugin.history.refresh();
				},
				recordSession: (sessionId, profileId, started) => {
					if (tab.conversation) this.plugin.provenance.record(tab.conversation.id, profileId, sessionId, started);
				},
				onFreshStart: ({ record, sessionId, notice }) => {
					if (record) tab.recorder.record(freshStartRecord(Date.now(), sessionId));
					if (notice) tab.chat.addNote(FOREIGN_SESSION_NOTICE);
				},
				clearGate: clear,
			}),
			clear,
			flow,
			localRuns: 0,
			commands: new PanelCommands({
				tab: chat,
				get link() {
					return tab.link;
				},
				get recorder() {
					return tab.recorder;
				},
				conversation: () => tab.conversation,
				open: () => this.tabs.includes(tab),
				settings: () => this.plugin.settings,
				pluginVersion: this.plugin.manifest.version,
				cliCommands: () => this.plugin.cliCommands,
				usage: this.plugin.usage,
				modeLabel: () => this.shownMode(tab).long,
				queueSave: (conversation) => this.plugin.history.queueSave(conversation),
				follow: () => tab.messages.follow(),
				notify: (message) => new Notice(message),
				restoring: () => tab.restore.restoring,
				countRun: (delta) => (tab.localRuns += delta),
			}),
			shell: new ShellEscape({
				tab: chat,
				get recorder() {
					return tab.recorder;
				},
				settings: () => this.plugin.settings,
				vaultPath: () => this.plugin.getVaultPath(),
				takeText: (text) => this.takeText(tab, text),
				appendToInput: (text) => this.appendToInput(text),
				countRun: (delta) => (tab.localRuns += delta),
				follow: () => tab.messages.follow(),
			}),
			conversation: null,
			edits,
			restore: new RestoreBranch({
				app: this.app,
				edits,
				turnRunning: () => tab.chat.turnRunning,
				ensureSession: () => tab.link.ensure(),
				sessionId: () => this.recordedSession(tab),
				turnSource: (record) => this.turnSource(tab, record),
				branchBlock: (record) => this.branchBlock(tab, record),
				profileId: () => this.tabProfileId(tab),
				picks: () => {
					const { model, effort, selectedMode, inheritMode } = tab.chat.status;
					return { model, effort, selectedMode, inheritMode };
				},
				showError: (message) => tab.chat.addError(message),
			}),
			modelGeneration: 0,
			confirmAuto: false,
			askStop: null,
		};
		chat.connect({
			link: tab.link,
			recorder: tab.recorder,
			edits,
			restoring: () => tab.restore.restoring,
			conversation: () => tab.conversation,
			runPanelCommand: (text, name, args) => tab.commands.run(text, name, args),
			runShell: (text) => tab.shell.start(text),
			context: (text, withContext) => this.context.forSend(tab.chat.composer, text, withContext),
			takeText: (text) => this.takeText(tab, text),
			// A finished turn consumed quota: usage is refetched (cheap, rate-floored).
			onTurnFinished: () => this.plugin.usage.refreshIfVisible(),
			blocked: () => clear.blocked(),
			holds: () => clear.holds(),
			hold: (text, images, context) => clear.hold(text, images, context),
			declineClear: (cause, text) => clear.decline(cause, text),
			enterClear: () => clear.enterClear(),
			leaveClear: () => clear.leaveClear(),
			confirmStop: () => this.confirmStop(tab),
			stopAndClear: (text) => clear.stopAndClear(text),
			holdClear: (text) => clear.holdClear(text),
			turnChanged: (running, queued) => clear.turnChanged(running, queued),
			returnText: (text) => this.returnText(tab, text),
			composerEmpty: () => (tab === this.active ? this.composer.text.trim() === "" : tab.chat.composer.draft.trim() === ""),
			requestClear: () => clear.request(),
			confirmClear: () => this.confirmClear(),
		});
		// The tab's own events; dropped with the tab, so not registered on the view.
		tab.chat.on("activity", () => this.events.trigger("tabs"));
		// What blocks an Undo (a turn, a restore) changed: the button says so.
		tab.chat.on("activity", () => chat.refreshClears());
		tab.restore.on("restore", () => chat.refreshClears());

		this.tabs.push(tab);
		this.events.trigger("tabs");
		this.switchTab(tab);
		return tab;
	}

	/** An open tab as the strip, the switcher, the column and the open-tabs list read it. */
	private summary(tab: PanelTab): ColumnOpenTab {
		const conversation = tab.conversation;
		return {
			key: tab.id,
			title: displayTitle(conversation?.title),
			pinned: conversation?.pinned === true,
			pinnedAt: conversation?.pinned ? (conversation.pinnedAt ?? null) : null,
			activity: tab.chat.activity,
			id: conversation?.id ?? null,
			updatedAt: conversation?.updatedAt ?? null,
		};
	}

	private summaries(): ColumnOpenTab[] {
		return this.tabs.map((tab) => this.summary(tab));
	}

	private tabByKey(key: number): PanelTab | null {
		return this.tabs.find((tab) => tab.id === key) ?? null;
	}

	/** What a tab's hover card shows (PRD-001.R7). */
	private tabCard(key: number): TabCardInput | null {
		const tab = this.tabByKey(key);
		if (!tab) return null;
		const status = tab.chat.status;
		const settings = this.plugin.settings;
		const { title, prompts, startedAt } = this.titleBlockOf(tab);
		return {
			title,
			activity: tab.chat.activity,
			workingSince: tab.chat.workingSince,
			prompts,
			model: modelSegment(
				status.model,
				status.reportedModel,
				settings.resolvedModels,
				this.plugin.cliModelsFor(status.profileId)
			).short,
			mode: this.shownMode(tab).short,
			startedAt,
			costUsd: status.costUsd,
			costNote: costNote(tab.conversation?.messages ?? [], tab.conversation?.forkBase),
		};
	}

	/** The hover-card host as the strip's and the column's intent. */
	private readonly attachHoverCard: AttachHoverCard = (el, render, direction) =>
		this.hoverCards.attach(el, render, direction);

	/** The row menu's intents, for the column's rows and the strip's tabs. */
	private readonly rowMenuIntents: RowMenuIntents = {
		onOpenStored: (id) => this.openStoredConversation(id),
		onPin: (target, pinned) => this.pinRow(target, pinned),
		onRename: (target) => this.renameRow(target),
		onExport: (id) => void this.exportConversation(id),
		onClose: (key) => this.closeTabByKey(key),
		onDelete: (id) => this.confirmDeleteConversation(id),
		onMenuShow: () => this.hoverCards.popoverOpened(),
		onMenuHide: () => this.hoverCards.popoverClosed(),
	};

	/**
	 * Strip and switcher in strip layout, the column in column layout
	 * (PRD-001.R8): each mounted while its layout shows, as `ui/shell` fires
	 * `layout`.
	 */
	private mountTabs(): void {
		const column = this.shell.isColumn;
		if (column && !this.column) {
			if (this.strip) this.removeChild(this.strip);
			if (this.switcher) this.removeChild(this.switcher);
			this.strip = null;
			this.switcher = null;
			this.column = this.addChild(
				new ConversationColumn(
					this.shell.columnEl,
					{
						viewEvents: this.events,
						tabs: () => this.summaries(),
						activeKey: () => this.active?.id ?? null,
						stored: () => this.plugin.history.snapshot(),
						scanned: () => this.plugin.history.isScanned,
						relativeTime,
						loadCollapsed: () => loadLocalValue(this.app, SIDE_SECTIONS_KEY),
						saveCollapsed: (keys) => this.app.saveLocalStorage(SIDE_SECTIONS_KEY, keys),
						card: (key) => this.tabCard(key),
						ticker: this.ticker,
					},
					{
						...this.rowMenuIntents,
						onSelect: (key) => this.selectTab(key),
						onNew: () => this.newConversation(),
						onReorder: (keys) => this.reorderTabs(keys),
						attachHoverCard: this.attachHoverCard,
					}
				)
			);
		} else if (!column && !this.strip) {
			if (this.column) this.removeChild(this.column);
			this.column = null;
			const tabs = (): ColumnOpenTab[] => this.summaries();
			const activeKey = (): number | null => this.active?.id ?? null;
			this.strip = this.addChild(
				new TabStrip(
					this.header.navEl,
					{
						viewEvents: this.events,
						tabs,
						activeKey,
						card: (key) => this.tabCard(key),
						ticker: this.ticker,
						resizePass: this.shell,
					},
					{
						onSelect: (key) => this.selectTab(key),
						onClose: (key) => this.closeTabByKey(key),
						onOpenTabsList: (trigger) => this.openTabsList(trigger),
						onReorder: (keys) => this.reorderTabs(keys),
						onMenu: (key, x, y, tabEl) => {
							const tab = this.tabByKey(key);
							if (!tab) return;
							const { id, pinned } = this.summary(tab);
							showRowMenu(this.containerEl.doc, x, y, { key, id, pinned }, this.rowMenuIntents, tabEl);
						},
						attachHoverCard: this.attachHoverCard,
					}
				)
			);
			this.switcher = this.addChild(
				new Switcher(this.header.navEl, { viewEvents: this.events, tabs, activeKey }, {
					onOpenTabsList: (trigger) => this.openTabsList(trigger),
				})
			);
		}
		this.ticker.check();
	}

	/** "Open conversations" from the switcher and the strip's All conversations (PRD-001.R7, R30), down from the top region. */
	private openTabsList(trigger: HTMLElement): void {
		const list = new OpenTabsList(
			{ viewEvents: this.events, tabs: () => this.summaries(), activeKey: () => this.active?.id ?? null },
			{
				onSelect: (key) => this.selectTab(key),
				onClose: (key) => this.closeTabByKey(key),
				onHistory: () => void this.openHistory(),
			}
		);
		this.popovers.open(trigger, "open-tabs", list, undefined, "down");
	}

	private selectTab(key: number): void {
		const tab = this.tabByKey(key);
		if (tab) this.switchTab(tab);
	}

	/** A drop: the shown unpinned tabs take their new order (PRD-001.R7). */
	private reorderTabs(keys: number[]): void {
		const shown = keys.map((key) => this.tabByKey(key)).filter((tab): tab is PanelTab => tab !== null);
		this.tabs = reorder(this.tabs, shown);
		this.saveTabState();
		this.events.trigger("tabs");
	}


	// -----------------------------------------------------------------------
	// The conversation column
	// -----------------------------------------------------------------------

	/** Called by the plugin when the history store's cache changes. */
	onHistoryChanged(): void {
		this.events.trigger("history");
	}

	/** The live object an open tab owns, if any - never a second copy of it. */
	private conversationById(id: string): StoredConversation | null {
		return this.tabs.find((tab) => tab.conversation?.id === id)?.conversation ?? null;
	}

	/**
	 * The conversation to act on. An open tab's own object is used as-is;
	 * otherwise it is read from disk, and then looked for again - a tab can
	 * open it while the read is in flight, and writing the copy we read would
	 * roll back everything that tab has recorded since.
	 */
	private async conversationFor(id: string): Promise<StoredConversation | null> {
		const owned = this.conversationById(id);
		if (owned) return owned;
		const loaded = await this.plugin.history.load(id);
		return this.conversationById(id) ?? loaded;
	}

	/** A row's pin toggle or menu entry: an open tab pins its own conversation, created on a fresh tab (PRD-003.R7). */
	private pinRow(target: RowTarget, pinned: boolean): void {
		const tab = target.key === null ? null : this.tabByKey(target.key);
		const id = tab ? tab.recorder.ensureConversation().id : target.id;
		if (id !== null) void this.togglePin(id, pinned);
	}

	/** A row's "Rename…" (PRD-001.R7): the dialog, then the plugin retitles the conversation wherever it is held. */
	private renameRow(target: RowTarget): void {
		const tab = target.key === null ? null : this.tabByKey(target.key);
		const id = tab?.conversation?.id ?? target.id;
		const current = tab ? tab.conversation?.title : id === null ? undefined : this.plugin.history.meta(id)?.title;
		new RenameModal(this.app, {
			title: displayTitle(current),
			accept: (typed) => renamedTitle(current, typed),
			onRename: (title) => {
				// A fresh tab has no conversation yet: made now, as a pin does.
				const renamed = tab ? tab.recorder.ensureConversation().id : id;
				if (renamed !== null) void this.plugin.renameConversation(renamed, title);
			},
		}).open();
	}

	/** The conversations this view's tabs hold under an id (`main` retitles each, PRD-001.R7). */
	heldConversations(id: string): StoredConversation[] {
		return this.tabs.flatMap((tab) => (tab.conversation?.id === id ? [tab.conversation] : []));
	}

	/** A conversation was renamed (`main.renameConversation`, for every view): redraw the tabs showing it. */
	onConversationRenamed(id: string): void {
		if (this.heldConversations(id).length > 0) this.events.trigger("tabs");
	}

	/**
	 * Pin or unpin, whether or not the conversation is open - pinning one from
	 * history deliberately does not open it, since the point is to keep it to
	 * hand rather than to start work on it now.
	 */
	private async togglePin(id: string, pinned: boolean): Promise<void> {
		const conversation = await this.conversationFor(id);
		if (!conversation) {
			new Notice("Could not load that conversation.");
			return;
		}
		conversation.pinned = pinned || undefined;
		conversation.pinnedAt = pinned ? Date.now() : undefined;
		// touch: false - pinning is not activity, so it must not restamp the
		// conversation as having been used today.
		await this.plugin.history.save(conversation, { touch: false });
		// A conversation with nothing in it yet is not written at all, so the
		// save above may have announced nothing. Redraw either way; the flag is
		// on the object and persists with the first real message.
		this.events.trigger("tabs");
	}

	/**
	 * Open a conversation from history. Its row moves out of Recent and into
	 * Open on the re-render that restoreConversation triggers.
	 */
	private openStoredConversation(id: string): void {
		void this.plugin.history.load(id).then((stored) => {
			if (stored) this.restoreConversation(stored);
			else new Notice("Could not load that conversation.");
		});
	}

	private confirmDeleteConversation(id: string): void {
		// The store detaches the open tabs once the file is gone (`onDeleted`).
		const known = this.conversationById(id) ?? this.plugin.history.meta(id);
		new DeleteConversationModal(this.app, this.plugin.history, {
			id,
			title: known?.title ?? "This conversation",
		}).open();
	}

	/** Export one conversation, open or not: the command and the row menu. */
	private async exportConversation(id: string): Promise<void> {
		const conversation = await this.conversationFor(id);
		if (!conversation) {
			new Notice("Could not load that conversation.");
			return;
		}
		if (conversation.messages.length === 0) {
			new Notice("Nothing to export yet.");
			return;
		}
		try {
			const path = await this.plugin.exporter.export(conversation);
			// Persists exportPath. touch: false - exporting is no more activity
			// than pinning is, and the row menu can export a conversation no tab
			// owns, which would otherwise pull it up into "Today".
			await this.plugin.history.flush(conversation, { touch: false });
			new Notice(`Exported to ${path}`);
		} catch (err) {
			new Notice(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private switchTab(tab: PanelTab): void {
		if (tab === this.active) {
			this.focusInput();
			return;
		}
		const prev = this.active;
		if (prev) {
			prev.chat.setDraft(this.composer.text);
			// Lost while hidden (display: none), so kept on the tab (PRD-001.R7).
			prev.chat.setScroll(prev.messages.scrollPosition());
			prev.messages.setShown(false);
		}
		this.active = tab;
		tab.messages.setShown(true);
		tab.messages.restoreScroll(tab.chat.scroll);
		// The rail re-reads on the incoming tab's content resizing (DES-003 Layout model).
		this.shell.observeContent(tab.messages.contentEl);
		// The composer, the status line, the rail and the tab lists move to the incoming tab.
		this.events.trigger("active");
		this.rail?.setCurrent(tab.messages.pinned);
		this.ticker.check();
		// The open-tabs list closing the active tab keeps focus in the list.
		if (!this.popovers.keepsFocus) this.focusInput();
		this.saveTabState();
		if (tab.confirmAuto) this.confirmAutoMode(tab);
		const askStop = tab.askStop;
		tab.askStop = null;
		askStop?.();
	}

	/**
	 * Agents or background tasks run (PRD-001.R38): stop them and clear, or leave
	 * everything as it was. Asked in the panel's own window, for the tab shown;
	 * a tab that is not shown keeps its messages held and asks when it is next
	 * shown, as Auto-approve does. A question asked while another is open is
	 * answered no.
	 */
	private confirmStop(tab: PanelTab): Promise<StopAnswer> {
		return new Promise<StopAnswer>((resolve) => {
			const ask = (): void => {
				const title = stopTitle(countTasks(tab.chat.unfinished));
				if (title === null) return resolve("clear");
				const mode = stopAskMode(tab === this.active, this.stopOpen);
				if (mode === "refuse") return resolve("cancel");
				if (mode === "wait") {
					tab.askStop = ask;
					return;
				}
				this.stopOpen = true;
				const settle = settleOnce(
					(answer) => {
						this.stopOpen = false;
						resolve(answer);
					},
					() => this.composer.focus()
				);
				try {
					this.popovers.open(
						this.composer.card,
						`stop-clear-${++this.stopAsks}`,
						new StopConfirm(title, (stop) => settle(stop ? "stop" : "cancel"))
					);
				} catch (err) {
					// The question could not open: nothing is stopped and the submission goes on to its end.
					console.error("AI Agent Panel: the stop question failed to open", err);
					settle("cancel");
				}
			};
			ask();
		});
	}

	/** Text follows `/clear` (PRD-001.R38): clear without it, or leave everything as it was. */
	private confirmClear(): Promise<boolean> {
		return new Promise((resolve) => {
			new ConfirmModal(this.app, {
				title: "Clear the context?",
				text: "The text after /clear is not sent.",
				confirmText: "Clear",
				onConfirm: () => resolve(true),
				afterClose: (confirmed) => {
					if (!confirmed) resolve(false);
				},
			}).open();
		});
	}

	/**
	 * Ask before a reopened conversation goes back into Auto-approve
	 * (PRD-002.R9). Keep leaves the tab's mode and the stored one as they are,
	 * so the next reopen asks again.
	 */
	private confirmAutoMode(tab: PanelTab): void {
		tab.confirmAuto = false;
		if (tab.chat.status.selectedMode === "auto") return;
		new ConfirmModal(this.app, {
			title: "Reopen in auto-approve?",
			text:
				`"${displayTitle(tab.conversation?.title)}" was saved in auto-approve ` +
				"everything, which answers Claude Code's permission requests without asking you.",
			cancelText: "Keep current mode",
			confirmText: "Auto-approve everything",
			focusCancel: true,
			onConfirm: () => {
				if (this.tabs.includes(tab)) void tab.link.pickMode("auto");
			},
		}).open();
	}

	/**
	 * Close a tab (close button, middle-click, row menu, Delete on a focused
	 * tab): at once, or after confirmation while its turn runs or a card in it
	 * waits (PRD-001.R7).
	 */
	private closeTabByKey(key: number): void {
		const tab = this.tabByKey(key);
		if (!tab) return;
		if (!closeNeedsConfirmation(tab.chat.turnRunning, tab.chat.pendingCount)) {
			this.closeTab(tab);
			return;
		}
		const title = displayTitle(tab.conversation?.title);
		new ConfirmModal(this.app, {
			title: "Close this conversation?",
			text:
				(tab.chat.pendingCount > 0
					? `Claude is waiting for your answer in "${title}". `
					: `Claude is still working in "${title}". `) +
				"Closing the tab stops it; the conversation stays in your history.",
			cancelText: "Keep open",
			confirmText: "Close",
			focusCancel: true,
			onConfirm: () => this.closeTab(tab),
		}).open();
	}

	private closeTab(tab: PanelTab): void {
		const index = this.tabs.indexOf(tab);
		if (index === -1) return;
		tab.chat.endRunningTurn();
		tab.clear.dispose();
		tab.link.dispose();
		void this.plugin.history.flush(tab.conversation);
		this.tabs.splice(index, 1);
		if (tab === this.active) {
			this.active = null;
			if (this.tabs.length > 0)
				this.switchTab(this.tabs[Math.min(index, this.tabs.length - 1)]);
		}
		if (this.tabs.length === 0) this.addTab();
		// The conversation is still in history, so its row moves to "Recent".
		this.saveTabState();
		this.events.trigger("tabs");
		// Last: a throwing `onunload` of another plugin must not skip the above.
		this.unloadRenderer(tab.messages);
		this.unloadRenderer(tab.renderer);
	}

	/** Unload a tab's messages or render component; a failure is logged, not propagated. */
	private unloadRenderer(renderer: Component): void {
		try {
			this.removeChild(renderer);
		} catch (err) {
			console.error("AI Agent Panel: a render component failed to unload", err);
		}
	}

	private setTabBusy(tab: PanelTab, busy: boolean, ended: TurnEnd | undefined): void {
		tab.chat.setTurnRunning(busy, ended);
		tab.restore.update();
	}

	/**
	 * Re-render a stored conversation and arrange for the next message to
	 * resume its CLI session (the CLI restores context silently - it never
	 * replays messages, which is why we keep our own transcript).
	 */
	private restoreConversation(stored: StoredConversation, askNow = true): void {
		const open = this.tabs.find((t) => t.conversation?.id === stored.id);
		if (open) {
			this.switchTab(open);
			return;
		}
		let tab = this.active;
		const reuse =
			tab !== null &&
			reopenReusesTab({
				hasConversation: tab.conversation !== null,
				hasSession: tab.link.session !== null,
				starting: tab.link.starting,
				turnRunning: tab.chat.turnRunning,
				localRuns: tab.localRuns,
				pendingCards: tab.chat.pendingCount,
			});
		// What still runs in the active tab would land in the reopened conversation (PRD-003.R9).
		if (!tab || !reuse) tab = this.addTab();
		else {
			// A tab detached from a deleted conversation still shows rendered
			// replies; their render children go with the messages the reopen replaces.
			const old = tab.renderer;
			tab.renderer = this.addChild(new Component());
			this.unloadRenderer(old);
		}

		tab.conversation = stored;
		// A branch whose rewind failed forks and rewinds on its next send, as before the close (PRD-002.R15).
		const pending = pendingBranch(stored);
		if (pending && pending !== "invalid")
			tab.link.branchFrom(pending.source, pending.target, () => this.recordedLatest(pending.source) ?? pending.latest, true);
		else tab.link.resumeFrom(stored.sessionId);
		// Before the messages render: Restore files shows only on the tab's profile.
		const picks = reopenPicks(stored, this.plugin.settings);
		tab.chat.setModel(picks.model);
		tab.chat.setEffort(picks.effort);
		tab.chat.setProfile(picks.profileId);
		const mode = reopenMode(stored, tab.chat.status, this.plugin.settings.enableBypassMode);
		tab.chat.setMode({ selectedMode: mode.selectedMode, inheritMode: mode.inheritMode });
		tab.chat.setReportedModel(stored.resolvedModel || stored.model || "");
		tab.confirmAuto = mode.confirmAuto;

		// Every turn that offers Restore files, before the reopen draws any (PRD-002.R18).
		tab.restore.load(stored.messages);
		// The whole model first; `ui/messages` draws the last screen, then the rest when idle (DES-003 Reopen).
		tab.chat.loadStored(stored.messages, stored.forkBase);
		if (pending === "invalid") tab.chat.addError(INVALID_BRANCH_TEXT);
		tab.chat.setCost(conversationCost(stored.messages, stored.forkBase));
		this.focusInput();
		// The row leaves "Recent" for "Open" now that a tab owns it; follow it,
		// as a reopen into the active tab fires no `active`.
		this.events.trigger("tabs");
		this.column?.revealActive();
		this.saveTabState();
		if (askNow && tab.confirmAuto) this.confirmAutoMode(tab);
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
		const raw = loadLocalRecord(this.app, TAB_STATE_KEY);
		const ids = Array.isArray(raw?.ids)
			? raw.ids.filter((id): id is string => typeof id === "string")
			: [];
		for (const id of ids) {
			// Deleted conversations just drop out of the restored set.
			const stored = await this.plugin.history.load(id);
			// An Auto-approve confirmation waits until its tab is shown.
			if (stored) this.restoreConversation(stored, false);
		}
		if (this.tabs.length === 0) this.addTab();
		else {
			const activeTab = this.tabs.find(
				(tab) => tab.conversation?.id === raw?.activeId
			);
			if (activeTab) this.switchTab(activeTab);
		}
		this.saveTabState();
		// switchTab asks for a tab it shows, but not for the one already active.
		if (this.active?.confirmAuto) this.confirmAutoMode(this.active);
	}

	// -----------------------------------------------------------------------
	// Services: status-line commands, usage, the CLI's initialize reply,
	// launch settings, the obsidian MCP server, a session's end
	// -----------------------------------------------------------------------

	/** A status-line popover's "/usage in chat" or "/context details" (PRD-005.R5, R8); false when not run. */
	private runStatusCommand(tab: PanelTab, name: string): boolean {
		// From a restore's preview to its end the tab sends nothing (PRD-002.R14).
		if (tab.restore.restoring) return false;
		tab.commands.run(`/${name}`, name, "");
		return true;
	}

	/**
	 * The context popover's Compact and the `/context` card's "/compact now"
	 * (PRD-005.R11): `/compact` through the send path. Not while a turn runs,
	 * where it would go straight to the running CLI, nor during a restore.
	 */
	private canCompact(tab: PanelTab): boolean {
		return compactAllowed(tab.chat.activity, tab.restore.restoring, tab.clear.holds());
	}

	private compactNow(tab: PanelTab): boolean {
		if (!this.canCompact(tab)) return false;
		void tab.chat.send("/compact");
		return true;
	}

	/**
	 * A running session's client, for the plan-usage lookup - the active tab's
	 * if it has one, otherwise any other tab that happens to be up. Returns null
	 * rather than spawning: usage is never worth starting a CLI process for.
	 */
	liveUsageClient(): UsageClient | null {
		const running = (tab: PanelTab | null) => tab?.link.session?.liveClient ?? null;
		return running(this.active) ?? this.tabs.map(running).find(Boolean) ?? null;
	}

	/** Used by the file/folder context menu ("Add to agent chat"). */
	addContextItem(item: TAbstractFile): void {
		this.active?.chat.attach(item);
	}

	/** The initialize reply (DES-002): the models this CLI and account accept, screened as a stored list is, and the described command list. */
	private learnInit(profileId: string, info: Record<string, unknown>): void {
		const models = safeCliModels(info.models);
		if (models) void this.plugin.rememberCliModels(profileId, models);
		const commands = parseCliCommands(info.commands);
		if (commands) {
			this.plugin.cliCommands = commands;
			this.plugin.cliCommandsDescribed = true;
		}
	}

	/**
	 * Launch settings changed (a profile's options, the vault instructions,
	 * the vault tools, bypass): each open conversation swaps its CLI process
	 * once idle (`SessionLink.relaunch`). Held from the start, so a session
	 * that leaves Bypass and takes new options restarts once; a send during
	 * the CLI lookups restarts an idle session at once, onto a process without
	 * the bypass flag.
	 */
	async onLaunchSettingsChanged(): Promise<void> {
		// Opening and closing the settings without a launch change leaves an Undo alone.
		const signature = launchSignature(this.plugin.settings);
		const changed = signature !== this.launchSeen;
		this.launchSeen = signature;
		// Every tab at once, before the first await: a tab waiting its turn must not adopt an Undo with the old CLI.
		if (changed) for (const tab of this.tabs) tab.link.invalidateLaunch();
		const release = holdSessions(this.tabs.map((tab) => tab.link));
		try {
			if (!this.plugin.settings.enableBypassMode) for (const tab of this.tabs) tab.link.leaveBypass();
			for (const tab of [...this.tabs]) await tab.link.relaunch();
		} finally {
			release();
		}
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
					"renaming a note through Obsidian so links to it are updated as the " +
					"user's setting directs, finding notes by tag or frontmatter property, " +
					"reading or setting properties, or seeing what the user currently has open. Plain file reads and text searches are " +
					"better served by Read and Grep.",
			},
			createVaultTools(this.app, () => this.context.lastEditorView)
		);
		return this.obsidianMcp;
	}

	private async handleMcpMessage(serverName: string, message: unknown): Promise<unknown> {
		if (serverName !== OBSIDIAN_MCP_SERVER)
			throw new Error(`Unknown in-process MCP server: ${serverName}`);
		return this.mcpServer().handle(message);
	}

	/**
	 * The CLI process ended (DES-002 Session end); its turn closed as it went.
	 * Open cards are settled, since an answer can no longer be delivered; an
	 * error is recorded and shown as an error block.
	 */
	private handleSessionEnded(tab: PanelTab, error?: string): void {
		tab.flow.ended();
		tab.chat.processEnded();
		if (!error) return;
		tab.restore.noteSessionError();
		// A restored conversation whose CLI session never initialized falls back
		// to a fresh session, keeping the restored messages on screen.
		tab.chat.sessionEnded(tab.link.endedWith(error));
	}

	// -----------------------------------------------------------------------
	// History recording
	// -----------------------------------------------------------------------

	/** What a tab's new conversation records of it (`tab/recorder`). */
	private newConversationFields(tab: PanelTab): NewConversationFields {
		return {
			profileId: this.tabProfileId(tab),
			// "" is Default, so a reopen does not take the tab's last pick.
			model: tab.chat.status.model,
			effort: tab.chat.status.effort,
			// An inherited mode stays inherited on reopen, whatever the CLI reported.
			permissionMode: tab.chat.status.inheritMode ? "default" : tab.chat.status.selectedMode,
			permissionModePicked: tab.chat.status.inheritMode ? undefined : true,
		};
	}

	// -----------------------------------------------------------------------
	// The CLI's stream
	// -----------------------------------------------------------------------

	/**
	 * One message from the tab's CLI: `tab/chat-tab` applies it to the
	 * messages model (DES-003 Stream to messages); `system/init` and the
	 * mode a `system/status` reports come back here.
	 */
	private handleStreamMessage(tab: PanelTab, msg: StreamMessage): void {
		for (const change of tab.chat.applyStream(msg)) {
			if (change.type === "init") this.noteInit(tab, change.message);
			// Sent on mode changes too, e.g. when an approved plan leaves plan mode.
			// Not once the reset came: it may be the session losing the mode, and must not become the launch config.
			else if (change.type === "system" && change.subtype === "status" && !tab.clear.resetSeen) tab.link.noteCliMode(change.message.permissionMode, true);
		}
	}

	/** `system/init` (DES-002): the model segment's label, the mode, the alias resolution, the command names, the session saved. */
	private noteInit(tab: PanelTab, msg: StreamMessage): void {
		const init = msg as {
			model?: string;
			session_id?: string;
			slash_commands?: string[];
			permissionMode?: string;
		};
		// An open clear judges the new session's picks first and shows the ones it keeps (PRD-001.R38).
		const clearing = tab.clear.resetSeen;
		if (!clearing) {
			tab.chat.setReportedModel(init.model ?? "");
			tab.link.noteCliMode(init.permissionMode, false);
		}
		if (init.model && !clearing) {
			// Teach the picker what this alias currently points at.
			void this.plugin.rememberModelResolution(tab.link.session?.spawnedModel ?? "", init.model);
		}
		// Names only - the initialize reply's list (with descriptions) wins
		// when the CLI sent one.
		if (init.slash_commands?.length && !this.plugin.cliCommandsDescribed) {
			this.plugin.cliCommands = init.slash_commands.map((name) => ({ name }));
		}
		if (tab.conversation) {
			// An open clear stores its new id with its record, not apart from it (PRD-001.R38).
			if (init.session_id && !tab.clear.open) {
				// This device's record first: the id is recorded before the file holds it (ADR-018 Decision 1).
				this.plugin.provenance.record(tab.conversation.id, tab.link.profileId, init.session_id, tab.link.startedFresh);
				tab.conversation.sessionId = init.session_id;
				// Recorded once the CLI confirms a session, so a CLI only a panel
				// command started cannot mark a fallback profile as the session's.
				const session = tab.link.session;
				if (session) tab.conversation.profileId = session.profileId;
			}
			if (init.model && !clearing) tab.conversation.resolvedModel = init.model;
			this.plugin.history.queueSave(tab.conversation);
		}
		tab.restore.update();
	}

	// -----------------------------------------------------------------------
	// Restore and branch
	// -----------------------------------------------------------------------

	/**
	 * The session Restore files and Branch use: the live session's id, else the
	 * stored one if it passes the grammar and this device recorded it for the
	 * profile that would run it, which is known only after the first scan
	 * (ADR-018 Decision 1); null otherwise.
	 */
	private recordedSession(tab: PanelTab): string | null {
		const live = tab.link.session?.sessionId;
		if (live) return live;
		const stored = tab.conversation?.sessionId;
		if (!tab.conversation || !isSessionId(stored)) return null;
		return this.plugin.provenance.check(tab.conversation.id, this.tabProfileId(tab), stored) ? stored : null;
	}

	/**
	 * The session and profile a branch from a turn forks: the turn's own,
	 * else the tab's live session or the conversation's stored one; the
	 * profile the turn's, else the conversation's, else the tab's (ADR-018
	 * Decision 1). A turn before a fresh start keeps its own session.
	 */
	private turnSource(tab: PanelTab, record: { sessionId?: string; profileId?: string } | null): { sessionId: string | null; profileId: string } {
		const source = turnSource(record, tab.conversation?.messages ?? [], tab.link.session?.sessionId, tab.conversation, this.tabProfileId(tab));
		return { sessionId: typeof source.sessionId === "string" ? source.sessionId : null, profileId: source.profileId };
	}

	/**
	 * Why Branch is not offered on a turn: `foreign` when its session is not
	 * one this device recorded for the conversation and profile (a rejected id
	 * excluded), `hidden` for an id failing the grammar, `pending` until a
	 * scan has migrated the record, `compacted` when a compaction summarized
	 * the turn away; null when it is offered or the turn has no session id to
	 * judge (PRD-002.R15).
	 */
	private branchBlock(tab: PanelTab, record: { sessionId?: string; profileId?: string } | null): "foreign" | "pending" | "hidden" | "compacted" | null {
		const session = this.sessionBlock(tab, record);
		if (session !== null) return session;
		return summarizedAway(tab.conversation?.messages ?? [], record) ? "compacted" : null;
	}

	/** The part of `branchBlock` that judges the turn's session. */
	private sessionBlock(tab: PanelTab, record: { sessionId?: string; profileId?: string } | null): "foreign" | "pending" | "hidden" | null {
		const { sessionId, profileId } = this.turnSource(tab, record);
		if (sessionId === null) return null;
		// A turn whose stored id is no session id offers no Branch at all.
		if (!isSessionId(sessionId)) return "hidden";
		// A profile this device lacks makes the source foreign.
		if (!profileById(this.plugin.settings, profileId)) return "foreign";
		const conversation = tab.conversation;
		if (!conversation) return "foreign";
		const verdict = this.plugin.provenance.decide(conversation.id, profileId, sessionId);
		return verdict === "trusted" ? null : verdict;
	}

	/** The profile the tab's session runs, or the one its next launch takes. */
	private tabProfileId(tab: PanelTab): string {
		const settings = this.plugin.settings;
		return tab.link.session?.profileId ?? (profileById(settings, tab.chat.status.profileId) ?? defaultProfile(settings)).id;
	}

	/** The latest prompt an open tab's conversation recorded of CLI session `source`, in its current or an earlier segment; null when no open tab holds it. */
	private recordedLatest(source: string): string | null {
		for (const tab of this.tabs) {
			const conversation = tab.conversation;
			if (!conversation || (conversation.sessionId !== source && !holdsSession(conversation.messages, source))) continue;
			const latest = latestPrompt(conversation.messages, source);
			if (latest !== null) return latest;
		}
		return null;
	}

	/**
	 * A fork of CLI session `source` starts in the branch `tab` (PRD-005.R7):
	 * its fork base is the latest total an open tab's conversation recorded
	 * for the source, replacing an earlier fork's. None when no tab records a
	 * total or a turn runs in the source; an estimate when the panel may not
	 * have seen all of it (`decideForkBase`).
	 */
	private recordForkBase(tab: PanelTab, source: string): void {
		const conversation = tab.conversation;
		if (!conversation) return;
		const holders = this.tabs.filter(
			(other) =>
				other !== tab &&
				(other.link.session?.sessionId === source ||
					other.conversation?.sessionId === source ||
					(other.conversation !== null && sessionTotal(other.conversation.messages, source) !== null))
		);
		let total: number | null = null;
		let began = false;
		for (const holder of holders) {
			const held = holder.conversation ? sessionTotal(holder.conversation.messages, source) : null;
			if (held === null || (total !== null && held <= total)) continue;
			// The holder whose total is taken vouches for it.
			total = held;
			began = !!holder.conversation && this.plugin.provenance.began(holder.conversation.id, source);
		}
		const base = decideForkBase({
			total,
			turnRunning: holders.some((holder) => holder.chat.turnRunning),
			began,
			otherTabRan: holders.length > 1,
			tasksRunning: holders.some((holder) => holder.chat.tasks.length > 0),
		});
		if (base) conversation.forkBase = base;
		else delete conversation.forkBase;
		this.plugin.history.queueSave(conversation);
	}

	/** "Branch from here" (PRD-002.R15), when the tab has a session to fork. */
	private branchFrom(tab: PanelTab, userMessageUuid: string): void {
		const spec = tab.restore.branch(userMessageUuid, tab.conversation);
		if (!spec) return;
		// A stored id that is no UUID would fail every send in the new tab (PRD-002.R15).
		if (!isSessionId(spec.uuid)) {
			new Notice(INVALID_TARGET_TEXT);
			return;
		}
		this.openBranch(spec);
	}

	/**
	 * The branch tab. The fork is a copy of the CLI session (`--resume` +
	 * `--fork-session`), trimmed back to the chosen turn by a
	 * `rewind_conversation` issued before the branch's first message - so the
	 * source conversation keeps its own history untouched.
	 */
	private openBranch(spec: BranchSpec): void {
		const branch = this.addTab();
		branch.chat.setModel(spec.model);
		branch.chat.setEffort(spec.effort);
		// Its own CLI reports once it starts; until then shownMode() says what
		// that launch will get.
		branch.chat.setMode({ selectedMode: spec.selectedMode, inheritMode: spec.inheritMode });
		branch.chat.setProfile(spec.profileId);
		const conversation = branch.recorder.ensureConversation();
		conversation.title = spec.title;
		// The verified source joins the branch's own entry, so a reopened pending branch is checked there (ADR-018 Decision 1).
		this.plugin.provenance.record(conversation.id, spec.profileId, spec.sessionId);
		this.events.trigger("tabs");
		// Through the link, so a send while the CLI resolves shares this creation,
		// and a tab closed meanwhile has the session disposed. The rewind waits
		// on the link until a session takes it.
		// The source reopened since records into a conversation object of its own.
		branch.link.branchFrom(spec.sessionId, spec.uuid, () => this.recordedLatest(spec.sessionId) ?? spec.latest());
		void branch.link.ensure();
		branch.chat.addNote(spec.note);
		this.focusInput();
	}

	// -----------------------------------------------------------------------
	// Markdown, starters, the rail; model, effort, mode and profile picks
	// -----------------------------------------------------------------------

	/**
	 * Model Markdown into `el` through the one Markdown path (`ui/markdown`,
	 * DES-001 Rendering boundary), owned by `owner` (the tab's render
	 * component unless the caller passes its own); a render stops once its
	 * tab closes or a reopen replaces the tab's render component.
	 */
	private renderMarkdown(tab: PanelTab, markdown: string, el: HTMLElement, owner: Component = tab.renderer): Promise<void> {
		const renderer = tab.renderer;
		return renderMarkdown(this.app, markdown, el, owner, () => this.tabs.includes(tab) && tab.renderer === renderer);
	}

	/** A path a tool call reported, relative to the vault; null outside it or when the vault has no local path. */
	private vaultRelative(reported: string): string | null {
		return placeInVault(reported, () => this.plugin.getVaultPath());
	}

	/** What the empty conversation's starters offer (PRD-001.R35): the open note, and whether its editor has a selection. */
	private starterContext(): { note: { name: string; path: string } | null; selection: boolean } {
		const file = this.context.targets().file;
		const editor = this.context.lastEditorView?.file === file ? this.context.lastEditorView?.editor : undefined;
		return {
			note: file ? { name: file.basename, path: file.path } : null,
			selection: !!file && editor?.somethingSelected() === true,
		};
	}

	/** The jump rail while Card and "Prompt jump rail" are on (PRD-001.R33), on a settings change at once. */
	private mountRail(): void {
		const settings = this.plugin.settings;
		const shown = promptLayout(settings.promptStyle).rail && settings.promptRail;
		if (shown === (this.rail !== null)) return;
		if (this.rail) {
			this.removeChild(this.rail);
			this.rail = null;
			return;
		}
		this.rail = this.addChild(
			new JumpRail(
				this.shell.messagesHostEl,
				{
					viewEvents: this.events,
					activeTab: () => this.active?.chat ?? null,
					activeMessages: () => this.active?.messages ?? null,
					resizePass: this.shell,
				},
				{ onJump: (number) => this.active?.messages.scrollToPrompt(number) }
			)
		);
		this.rail.setCurrent(this.active?.messages.pinned ?? null);
	}

	/** DES-004's display rule for a tab (`shownMode`), with its profile's startup mode. */
	private shownMode(tab: PanelTab): ShownMode {
		const settings = this.plugin.settings;
		const profile = profileById(settings, tab.chat.status.profileId) ?? defaultProfile(settings);
		return shownMode(tab.chat.status, settings.cliStartupModes?.[profile.id]);
	}

	private chooseModel(tab: PanelTab, value: string): void {
		const previous = tab.chat.status.model;
		if (value === previous) return;
		const generation = ++tab.modelGeneration;
		tab.chat.setModel(value);
		// The segment shows the pick until the CLI reports a model again.
		tab.chat.setReportedModel("");
		this.plugin.settings.lastModel = value;
		void this.plugin.saveSettings();
		const applied = tab.link.applyModel(value);
		tab.chat.refreshClears();
		void applied.finally(() => tab.chat.refreshClears());
		void applied.then((ok) => {
			// A closed tab has nothing to put back; a later pick owns the selection.
			if (ok || !this.tabs.includes(tab) || generation !== tab.modelGeneration) return;
			// The CLI rejected the model (e.g. this account lacks it). Put the
			// model the session kept back, or the broken pick would stick and fail
			// again on the next spawn. The conversation never took it
			// (applyModel); another tab's pick since is not undone.
			const session = tab.link.session;
			const kept = session ? session.model ?? "" : previous;
			tab.chat.setModel(kept);
			if (this.plugin.settings.lastModel === value) {
				this.plugin.settings.lastModel = kept;
				void this.plugin.saveSettings();
			}
		});
	}

	/** An effort pick (PRD-001.R23): the tab's and the next new tab's, applied after the turn. */
	private pickEffort(tab: PanelTab, value: string): void {
		// The level reaches --effort: the offered list is screened, and so is the pick (PRD-003.R4).
		if (value !== "" && !isSafeArgValue(value)) return;
		if (value === tab.chat.status.effort) return;
		tab.chat.setEffort(value);
		this.plugin.settings.lastEffort = value;
		void this.plugin.saveSettings();
		tab.link.applyEffort(value);
	}

	/** A mode pick (PRD-002.R8); picking the inherited mode still pins it as a pick. */
	private pickMode(tab: PanelTab, mode: MenuMode): void {
		if (mode === this.shownMode(tab).value && !tab.chat.status.inheritMode) return;
		// A pick pending blocks an Undo (PRD-001.R38): the button shows it until the CLI answers.
		const pick = tab.link.pickMode(mode);
		tab.chat.refreshClears();
		void pick.finally(() => tab.chat.refreshClears());
	}

	/** A profile pick, by DES-002's rules (PRD-001.R3). */
	private pickProfile(tab: PanelTab, profileId: string): void {
		const settings = this.plugin.settings;
		const currentProfile = profileById(settings, tab.chat.status.profileId) ?? defaultProfile(settings);
		const profile = profileById(settings, profileId);
		if (!profile || profile.id === currentProfile.id) return;
		const storedSession = !!(tab.link.resumeSessionId || tab.conversation?.sessionId);
		const action = profilePick({
			session: tab.link.session,
			resumeSessionId: tab.link.resumeSessionId,
			storedSessionId: tab.conversation?.sessionId,
			storedProfileKnown: !!profileById(settings, tab.conversation?.profileId),
		});
		// The session's transcript lives on its own CLI, which another
		// profile could not resume: the tab stays on it (PRD-001.R3).
		if (action === "keep") {
			new Notice(keptProfileNotice(currentProfile));
			return;
		}
		// A session only a panel command started (/status, /mcp)
		// has no transcript to keep: start over on the new profile.
		if (action === "restart") {
			tab.link.drop();
			tab.chat.setMode({ cliMode: null });
		}
		tab.chat.setProfile(profile.id);
		// A stored session's profile is recorded when its CLI reports the session.
		if (tab.conversation && !storedSession) tab.conversation.profileId = profile.id;
		tab.restore.update();
	}
}
