/**
 * Read-side checks of a stored conversation file, Obsidian-free so plain Node
 * tests them. A history file is untrusted on read: a vault sync or a hand edit
 * can put any JSON value in any field.
 */

import { isJsonObject } from "./json";
import type { ForkBase } from "./state/fork-base";
import { isSessionId } from "./state/session-id";

/** The fields of a stored conversation that the exporter and the panel call string methods on. */
export interface StoredTextFields {
	title?: unknown;
	exportPath?: unknown;
}

/**
 * Read a stored conversation's text fields as absent when they are not
 * strings. A hand-edited or synced file can hold any JSON value there, and a
 * number or an object as `title` or `exportPath` throws in the exporter's file
 * name and path checks and in the branch title (DES-005). An absent `title`
 * is `""`, which `displayTitle` shows as "New conversation" and the next
 * prompt replaces; strings are kept for their own checks. Mutates `stored`.
 */
export function dropNonStringText<T extends StoredTextFields>(stored: T): T {
	const values: StoredTextFields = stored;
	if (typeof values.title !== "string") values.title = "";
	if ("exportPath" in values && typeof values.exportPath !== "string") delete values.exportPath;
	return stored;
}

/**
 * A stored fork base (PRD-005.R7, ADR-018) as the readers may take it: its
 * cost must be a finite number of at least 0 or the whole base reads as
 * absent (unknown is never zero), an `estimate` that is not a boolean reads
 * as true, a session id that fails the grammar (`isSessionId`, PRD-003.R4) is
 * dropped, other fields are not kept.
 */
export function checkForkBase(value: unknown): ForkBase | undefined {
	if (!isJsonObject(value)) return undefined;
	const { costUsd, sessionId, estimate } = value;
	if (typeof costUsd !== "number" || !Number.isFinite(costUsd) || costUsd < 0) return undefined;
	const base: ForkBase = { costUsd };
	if (isSessionId(sessionId)) base.sessionId = sessionId;
	if (estimate !== undefined && estimate !== false) base.estimate = true;
	return base;
}

/** Replace a stored conversation's `forkBase` with its checked form, or remove it when unusable. Mutates `stored`. */
export function readForkBase<T extends { forkBase?: unknown }>(stored: T): T {
	const base = checkForkBase(stored.forkBase);
	if (base) stored.forkBase = base;
	else delete stored.forkBase;
	return stored;
}

/**
 * How a message field is read: `undefined` from `readField` means the value is
 * not of that type. An `id` is a message id the CLI takes back in a control
 * request (ADR-018 Decision 1), so only a lowercase UUID reads as one.
 */
type FieldType = "string" | "number" | "count" | "time" | "boolean" | "strings" | "object" | "id";

interface MessageFields {
	/** Present on every message of the kind: a value of the wrong type reads as `""` or `{}`. */
	required: Record<string, "string" | "object">;
	/** Absent or of its type: a value of the wrong type reads as absent. */
	optional: Record<string, FieldType>;
}

/** The fields of each stored message `kind` (`StoredMessage`, `src/history.ts`), by what the readers do with them. */
const MESSAGE_FIELDS = new Map<string, MessageFields>([
	[
		"user",
		{
			required: { text: "string" },
			optional: { contextName: "string", contextPaths: "strings", images: "count", sentAt: "time" },
		},
	],
	[
		"bash",
		{
			required: { command: "string" },
			optional: {
				stdout: "string",
				stderr: "string",
				code: "number",
				timedOut: "boolean",
				durationMs: "number",
			},
		},
	],
	["assistant", { required: { text: "string" }, optional: {} }],
	["thinking", { required: { text: "string" }, optional: {} }],
	[
		"compaction",
		{
			required: {},
			optional: { at: "time", trigger: "string", preTokens: "number", postTokens: "number", summary: "string" },
		},
	],
	// Boundary records (ADR-018): their session id is kept as stored, even one the grammar rejects; so is a
	// turn record's, which is only compared with the tab's. A message id is used only as a lowercase UUID.
	["fresh-start", { required: {}, optional: { at: "time", sessionId: "string" } }],
	["clear", { required: {}, optional: { at: "time", sessionId: "string" } }],
	[
		"tool",
		{
			required: { name: "string", input: "object" },
			optional: { result: "string", isError: "boolean", added: "number", removed: "number" },
		},
	],
	[
		"meta",
		{
			required: {},
			optional: {
				durationMs: "number",
				costUsd: "number",
				error: "string",
				turn: "number",
				rewindUuid: "id",
				lastPromptUuid: "id",
				sessionId: "string",
				profileId: "string",
				edited: "boolean",
				branchSession: "string",
				branchTarget: "id",
				branchLatest: "id",
			},
		},
	],
]);

