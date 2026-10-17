import test from "node:test";
import assert from "node:assert/strict";

const { pickLookupResult } = await import("./.build/cli.mjs");

test("pickLookupResult takes the first line on posix", () => {
	assert.equal(
		pickLookupResult("/usr/local/bin/claude\n", "linux"),
		"/usr/local/bin/claude"
	);
});

test("pickLookupResult skips npm's sh shim and prefers the .exe on Windows", () => {
	// `where claude` order for an npm install plus the native installer: the
	// extensionless POSIX script comes first and must never win.
	const out = [
		"C:\\Users\\u\\AppData\\Roaming\\npm\\claude",
		"C:\\Users\\u\\AppData\\Roaming\\npm\\claude.cmd",
		"C:\\Users\\u\\.local\\bin\\claude.exe",
	].join("\r\n");
	assert.equal(pickLookupResult(out, "win32"), "C:\\Users\\u\\.local\\bin\\claude.exe");
});

test("pickLookupResult falls back to the .cmd shim on Windows", () => {
	const out = "C:\\npm\\claude\r\nC:\\npm\\claude.cmd\r\n";
	assert.equal(pickLookupResult(out, "win32"), "C:\\npm\\claude.cmd");
});

test("pickLookupResult returns null when Windows has no runnable match", () => {
	assert.equal(pickLookupResult("C:\\npm\\claude\r\n", "win32"), null);
	assert.equal(pickLookupResult("", "win32"), null);
});

const { configuredPathMissing } = await import("./.build/cli.mjs");

test("PRD-001.R39: a configured native path that does not exist is missing, one that does is not", () => {
	assert.equal(configuredPathMissing("/definitely/not/here/claude", "/vault", "linux", () => false), true);
	assert.equal(configuredPathMissing("/here/claude", "/vault", "linux", (p) => p === "/here/claude"), false);
	assert.equal(configuredPathMissing("C:\\tools\\claude.exe", "C:\\vault", "win32", () => false), true);
});

test("PRD-001.R39: a relative path is looked up from the launch's working directory, the vault", () => {
	const asked = [];
	const exists = (p) => (asked.push(p), p === "/vault/bin/claude");
	assert.equal(configuredPathMissing("bin/claude", "/vault", "linux", exists), false);
	assert.equal(configuredPathMissing("./other/claude", "/vault", "linux", exists), true);
	assert.deepEqual(asked, ["/vault/bin/claude", "/vault/./other/claude"]);
});

test("PRD-001.R39: a relative POSIX path keeps its `..` for the file system, which follows a symlink before it", () => {
	const asked = [];
	assert.equal(configuredPathMissing("link/../claude", "/vault", "linux", (p) => (asked.push(p), p === "/vault/link/../claude")), false);
	assert.deepEqual(asked, ["/vault/link/../claude"]);
});

test("PRD-001.R39: on Windows a path is found with .com or .exe appended, as the spawn looks", () => {
	const asked = [];
	const exists = (p) => (asked.push(p), p === "C:\\tools\\claude.exe");
	assert.equal(configuredPathMissing("C:\\tools\\claude", "C:\\vault", "win32", exists), false);
	assert.deepEqual(asked, ["C:\\tools\\claude", "C:\\tools\\claude.com", "C:\\tools\\claude.exe"]);
	assert.equal(configuredPathMissing("tools\\claude", "C:\\vault", "win32", (p) => p === "C:\\vault\\tools\\claude.exe"), false);
	// A backslash is a separator only on Windows.
	let posix = 0;
	assert.equal(configuredPathMissing("tools\\claude", "/vault", "linux", () => (posix++, false)), false);
	assert.equal(posix, 0);
});

test("PRD-001.R39: an empty path, and a bare command name that PATH resolves, are never checked", () => {
	let asked = 0;
	const exists = () => (asked++, false);
	assert.equal(configuredPathMissing("", "/vault", "linux", exists), false);
	assert.equal(configuredPathMissing("claude", "/vault", "linux", exists), false);
	assert.equal(configuredPathMissing("claude.exe", "C:\\vault", "win32", exists), false);
	assert.equal(asked, 0);
});
