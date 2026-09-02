import { spawn } from "node:child_process";

/**
 * The composer's "!" mode: run a shell command the user typed themselves.
 *
 * This deliberately does not go through Claude Code's tool permissions - the
 * user is the one issuing the command, the way they would in a terminal, and
 * nothing about it is model-driven. The model never sees the command or its
 * output unless the user chooses to add it to the chat.
 *
 * No Obsidian imports, so this is exercised in plain Node (tests/bash.test.mjs).
 */

export interface ShellOptions {
	/** Working directory - the vault root. */
	cwd: string;
	/** Windows only: run inside WSL, matching how the CLI is launched. */
	useWsl?: boolean;
	/** Kill the command after this long. Default 60s. */
	timeoutMs?: number;
	/** Truncate each stream at this many characters. Default 100k. */
	maxChars?: number;
	platform?: NodeJS.Platform;
	env?: Record<string, string>;
}

export interface ShellResult {
	command: string;
	stdout: string;
	stderr: string;
	/** Exit code, or null when the process was killed or never started. */
	code: number | null;
	timedOut: boolean;
	/** Set when the process could not be spawned at all. */
	error?: string;
	durationMs: number;
	/** True when either stream hit `maxChars`. */
	truncated: boolean;
}

export interface Invocation {
	command: string;
	args: string[];
	cwd?: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_CHARS = 100_000;

/**
 * How a command line is handed to a shell. Kept separate from running it so the
 * argv can be asserted without spawning anything.
 *
 * The command reaches the shell as a single argument, never concatenated into a
 * larger command line, so the user's own quoting is what the shell sees.
 */
export function shellInvocation(command: string, options: ShellOptions): Invocation {
	const platform = options.platform ?? process.platform;
	if (options.useWsl && platform === "win32")
		return {
			command: "wsl.exe",
			// wsl.exe translates the Windows --cd path into the distro's mount.
			args: ["--cd", options.cwd, "--", "sh", "-lc", command],
		};
	if (platform === "win32")
		return {
			command: options.env?.ComSpec ?? process.env.ComSpec ?? "cmd.exe",
			args: ["/d", "/s", "/c", command],
			cwd: options.cwd,
		};
	return { command: "/bin/sh", args: ["-c", command], cwd: options.cwd };
}

function cap(text: string, maxChars: number): { text: string; truncated: boolean } {
	if (text.length <= maxChars) return { text, truncated: false };
	return {
		text: text.slice(0, maxChars) + `\n… truncated at ${maxChars} characters`,
		truncated: true,
	};
}

/** Run one command and collect its output. Never rejects. */
export function runShellCommand(
	command: string,
	options: ShellOptions
): Promise<ShellResult> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
	const invocation = shellInvocation(command, options);
	const startedAt = Date.now();

	return new Promise<ShellResult>((resolve) => {
		let settled = false;
		let stdout = "";
		let stderr = "";
		let timedOut = false;

		const finish = (code: number | null, error?: string) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			const out = cap(stdout, maxChars);
			const err = cap(stderr, maxChars);
			resolve({
				command,
				stdout: out.text,
				stderr: err.text,
				code,
				timedOut,
				error,
				durationMs: Date.now() - startedAt,
				truncated: out.truncated || err.truncated,
			});
		};

		let proc;
		try {
			proc = spawn(invocation.command, invocation.args, {
				cwd: invocation.cwd,
				env: { ...process.env, ...options.env },
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
				shell: false,
			});
		} catch (err) {
			finish(null, err instanceof Error ? err.message : String(err));
			return;
		}

		const timer = setTimeout(() => {
			timedOut = true;
			try {
				proc.kill("SIGKILL");
			} catch {
				// already gone
			}
		}, timeoutMs);

		proc.stdout.setEncoding("utf8");
		proc.stderr.setEncoding("utf8");
		// Stop accumulating well past the cap; a runaway command must not grow
		// the heap until the timeout fires.
		const room = maxChars * 2;
		proc.stdout.on("data", (chunk: string) => {
			if (stdout.length < room) stdout += chunk;
		});
		proc.stderr.on("data", (chunk: string) => {
			if (stderr.length < room) stderr += chunk;
		});
		proc.on("error", (err) => finish(null, err.message));
		proc.on("close", (code) => finish(code));
	});
}

/** The command and its output, as a block to paste into the composer. */
export function formatShellResultForChat(result: ShellResult): string {
	const lines = [`I ran \`${result.command}\` in the vault:`, ""];
	const body: string[] = [];
	if (result.stdout.trim()) body.push(result.stdout.trimEnd());
	if (result.stderr.trim())
		body.push((result.stdout.trim() ? "\n--- stderr ---\n" : "") + result.stderr.trimEnd());
	if (body.length === 0) body.push("(no output)");
	lines.push("```", body.join("\n"), "```");
	if (result.timedOut) lines.push("", "The command timed out and was killed.");
	else if (result.error) lines.push("", `The command could not run: ${result.error}`);
	else if (result.code !== 0) lines.push("", `Exit code: ${result.code}`);
	return lines.join("\n");
}
