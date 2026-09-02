import test from "node:test";
import assert from "node:assert/strict";

const { runShellCommand, shellInvocation, formatShellResultForChat } = await import(
	"./.build/bash.mjs"
);

// ---- invocation shape (no process spawned) --------------------------------

test("POSIX commands go to /bin/sh -c as a single argument", () => {
	const inv = shellInvocation("echo 'a b' && ls", {
		cwd: "/vault",
		platform: "linux",
	});
	assert.equal(inv.command, "/bin/sh");
	assert.deepEqual(inv.args, ["-c", "echo 'a b' && ls"]);
	assert.equal(inv.cwd, "/vault");
});

test("Windows commands go to the comspec", () => {
	const inv = shellInvocation("dir", {
		cwd: "C:/vault",
		platform: "win32",
		env: { ComSpec: "C:/Windows/System32/cmd.exe" },
	});
	assert.equal(inv.command, "C:/Windows/System32/cmd.exe");
	assert.deepEqual(inv.args, ["/d", "/s", "/c", "dir"]);
});

test("WSL mode wraps the command the same way the CLI is launched", () => {
	const inv = shellInvocation("ls", {
		cwd: "C:/vault",
		platform: "win32",
		useWsl: true,
	});
	assert.equal(inv.command, "wsl.exe");
	assert.deepEqual(inv.args, ["--cd", "C:/vault", "--", "sh", "-lc", "ls"]);
	// wsl.exe translates --cd itself, so no host cwd is set.
	assert.equal(inv.cwd, undefined);
});

test("useWsl is ignored off Windows", () => {
	const inv = shellInvocation("ls", { cwd: "/vault", platform: "linux", useWsl: true });
	assert.equal(inv.command, "/bin/sh");
});

test("the command is never concatenated into the argv", () => {
	// A command carrying shell metacharacters must arrive as one argument, so
	// the user's own quoting is what the shell sees and nothing is re-parsed.
	const nasty = `echo "; rm -rf /" '$(whoami)'`;
	const inv = shellInvocation(nasty, { cwd: "/vault", platform: "linux" });
	assert.equal(inv.args.length, 2);
	assert.equal(inv.args[1], nasty);
});

// ---- real execution -------------------------------------------------------

const posix = process.platform !== "win32";

test("stdout is captured", { skip: !posix }, async () => {
	const result = await runShellCommand("echo hello", { cwd: process.cwd() });
	assert.equal(result.code, 0);
	assert.equal(result.stdout.trim(), "hello");
	assert.equal(result.stderr, "");
	assert.equal(result.timedOut, false);
	assert.equal(result.error, undefined);
	assert.ok(result.durationMs >= 0);
});

test("stderr and a non-zero exit are both reported", { skip: !posix }, async () => {
	const result = await runShellCommand("echo oops >&2; exit 3", { cwd: process.cwd() });
	assert.equal(result.code, 3);
	assert.equal(result.stderr.trim(), "oops");
	assert.equal(result.stdout, "");
});

test("the working directory is honoured", { skip: !posix }, async () => {
	const result = await runShellCommand("pwd", { cwd: "/tmp" });
	assert.match(result.stdout.trim(), /^\/tmp/);
});

test("shell syntax works, since a shell is what runs it", { skip: !posix }, async () => {
	const result = await runShellCommand("for i in 1 2 3; do echo $i; done", {
		cwd: process.cwd(),
	});
	assert.deepEqual(result.stdout.trim().split("\n"), ["1", "2", "3"]);
});

test("a hanging command is killed at the timeout", { skip: !posix }, async () => {
	const result = await runShellCommand("sleep 30", {
		cwd: process.cwd(),
		timeoutMs: 250,
	});
	assert.equal(result.timedOut, true);
	assert.notEqual(result.code, 0);
});

test("runaway output is truncated and flagged", { skip: !posix }, async () => {
	const result = await runShellCommand("yes abcdefgh | head -c 200000", {
		cwd: process.cwd(),
		maxChars: 500,
	});
	assert.equal(result.truncated, true);
	assert.ok(result.stdout.length < 1000, "output should be capped");
	assert.match(result.stdout, /truncated at 500 characters/);
});

test("a command that cannot be spawned reports an error rather than throwing", async () => {
	const result = await runShellCommand("whatever", {
		cwd: "/definitely/not/a/directory/anywhere",
	});
	assert.ok(result.error, "spawn failure should surface as error");
	assert.equal(result.code, null);
});

// ---- handing output to the model -----------------------------------------

test("the chat block quotes the command and fences the output", () => {
	const text = formatShellResultForChat({
		command: "git status",
		stdout: "nothing to commit\n",
		stderr: "",
		code: 0,
		timedOut: false,
		durationMs: 12,
		truncated: false,
	});
	assert.match(text, /I ran `git status` in the vault:/);
	assert.match(text, /```\nnothing to commit\n```/);
	assert.equal(/Exit code/.test(text), false);
});

test("stderr, exit codes and timeouts are spelled out", () => {
	const withStderr = formatShellResultForChat({
		command: "x",
		stdout: "out",
		stderr: "bad",
		code: 2,
		timedOut: false,
		durationMs: 1,
		truncated: false,
	});
	assert.match(withStderr, /--- stderr ---/);
	assert.match(withStderr, /Exit code: 2/);

	const timedOut = formatShellResultForChat({
		command: "x",
		stdout: "",
		stderr: "",
		code: null,
		timedOut: true,
		durationMs: 1,
		truncated: false,
	});
	assert.match(timedOut, /\(no output\)/);
	assert.match(timedOut, /timed out/);
	assert.equal(/Exit code/.test(timedOut), false);
});
