import { hasTitle, promptTitle } from "../conversation-list";
import type { StoredConversation, StoredMessage } from "../history";

/** A tab as recording reads and writes it: its conversation, created at the first record. */
export interface RecordedTab {
	conversation: StoredConversation | null;
}

/** What a new conversation takes from its tab: profile, picks and mode (DES-005 Recording). */
export type NewConversationFields = Pick<
	StoredConversation,
	"profileId" | "model" | "effort" | "permissionMode" | "permissionModePicked"
>;

export interface RecorderHost {
	/** Saves 1 s after the last change (DES-005 Save path). */
	queueSave: (conversation: StoredConversation) => void;
	fields: () => NewConversationFields;
	/** The first message gave the tab a conversation worth reopening. */
	onFirstMessage: () => void;
	/** Written before a new conversation's first record, if any: a branch still to make (PRD-002.R15). */
	leadRecord?: () => StoredMessage | null;
	/** A prompt changed the title and the prompt count (PRD-001.R7). */
	onPrompt: () => void;
}

/** A new conversation's id and file name: `<time in base 36>-<6 random base-36 characters>` (DES-005). */
function newConversationId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * History recording for one tab (DES-005 Recording): the conversation
 * created on first use, each message appended and saved, the first prompt
 * to Claude titling it.
 */
export class Recorder {
	constructor(
		private readonly tab: RecordedTab,
		private readonly host: RecorderHost
	) {}

	/** The tab's conversation, created in memory if it has none: at the first record, a pin or a branch. */
	ensureConversation(): StoredConversation {
		if (!this.tab.conversation) {
			const now = Date.now();
			this.tab.conversation = {
				version: 1,
				id: newConversationId(),
				sessionId: null,
				title: "",
				createdAt: now,
				updatedAt: now,
				...this.host.fields(),
				// Present, so a reopen never reads the pick as a 0.5.x resolved id.
				resolvedModel: "",
				messages: [],
			};
		}
		return this.tab.conversation;
	}

	/**
	 * The prompt that goes to Claude, with its send time. The first one titles
	 * the conversation (PRD-001.R7); a panel command or a `!` run is recorded
	 * with `record` and never does.
	 */
	recordPrompt(message: Extract<StoredMessage, { kind: "user" }>): void {
		const conversation = this.ensureConversation();
		if (!hasTitle(conversation.title)) conversation.title = promptTitle(message.text);
		this.record(message);
		this.host.onPrompt();
	}

	/**
	 * A recorded message changed in place (a tool call's result, an edit's
	 * `+x -y`): saved again while the tab's conversation still holds it.
	 */
	changed(message: StoredMessage): void {
		const conversation = this.tab.conversation;
		if (conversation?.messages.includes(message)) this.host.queueSave(conversation);
	}

	record(message: StoredMessage): void {
		const conversation = this.ensureConversation();
		// A pin or a branch may have created it earlier; it starts with its first message (PRD-003.R12).
		const first = conversation.messages.length === 0;
		if (first) {
			conversation.createdAt = Date.now();
			conversation.updatedAt = conversation.createdAt;
			const lead = this.host.leadRecord?.();
			if (lead) conversation.messages.push(lead);
		}
		conversation.messages.push(message);
		this.host.queueSave(conversation);
		// The first recorded message is the moment the tab gains a conversation id worth restoring after a reload.
		if (first) this.host.onFirstMessage();
	}
}
