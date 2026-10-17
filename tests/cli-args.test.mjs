import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs, profileLaunchArgs, relaunchOptions, sandboxAvailable } from "./.build/cli-args.mjs";
import { DEFAULT_SETTINGS, settingsLaunchOptions } from "./.build/settings-core.mjs";

const profile = (fields = {}) => ({ chrome: "", sandbox: "", extraArgs: "", ...fields });
const posix = { cliPath: "/usr/local/bin/claude", useWsl: false };

test("parseCliArgs splits on whitespace and groups quotes", () => {
	assert.deepEqual(parseCliArgs(""), []);
	assert.deepEqual(parseCliArgs("  --debug   --add-dir /a  "), ["--debug", "--add-dir", "/a"]);
	assert.deepEqual(parseCliArgs(`--add-dir "/My Notes" '/b c'`), ["--add-dir", "/My Notes", "/b c"]);
	assert.deepEqual(parseCliArgs(`--settings '{"a":"b c"}'`), ["--settings", '{"a":"b c"}']);
	assert.deepEqual(parseCliArgs(`"say \\"hi\\""`), ['say "hi"']);
	assert.deepEqual(parseCliArgs(`--x ""`), ["--x", ""]);
	assert.deepEqual(parseCliArgs(`pre"mid dle"post`), ["premid dlepost"]);
});

test("parseCliArgs keeps backslashes, so Windows paths need no doubling", () => {
	assert.deepEqual(parseCliArgs(`--add-dir C:\\Users\\me "D:\\My Notes"`), [
		"--add-dir",
		"C:\\Users\\me",
		"D:\\My Notes",
	]);
});