/** The latest time a `Date` holds (ms since the epoch). */
const MAX_TIME = 8.64e15;

/** A stored time as the readers may take it: a whole number of milliseconds a `Date` holds. */
function isTime(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_TIME;
}

/** The times of a stored conversation that order, group and date it. */
export interface StoredTimeFields {
	createdAt?: unknown;
	updatedAt?: unknown;
	pinnedAt?: unknown;
}

/**
 * Read a stored conversation's times as whole milliseconds a `Date` holds
 * ({@link isTime}): `createdAt` or `updatedAt` that is not takes the other's
 * value, and with neither usable both read as 0, the epoch, so the
 * conversation sorts last and dates as 1970 rather than as "Invalid date" or
 * nowhere in the list; a `pinnedAt` that is not reads as absent. Mutates
 * `stored`.
 */
export function checkStoredTimes<T extends StoredTimeFields>(stored: T): T {
	const values: StoredTimeFields = stored;
	const created = isTime(values.createdAt) ? values.createdAt : undefined;
	const updated = isTime(values.updatedAt) ? values.updatedAt : undefined;
	values.createdAt = created ?? updated ?? 0;
	values.updatedAt = updated ?? created ?? 0;
	if ("pinnedAt" in values && !isTime(values.pinnedAt)) delete values.pinnedAt;
	return stored;
}

function readField(type: FieldType, value: unknown): unknown {
	switch (type) {
		case "string":
			return typeof value === "string" ? value : undefined;
		case "number":
			return typeof value === "number" && Number.isFinite(value) ? value : undefined;
		case "count":
			return typeof value === "number" && Number.isSafeInteger(value) && value > 0
				? value
				: undefined;
		case "time":
			return isTime(value) ? value : undefined;
		case "boolean":
			return typeof value === "boolean" ? value : undefined;
		case "strings":
			return Array.isArray(value)
				? value.filter((item): item is string => typeof item === "string")
				: undefined;
		case "object":
			return isJsonObject(value) ? value : undefined;
		case "id":
			return isSessionId(value) ? value : undefined;
	}
}

/** Check one message in place; false when it cannot be one. A kind this version does not know is kept as stored. */
function checkMessage(message: unknown): boolean {
	if (!isJsonObject(message) || typeof message.kind !== "string") return false;
	const fields = MESSAGE_FIELDS.get(message.kind);
	if (!fields) return true;
	for (const [key, type] of Object.entries(fields.required))
		message[key] = readField(type, message[key]) ?? (type === "object" ? {} : "");
	for (const [key, type] of Object.entries(fields.optional)) {
		if (!(key in message)) continue;
		const value = readField(type, message[key]);
		if (value === undefined) delete message[key];
		else message[key] = value;
	}
	return true;
}

/**
 * Make every stored message safe for the readers (the exporter, the panel,
 * `conversationCost`, restore), which call string and array methods on its
 * fields and read `kind` first. An entry that is not an object, or whose
 * `kind` is not a string, is dropped. A kind this version does not know is kept
 * as stored, so a newer version's records survive a save; the readers skip it.
 * On a known kind a required text field (`text`, `command`, `name`) that is not
 * a string reads as `""` and a tool `input` that is not an object as `{}`; an
 * optional field of the wrong type reads as absent (a number must be finite,
 * an image count a positive whole number, a send time a whole number of
 * milliseconds a `Date` can hold, a message id a lowercase UUID,
 * `contextPaths` loses its non-string entries); other fields are kept. The conversation is never dropped for a bad
 * message (DES-005). Mutates `stored`.
 */
export function checkStoredMessages<T extends { messages: unknown[] }>(stored: T): T {
	const values: { messages: unknown[] } = stored;
	if (Array.isArray(values.messages)) values.messages = values.messages.filter(checkMessage);
	return stored;
}

/**
 * True when a stored export path is safe to write to: a `.md` note that
 * stays within the configured folder, with no traversal segments, no
 * backslash (Windows reads it as a separator the "/" split never sees) and no
 * colon (an NTFS alternate data stream, `file.txt:note.md`).
 * Guards the reuse path in export() against a tampered `exportPath`.
 */
export function isSafeExportPath(path: string, folder: string): boolean {
	if (!path.endsWith(".md")) return false;
	if (!path.startsWith(folder + "/")) return false;
	if (path.includes("\\") || path.includes(":")) return false;
	// No empty/"."/".." segments - those are the only way to escape the folder
	// once the prefix is fixed (normalizePath does NOT collapse "..").
	return path
		.split("/")
		.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
