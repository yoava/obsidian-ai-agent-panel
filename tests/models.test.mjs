import { test } from "node:test";
import assert from "node:assert/strict";
import { describeModel, effortChoices, effortEntry, effortLabel, effortLevels, modelOptions, parseCliModels, resolvedId } from "./.build/models.mjs";

// Trimmed from a real CLI 2.1.237 initialize response.
const CLI_MODELS_RAW = [
	{
		value: "default",
		resolvedModel: "claude-opus-5[1m]",
		displayName: "Default (recommended)",
		description: "Opus 5 with 1M context · Best for everyday, complex tasks",
		supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
	},
	{
		value: "opus[1m]",
		resolvedModel: "claude-opus-5[1m]",
		displayName: "Opus (1M context)",
		supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
	},
	{
		value: "claude-fable-5[1m]",
		resolvedModel: "claude-fable-5",
		displayName: "Fable",
		supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
	},
	{ value: "sonnet", resolvedModel: "claude-sonnet-5", displayName: "Sonnet" },
	{ value: "haiku", resolvedModel: "claude-haiku-4-5-20251001", displayName: "Haiku" },
];

test("parseCliModels reads the initialize response's models array", () => {
	const models = parseCliModels(CLI_MODELS_RAW);
	assert.equal(models.length, 5);
	// "default" is normalized to the picker's empty value.
	assert.equal(models[0].value, "");
	assert.equal(models[0].resolvedModel, "claude-opus-5[1m]");
	assert.deepEqual(models[1].supportedEffortLevels, [
		"low",
		"medium",
		"high",
		"xhigh",
		"max",
	]);
	assert.equal(models[4].supportedEffortLevels, undefined);
});

test("parseCliModels rejects garbage and skips malformed entries", () => {
	assert.equal(parseCliModels(undefined), null);
	assert.equal(parseCliModels("nope"), null);
	assert.equal(parseCliModels([]), null);
	assert.equal(parseCliModels([{ noValue: true }, null]), null);
	const models = parseCliModels([{ value: "opus" }, { value: 7 }]);
	assert.equal(models.length, 1);
	// A field not sent is left out, so a stored list reads back as written; "" is the Default pick as "default" is.
	assert.deepEqual(parseCliModels([{ value: "opus" }, { value: "" }, { value: "default" }]), [
		{ value: "opus" },
		{ value: "" },
		{ value: "" },
	]);
});

test("a learned CLI list replaces the static picker entries outright", () => {
	const options = modelOptions(undefined, parseCliModels(CLI_MODELS_RAW));
	assert.deepEqual(
		options.map((o) => o.value),
		["", "opus[1m]", "claude-fable-5[1m]", "sonnet", "haiku"]
	);
	// No opusplan, no sonnet[1m] - this CLI + account does not accept them.
	assert.ok(!options.some((o) => o.value === "opusplan"));
});

test("learned entries label themselves from the resolved id", () => {
	const options = modelOptions(undefined, parseCliModels(CLI_MODELS_RAW));
	const byValue = Object.fromEntries(options.map((o) => [o.value, o]));
	assert.equal(byValue[""].label, "Default model (Opus 5 (1M context))");
	assert.equal(byValue[""].short, "Default");
	assert.equal(byValue["opus[1m]"].label, "Opus 5 (1M context)");
	assert.equal(byValue["opus[1m]"].short, "Opus 5 1M");
	assert.equal(byValue["claude-fable-5[1m]"].label, "Fable 5");
	assert.equal(byValue["haiku"].label, "Haiku 4.5");
	// The CLI's blurb rides along for tooltips.
	assert.match(byValue[""].description ?? "", /everyday/);
});

