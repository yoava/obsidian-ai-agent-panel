import { test } from "node:test";
import assert from "node:assert/strict";
import { CLEARED_LABEL, UNDO_FAILED, clearFromRecord, clearedLine, clearView } from "./.build/state/clear-divider.mjs";
import { formatClock } from "./.build/state/usage-segment.mjs";

const AT = 1_700_000_000_000;

test("PRD-001.R38: a cleared divider is an orange separator with the time and what Claude can no longer see", () => {
	const view = clearView({ at: AT }, formatClock);
	assert.equal(view.phase, "cleared");
	assert.equal(view.role, "separator");
	assert.equal(view.tone, "warning");
	assert.deepEqual(view.icon, ["eraser"]);
	assert.equal(view.spinning, false);
	assert.equal(view.label, CLEARED_LABEL);
	assert.equal(view.label, "Context cleared");
	assert.deepEqual(view.sub, [{ text: formatClock(AT) }, { text: "Claude can't see anything above", dot: true }]);
	// No Undo and no summary here: the divider offers neither.
	assert.equal(view.summary, false);
	assert.equal(view.summaryText, null);
});

test("PRD-001.R38: an Undo the tab cannot start yet is disabled with a title saying why", () => {
	const titles = {
		working: "A turn or background task is running",
		restoring: "A restore is running",
		starting: "Claude Code is starting",
		picking: "A mode or model change is pending",
	};
	for (const [state, title] of Object.entries(titles)) {
		assert.deepEqual(clearView({ at: AT }, formatClock, state).action, { label: "Undo", icon: ["undo-2"], disabled: true, title, busy: false }, state);
	}
});

test("PRD-001.R38: the divider offers Undo only where the clear does, disabled with the reason for a foreign session and while it runs", () => {
	assert.equal(clearView({ at: AT }, formatClock).action, null);
	assert.deepEqual(clearView({ at: AT }, formatClock, "ready").action, { label: "Undo", icon: ["undo-2"], disabled: false, title: null, busy: false });
	assert.deepEqual(clearView({ at: AT }, formatClock, "foreign").action, {
		label: "Undo",
		icon: ["undo-2"],
		disabled: true,
		title: "The cleared session is not available on this device",
		busy: false,
	});
	const pending = clearView({ at: AT }, formatClock, "pending").action;
	assert.equal(pending.disabled, true);
	assert.equal(pending.busy, true);
	// The divider's own name does not change with the button.
	assert.equal(clearView({ at: AT }, formatClock, "ready").aria, `Context cleared at ${formatClock(AT)}`);
	assert.equal(UNDO_FAILED, "Could not undo the clear.");
});

test("PRD-001.R28: the separator is named with the clear's time, else by its label alone", () => {
	assert.equal(clearView({ at: AT }, formatClock).aria, `Context cleared at ${formatClock(AT)}`);
	assert.equal(clearedLine(AT, formatClock), `Context cleared at ${formatClock(AT)}`);
	const bare = clearView({ at: null }, formatClock);
	assert.equal(bare.aria, "Context cleared");
	assert.deepEqual(bare.sub, [{ text: "Claude can't see anything above" }]);
	assert.equal(clearedLine(null, formatClock), "Context cleared");
});

test("PRD-003.R9: a stored clear draws with its time, or none when the record has none", () => {
	assert.deepEqual(clearFromRecord({ kind: "clear", at: AT, sessionId: "s" }), { at: AT });
	assert.deepEqual(clearFromRecord({ kind: "clear" }), { at: null });
});
