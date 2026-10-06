/**
 * The arguments a CLI profile adds to every launch: its Claude in Chrome and
 * sandbox choices, then the user's own additional arguments. Obsidian-free so
 * tests can exercise the parsing and validation directly.
 */

import { CMD_UNSAFE, isCmdShim } from "./protocol/client";
import type { CliProfile } from "./settings-core";

/**
 * Split typed arguments into argv. Whitespace separates; single or double
 * quotes group. Backslashes are literal - so Windows paths need no doubling -
 * except `\"` inside double quotes. Throws on an unterminated quote.
 */
export function parseCliArgs(raw: string): string[] {
	const args: string[] = [];
	let current = "";
	let started = false;
	let quote: string | null = null;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (quote !== null) {
			if (ch === quote) quote = null;
			else if (quote === '"' && ch === "\\" && raw[i + 1] === '"') current += raw[++i];
			else current += ch;
		} else if (ch === '"' || ch === "'") {
			quote = ch;
			started = true;
		} else if (/\s/.test(ch)) {
			if (started) args.push(current);
			current = "";
			started = false;
		} else {
			current += ch;
			started = true;
		}
	}
	if (quote !== null) throw new Error(`Unterminated ${quote} quote in additional arguments.`);
	if (started) args.push(current);
	return args;
}

/** Flags the panel passes itself; a second copy would break the protocol or the chat's controls. */
const PANEL_FLAGS = new Set([
	"-p",
	"--print",
	"--output-format",
	"--input-format",
	"--include-partial-messages",
	"--replay-user-messages",
	"--permission-prompt-tool",
	"-r",
	"--resume",
	"-c",
	"--continue",
	"--fork-session",
	"--session-id",
	"--model",
	"--effort",
	"--permission-mode",
	"--dangerously-skip-permissions",
	"--allow-dangerously-skip-permissions",
	// Every respawn (effort or profile change, crash) resumes the session.
	"--no-session-persistence",
]);

/** The option a token names: `--name` before any `=value`, or a short flag's letter (`-r<id>` → `-r`). */
function optionName(token: string): string | null {
	if (token.startsWith("--")) return token.split("=")[0];
	if (token.length > 1 && token.startsWith("-")) return token.slice(0, 2);
	return null;
}

/** Why `flag` cannot be an additional argument, or null when it can. */
function reservedReason(flag: string, passesSandbox: boolean): string | null {
	if (PANEL_FLAGS.has(flag)) return `${flag} is set by the panel itself.`;
	if (flag === "--chrome" || flag === "--no-chrome")
		return `Use the profile's "Claude in Chrome" setting instead of ${flag}.`;
	if (flag === "--settings" && passesSandbox)
		return (
			'The profile\'s "Sandbox" setting already passes --settings. Set it to ' +
			'"Claude Code default" or put sandbox.enabled in your own --settings.'
		);
	return null;
}

export interface LaunchArgs {
	args: string[];
	/** Why the profile cannot launch as configured; `args` is empty then. */
	error: string | null;
}

/**
 * The profile's arguments for one launch. `cliPath` and `useWsl` are where the
 * CLI actually resolved, since both change what can be passed: the sandbox
 * only exists outside native Windows, and a `.cmd` shim runs through cmd.exe.
 */
export function profileLaunchArgs(
	profile: Pick<CliProfile, "chrome" | "sandbox" | "extraArgs">,
	cli: { cliPath: string; useWsl: boolean },
	platform: NodeJS.Platform = process.platform
): LaunchArgs {
	let extra: string[];
	try {
		extra = parseCliArgs(profile.extraArgs);
	} catch (err) {
		return { args: [], error: err instanceof Error ? err.message : String(err) };
	}
	const sandbox = sandboxAvailable(cli.useWsl, platform) ? profile.sandbox : "";
	for (const arg of extra) {
		const name = optionName(arg);
		const reason = name && reservedReason(name, sandbox !== "");
		if (reason) return { args: [], error: reason };
	}
	if (isCmdShim(cli.cliPath, platform) && !cli.useWsl) {
		const unsafe = extra.find((arg) => CMD_UNSAFE.test(arg));
		if (unsafe !== undefined)
			return {
				args: [],
				error:
					`${unsafe} cannot be passed to ${cli.cliPath}: cmd.exe would interpret it. ` +
					"Install Claude Code's native build to use it.",
			};
	}

	const args: string[] = [];
	if (profile.chrome) args.push(profile.chrome === "on" ? "--chrome" : "--no-chrome");
	if (sandbox) args.push("--settings", JSON.stringify({ sandbox: { enabled: sandbox === "on" } }));
	args.push(...extra);
	return { args, error: null };
}

/** Claude Code sandboxes Bash on macOS, Linux and WSL2 - not on native Windows. */
export function sandboxAvailable(
	useWsl: boolean,
	platform: NodeJS.Platform = process.platform
): boolean {
	return platform !== "win32" || useWsl;
}
