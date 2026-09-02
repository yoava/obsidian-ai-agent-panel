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