test("a CLI 2.1.282 list labels Opus 5.5 and Fable 5.1 by version", () => {
	// Trimmed from a real CLI 2.1.282 initialize response.
	const options = modelOptions(
		undefined,
		parseCliModels([
			{ value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)" },
			{ value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5" },
			{ value: "claude-fable-5-1", resolvedModel: "claude-fable-5-1", displayName: "Fable 5.1" },
			{ value: "opus[1m]", resolvedModel: "claude-opus-5-5[1m]", displayName: "Opus (1M context)" },
		])
	);
	const byValue = Object.fromEntries(options.map((o) => [o.value, o]));
	assert.equal(byValue[""].label, "Default model (Opus 5.5)");
	assert.equal(byValue["opus"].short, "Opus 5.5");
	assert.equal(byValue["claude-fable-5-1"].label, "Fable 5.1");
	assert.equal(byValue["opus[1m]"].label, "Opus 5.5 (1M context)");
	assert.equal(byValue["opus[1m]"].short, "Opus 5.5 1M");
});

test("without a learned list the static entries still apply", () => {
	const options = modelOptions();
	assert.ok(options.some((o) => o.value === "opus"));
	assert.ok(options.some((o) => o.value === ""));
});

test("describeModel prefers the learned list, then falls back", () => {
	const cliModels = parseCliModels(CLI_MODELS_RAW);
	assert.equal(describeModel("sonnet", undefined, cliModels).label, "Sonnet 5");
	// A value outside the list (a restored conversation's full id) still labels itself.
	assert.equal(
		describeModel("claude-opus-4-7", undefined, cliModels).label,
		"Opus 4.7"
	);
	// And the resolvedModels cache still applies when there is no list.
	assert.equal(
		describeModel("opus", { opus: "claude-opus-5" }, null).label,
		"Opus 5"
	);
});

test("PRD-003.R4: a pick named like an object member reads its own resolution or none, never an inherited function", () => {
	for (const value of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
		assert.equal(describeModel(value, {}, null).label, value, value);
		assert.equal(describeModel(value, undefined, null).label, value, value);
	}
	assert.equal(describeModel("constructor", { constructor: "claude-opus-5" }, null).label, "Opus 5");
	assert.equal(resolvedId({ constructor: "claude-opus-5" }, "constructor"), "claude-opus-5");
	assert.equal(resolvedId({}, "constructor"), undefined);
	assert.equal(resolvedId(undefined, "opus"), undefined);
});

test("effort levels come from the CLI's lists, in its order", () => {
	assert.deepEqual(effortLevels(null), ["low", "medium", "high", "xhigh", "max"]);
	// Levels only some models accept, and one this plugin has never seen, slot
	// in after their predecessor rather than at the end.
	const levels = effortLevels([
		{ value: "claude-sonnet-4-6", supportedEffortLevels: ["low", "medium", "high", "max"] },
		{ value: "haiku" },
		{ value: "opus", supportedEffortLevels: ["low", "medium", "high", "xhigh", "ultra", "max"] },
	]);
	assert.deepEqual(levels, ["low", "medium", "high", "xhigh", "ultra", "max"]);
	assert.equal(effortLabel("xhigh"), "Extra high");
	assert.equal(effortLabel("ultra"), "Ultra");
	assert.equal(effortLabel(""), "Default");
});

test("PRD-001.R23: the effort table gives each level its short and long string", () => {
	assert.deepEqual(effortEntry(""), { short: "Default", long: "Default effort" });
	assert.deepEqual(effortEntry("low"), { short: "Low", long: "Low effort" });
	assert.deepEqual(effortEntry("medium"), { short: "Medium", long: "Medium effort" });
	assert.deepEqual(effortEntry("high"), { short: "High", long: "High effort" });
	assert.deepEqual(effortEntry("xhigh"), { short: "Extra high", long: "Extra high effort" });
	assert.deepEqual(effortEntry("max"), { short: "Max", long: "Max effort" });
});

test("PRD-001.R23: a level the CLI reports beyond the table takes its name, and \"effort\" in the long string", () => {
	assert.deepEqual(effortEntry("ultra"), { short: "Ultra", long: "Ultra effort" });
});

test("PRD-001.R22: the popover offers the learned list with Default first, plus a configured or picked model missing from it", () => {
	const learned = parseCliModels([
		{ value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus", description: "Most capable" },
		{ value: "sonnet", resolvedModel: "claude-sonnet-5" },
	]);
	const options = modelOptions(undefined, learned, ["claude-fable-5-1", "sonnet", "", "claude-fable-5-1"]);
	assert.deepEqual(
		options.map((option) => [option.value, option.label, option.description]),
		[
			["", "Default model", undefined],
			["opus", "Opus 5.5", "Most capable"],
			["sonnet", "Sonnet 5", undefined],
			["claude-fable-5-1", "Fable 5.1", undefined],
		]
	);
});

test("PRD-001.R22: without a learned list the built-in entries carry no description", () => {
	const options = modelOptions(undefined, null, ["opus"]);
	assert.equal(options[0].value, "");
	assert.ok(options.every((option) => option.description === undefined));
	assert.equal(options.filter((option) => option.value === "opus").length, 1, "a listed extra is not added twice");
});

test("PRD-001.R23: the effort control offers Default and every reported level, disabling those the selected model lacks", () => {
	const learned = [
		{ value: "opus", supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"] },
		{ value: "sonnet", supportedEffortLevels: ["low", "medium", "high"] },
		{ value: "haiku" },
	];
	const row = (choices) => choices.map((choice) => `${choice.short}${choice.disabled ? " (off)" : ""}`);
	assert.deepEqual(row(effortChoices(learned, "sonnet")), [
		"Default", "Low", "Medium", "High", "Extra high (off)", "Max (off)",
	]);
	assert.deepEqual(row(effortChoices(learned, "haiku")), [
		"Default", "Low (off)", "Medium (off)", "High (off)", "Extra high (off)", "Max (off)",
	]);
	assert.deepEqual(effortChoices(learned, "opus").map((choice) => choice.value), ["", "low", "medium", "high", "xhigh", "max"]);
	// A model the CLI did not list, or no list at all: every level stays offered.
	assert.ok(effortChoices(learned, "claude-opus-4-7").every((choice) => !choice.disabled));
	assert.deepEqual(row(effortChoices(null, "")), ["Default", "Low", "Medium", "High", "Extra high", "Max"]);
});
