import { formatShellResultForChat, runShellCommand, type ShellResult } from "../bash";
import type { StoredMessage } from "../history";
import { defaultProfile, profileById, type AgentPanelSettings } from "../settings-core";
import type { ChatTab } from "./chat-tab";
import type { Recorder } from "./recorder";

/** The first characters of each stream a run's record keeps (DES-005). */
const RECORDED_CHARS = 1500;

/** What the `!` escape reaches outside the tab's state. */
export interface ShellEscapeHost {
	tab: ChatTab;
	recorder: Recorder;
	settings: () => AgentPanelSettings;
	vaultPath: () => string;
	/** The composer's text was taken. */
	takeText: (text: string) => void;
	/** "Add output to chat": appended to the composer, unsent. */
	appendToInput: (text: string) => void;
	/** A run starts (+1) or ends (-1): a reopen does not reuse a tab one runs in. */
	countRun: (delta: 1 | -1) => void;
	/** Scroll-follow after the card changed. */
	follow: () => void;
}

/**
 * One tab's `!` escape (DES-004 Shell escape, ADR-011): the user's own
 * composer text after `!`, run locally at once, turn or no turn, where the
 * conversation's CLI runs; its card running, then its result; recorded once
 * it ends. Nothing reaches the model unless the user adds the output.
 */
export class ShellEscape {
	constructor(private readonly host: ShellEscapeHost) {}

	/**
	 * Step 5 of the send path: with the escape on and a command after the `!`,
	 * the command runs and true is returned; false otherwise, and the text goes
	 * to Claude as a message.
	 */
	start(text: string): boolean {
		if (!text.startsWith("!") || !this.host.settings().enableBashMode) return false;
		const command = text.slice(1).trim();
		if (!command) return false;
		this.host.takeText(text);
		void this.run(command);
		return true;
	}

	/** "Add output to chat": the command, its fenced output and any timeout, error or exit-code note (PRD-002.R16). */
	addOutput(result: ShellResult): void {
		this.host.appendToInput(formatShellResultForChat(result));
	}

	private async run(command: string): Promise<void> {
		const host = this.host;
		host.countRun(1);
		try {
			host.tab.addPrompt({ type: "shell", text: `!${command}`, contextName: null, images: 0, sentAt: null });
			const item = host.tab.addShell(command);
			const result = await this.spawn(command);
			const card = host.tab.card(item.id, "shell");
			if (card) host.tab.updateItem({ ...card, result });
			host.follow();
			// Recorded once, when the outcome is known: the history holds finished messages.
			host.recorder.record(record(result));
		} finally {
			host.countRun(-1);
		}
	}

	/** The run where the conversation's CLI runs, so paths and tools behave as the conversation sees them. */
	private async spawn(command: string): Promise<ShellResult> {
		const settings = this.host.settings();
		const profile = profileById(settings, this.host.tab.status.profileId) ?? defaultProfile(settings);
		try {
			return await runShellCommand(command, { cwd: this.host.vaultPath(), useWsl: profile.useWsl });
		} catch (err) {
			return {
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
	}
}

/** A finished run as history keeps it: the first 1500 characters of each stream (DES-005). */
function record(result: ShellResult): StoredMessage {
	return {
		kind: "bash",
		command: result.command,
		stdout: result.stdout.slice(0, RECORDED_CHARS) || undefined,
		stderr: result.stderr.slice(0, RECORDED_CHARS) || undefined,
		code: result.code ?? undefined,
		timedOut: result.timedOut || undefined,
		durationMs: result.durationMs,
	};
}