test("parseCliArgs rejects an unterminated quote", () => {
	assert.throws(() => parseCliArgs(`--x "open`), /Unterminated " quote/);
	assert.throws(() => parseCliArgs(`--x 'open`), /Unterminated ' quote/);
});

test("default toggles add no flags; on and off force them", () => {
	assert.deepEqual(profileLaunchArgs(profile(), posix), { args: [], error: null });
	assert.deepEqual(profileLaunchArgs(profile({ chrome: "on" }), posix).args, ["--chrome"]);
	assert.deepEqual(profileLaunchArgs(profile({ chrome: "off" }), posix).args, ["--no-chrome"]);
	assert.deepEqual(profileLaunchArgs(profile({ sandbox: "on" }), posix).args, [
		"--settings",
		'{"sandbox":{"enabled":true}}',
	]);
	assert.deepEqual(profileLaunchArgs(profile({ sandbox: "off" }), posix).args, [
		"--settings",
		'{"sandbox":{"enabled":false}}',
	]);
});

test("additional arguments follow the profile's own flags", () => {
	const { args, error } = profileLaunchArgs(
		profile({ chrome: "on", extraArgs: `--add-dir "/My Notes" --debug` }),
		posix
	);
	assert.equal(error, null);
	assert.deepEqual(args, ["--chrome", "--add-dir", "/My Notes", "--debug"]);
});

test("the sandbox is skipped on native Windows, where Claude Code has none", () => {
	assert.equal(sandboxAvailable(false, "win32"), false);
	assert.equal(sandboxAvailable(true, "win32"), true);
	assert.equal(sandboxAvailable(false, "darwin"), true);
	const native = { cliPath: "C:\\claude.exe", useWsl: false };
	assert.deepEqual(profileLaunchArgs(profile({ sandbox: "on" }), native, "win32").args, []);
	const wsl = { cliPath: "claude", useWsl: true };
	assert.deepEqual(profileLaunchArgs(profile({ sandbox: "on" }), wsl, "win32").args, [
		"--settings",
		'{"sandbox":{"enabled":true}}',
	]);
});

test("flags the panel sets itself are refused, in either spelling", () => {
	for (const extraArgs of [
		"--model opus",
		"--model=opus",
		"-p",
		"--resume abc",
		"--output-format text",
		"--permission-mode plan",
		"--dangerously-skip-permissions",
		"--no-session-persistence",
		"-rabc-123",
		"-pd",
	]) {
		const result = profileLaunchArgs(profile({ extraArgs }), posix);
		assert.deepEqual(result.args, [], extraArgs);
		assert.match(result.error, /set by the panel/, extraArgs);
	}
});

test("only option names are checked, not values written with =", () => {
	const result = profileLaunchArgs(profile({ extraArgs: "--append-system-prompt=-c --debug" }), posix);
	assert.deepEqual(result, { args: ["--append-system-prompt=-c", "--debug"], error: null });
});

test("Chrome flags point at the profile setting instead", () => {
	const { error } = profileLaunchArgs(profile({ extraArgs: "--chrome" }), posix);
	assert.match(error, /Claude in Chrome/);
});

test("--settings is free unless the sandbox setting already passes one", () => {
	const extraArgs = `--settings '{"model":"x"}'`;
	assert.equal(profileLaunchArgs(profile({ extraArgs }), posix).error, null);
	assert.match(
		profileLaunchArgs(profile({ extraArgs, sandbox: "on" }), posix).error,
		/Sandbox/
	);
	// Native Windows ignores the sandbox setting, so it claims no --settings either.
	const native = { cliPath: "C:\\claude.exe", useWsl: false };
	assert.equal(profileLaunchArgs(profile({ extraArgs, sandbox: "on" }), native, "win32").error, null);
});

test("a .cmd shim refuses what cmd.exe would interpret", () => {
	const shim = { cliPath: "C:\\npm\\claude.cmd", useWsl: false };
	const ok = profileLaunchArgs(profile({ extraArgs: `--add-dir "C:\\My Notes"` }), shim, "win32");
	assert.deepEqual(ok, { args: ["--add-dir", "C:\\My Notes"], error: null });
	for (const extraArgs of [`--settings '{"a":1}'`, "--x a&b", "--x %PATH%", "--x a|b"]) {
		const result = profileLaunchArgs(profile({ extraArgs }), shim, "win32");
		assert.match(result.error ?? "", /cmd\.exe would interpret it/, extraArgs);
	}
});

test("a parse error is reported, not thrown", () => {
	const result = profileLaunchArgs(profile({ extraArgs: `--x "open` }), posix);
	assert.deepEqual(result.args, []);
	assert.match(result.error, /Unterminated/);
});

const launchSettings = { vaultInstructions: "Use wiki-links.", enableObsidianMcp: true, enableBypassMode: true };

test("PRD-001.R25: a settings-close restart carries each option a new conversation launches with", () => {
	const options = relaunchOptions(launchSettings, profile({ chrome: "on", extraArgs: "--debug" }), posix, posix, "linux");
	assert.deepEqual(options, {
		appendSystemPrompt: "Use wiki-links.",
		sdkMcpServers: ["obsidian"],
		allowBypassPermissions: true,
		extraArgs: ["--chrome", "--debug"],
	});
	const fresh = { ...settingsLaunchOptions(launchSettings), extraArgs: profileLaunchArgs(profile({ chrome: "on", extraArgs: "--debug" }), posix, "linux").args };
	assert.deepEqual(options, fresh);
	// Each option follows its own setting.
	const withSetting = (change) => relaunchOptions({ ...launchSettings, ...change }, profile(), posix, posix, "linux");
	assert.equal(withSetting({ vaultInstructions: "" }).appendSystemPrompt, undefined);
	assert.equal(withSetting({ vaultInstructions: "Be brief." }).appendSystemPrompt, "Be brief.");
	assert.equal(withSetting({ enableObsidianMcp: false }).sdkMcpServers, undefined);
	assert.equal(withSetting({ enableBypassMode: false }).allowBypassPermissions, false);
	assert.deepEqual(relaunchOptions(DEFAULT_SETTINGS, profile(), posix, posix, "linux").extraArgs, []);
});

test("PRD-001.R4: a restart is skipped when the CLI no longer resolves or has moved", () => {
	const restart = (cli, target, platform = "linux") =>
		relaunchOptions(launchSettings, profile(), cli, target, platform);
	assert.equal(restart(null, posix), null);
	assert.equal(restart({ ...posix, cliPath: "/opt/claude" }, posix), null);
	const wsl = { cliPath: "claude", useWsl: true };
	const native = { cliPath: "claude", useWsl: false };
	assert.equal(restart(wsl, native, "win32"), null);
	assert.equal(restart(native, wsl, "win32"), null);
	assert.ok(restart(wsl, wsl, "win32"));
	// Off Windows the WSL flag is ignored, so it cannot have moved the CLI.
	assert.ok(restart(wsl, native, "linux"));
});

test("PRD-001.R4: a restart is skipped when the profile's arguments cannot launch, with no option applied", () => {
	const refused = (extraArgs) => relaunchOptions(launchSettings, profile({ extraArgs }), posix, posix, "linux");
	assert.equal(refused("--model opus"), null);
	assert.equal(refused("--chrome"), null);
	assert.equal(refused(`--x "open`), null);
});
