/**
 * The session ids this device recorded (ADR-018 Decision 1, PRD-003.R4): a
 * stored id resumes, forks, branches or undoes only if this device saw the
 * CLI report it for that conversation and profile. The record lives in a
 * device-local key (ADR-009), never in a conversation file. Obsidian-free, so
 * it is tested in plain Node (tests/state-session-provenance.test.mjs);
 * `main` supplies the storage.
 */

import { isJsonObject } from "../json";
import { serializeSaves } from "../save-queue";
import { isSafeArgValue } from "../settings-core";
import { isSessionId } from "./session-id";

/** The device-local key holding the record. */
export const PROVENANCE_KEY = "ai-agent-panel:session-provenance";

/** The file in the history folder that marks the one-time migration done (ADR-018 Decision 1, Grandfathering). */
export const MIGRATION_MARKER = ".session-provenance-migrated";

/** How long an entry whose conversation has no file is kept: matches the CLI's default session cleanup (ADR-006). */
export const MISSING_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

const CONVERSATION_ID = /^[A-Za-z0-9_-]+$/;

/** One conversation's ids. Maps and sets, so a key such as `__proto__` is only a key. */
interface Entry {
	sessions: Map<string, Set<string>>;
	started: Set<string>;
	missingSince?: number;
}

/** The record as read: `unset` when the key was never written, `malformed` when it is set but unreadable. */
interface Parsed {
	entries: Map<string, Entry>;
	state: "unset" | "valid" | "malformed";
	/** The migration is over: a record without the field, and a malformed one, read as migrated; only an own, literal `false` and an unset key permit it. */
	migrated: boolean;
}

/** A value of `object` under its own key; an inherited one is no value. */
function own(object: Record<string, unknown>, key: string): unknown {
	return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

function sessionSet(value: unknown): Set<string> {
	return new Set(Array.isArray(value) ? value.filter(isSessionId) : []);
}

function parseEntry(value: unknown): Entry | null {
	if (!isJsonObject(value)) return null;
	const entry: Entry = { sessions: new Map(), started: sessionSet(own(value, "started")) };
	const sessions = own(value, "sessions");
	if (isJsonObject(sessions))
		for (const profile of Object.keys(sessions))
			if (isSafeArgValue(profile)) entry.sessions.set(profile, sessionSet(own(sessions, profile)));
	const missing = own(value, "missingSince");
	if (typeof missing === "number" && Number.isSafeInteger(missing) && missing >= 0) entry.missingSince = missing;
	return entry;
}

/**
 * The record from the device-local value, with own-key access only: `version`
 * must be 1, conversation ids match the history file-name pattern, profile
 * ids pass `isSafeArgValue`, session ids the grammar, and anything else is
 * dropped. An unset key is empty and permits the migration; a set one that is
 * no object, or whose version is not 1, is empty, `malformed` and permits
 * none; `migrated` is `false` only as an own, literal `false`.
 */
export function parseProvenance(raw: unknown): Parsed {
	const entries = new Map<string, Entry>();
	if (raw === null || raw === undefined) return { entries, state: "unset", migrated: false };
	if (!isJsonObject(raw) || own(raw, "version") !== 1) return { entries, state: "malformed", migrated: true };
	const conversations = own(raw, "conversations");
	if (isJsonObject(conversations))
		for (const id of Object.keys(conversations)) {
			if (!CONVERSATION_ID.test(id)) continue;
			const entry = parseEntry(own(conversations, id));
			if (entry) entries.set(id, entry);
		}
	return { entries, state: "valid", migrated: own(raw, "migrated") !== false };
}

/** Where the record is read and written, and how a failure is logged. */
export interface ProvenanceIo {
	read(): unknown;
	write(value: unknown): void | Promise<void>;
	log(message: string, detail?: unknown): void;
	now(): number;
}

/** A conversation the history scan read, for the one-time migration. */
export interface SeedSource {
	id: string;
	/** Its stored profile, absent when it stores none. */
	profileId?: string;
	/** The ids it stores, its own and its turn records'; ones failing the grammar are not seeded. */
	sessionIds: readonly unknown[];
}

/** What a history scan reports (PRD-003.R6): whether its listing succeeded, apart from the names it found. */
export interface ScanReport {
	/** The folder was listed; false leaves everything as it was. */
	listed: boolean;
	/** Conversation ids from the `.json` file names listed, readable or not, with ids saved during the scan. */
	names: ReadonlySet<string>;
	/** The listing holds the migration marker. */
	markerPresent: boolean;
	/** The conversations the scan read. */
	sources: readonly SeedSource[];
}

/**
 * The stored ids of a conversation, for {@link SeedSource}: its own, its turn
 * and boundary records', and a pending branch's source (`branchSession`).
 */
export function storedSessionIds(conversation: {
	sessionId?: unknown;
	messages: readonly { kind: string; sessionId?: unknown; branchSession?: unknown }[];
}): unknown[] {
	const ids: unknown[] = [conversation.sessionId];
	for (const record of conversation.messages) {
		if (record.kind === "meta") ids.push(record.sessionId, record.branchSession);
		else if (record.kind === "fresh-start" || record.kind === "clear") ids.push(record.sessionId);
	}
	return ids;
}

/**
 * The one in-memory record of the ids this device recorded: parse, record,
 * check, migrate, prune. Every change is saved through a queue, one write at
 * a time; a failed write is logged and the ids stay usable until the plugin
 * reloads.
 */
export class SessionProvenance {
	private readonly entries: Map<string, Entry>;
	/** The device key was unset at load and the migration has not run: it runs at the first complete scan. */
	private migrationPending: boolean;
	private readonly write: () => Promise<void>;
	/** The last save landed: false after a failed one, which a later scan retries. */
	private persisted = true;

	constructor(private readonly io: ProvenanceIo) {
		const parsed = parseProvenance(io.read());
		this.entries = parsed.entries;
		this.migrationPending = !parsed.migrated;
		if (parsed.state === "malformed") io.log("the session record on this device is unreadable and is treated as empty");
		this.write = serializeSaves(async () => {
			await io.write(this.serialize());
		});
	}

	/** The one-time migration has not completed on this device (ADR-018 Decision 1). */
	get migrating(): boolean {
		return this.migrationPending;
	}

	/**
	 * The one decision for a stored session id (ADR-018 Decision 1): `trusted`
	 * when this device recorded it for the conversation and the profile, known
	 * without any scan; `pending` when it did not but the migration has not
	 * completed, so the scan may still vouch for it; else `foreign`.
	 */
	decide(conversationId: string, profileId: string, sessionId: unknown): "trusted" | "pending" | "foreign" {
		if (!isSessionId(sessionId)) return "foreign";
		if (this.check(conversationId, profileId, sessionId)) return "trusted";
		return this.migrationPending ? "pending" : "foreign";
	}

	/** Whether this device recorded `sessionId` for the conversation and the profile that would run it. */
	check(conversationId: string, profileId: string, sessionId: unknown): boolean {
		return isSessionId(sessionId) && this.entries.get(conversationId)?.sessions.get(profileId)?.has(sessionId) === true;
	}

	/** Whether this panel began `sessionId` in the conversation (its `started` list), so it saw every turn of it (PRD-005.R7). */
	began(conversationId: string, sessionId: unknown): boolean {
		return isSessionId(sessionId) && this.entries.get(conversationId)?.started.has(sessionId) === true;
	}

	/**
	 * A session the CLI reported in the conversation, or a branch's verified
	 * source: joins the profile's list; `started` for a session this panel
	 * began (fresh, or as a fork). Saved when it changed anything.
	 */
	record(conversationId: string, profileId: string, sessionId: string, started = false): void {
		if (!CONVERSATION_ID.test(conversationId) || !isSafeArgValue(profileId) || !isSessionId(sessionId)) return;
		const entry = this.entryOf(conversationId);
		let list = entry.sessions.get(profileId);
		if (!list) entry.sessions.set(profileId, (list = new Set()));
		const before = list.size + entry.started.size;
		list.add(sessionId);
		if (started) entry.started.add(sessionId);
		// While the migration is pending the afterScan save writes everything: a key written earlier would end it.
		if (list.size + entry.started.size !== before) void this.save();
	}

	/** The conversation was deleted (PRD-003.R8): its entry goes. */
	forget(conversationId: string): void {
		if (this.entries.delete(conversationId)) void this.save();
	}

	/**
	 * A history scan ended (PRD-003.R6, R4): the one-time migration while it is
	 * pending (a marker in the listing means an earlier one ran: nothing is
	 * seeded), then pruning; nothing at all after a failed listing. The
	 * migration seeds on top of what was observed meanwhile and completes in
	 * memory for good. A save follows when anything changed or an earlier one
	 * failed. `seedProfile` maps a conversation's stored profile to the profile
	 * its ids are entered for (the default profile when it stores none), or null
	 * when this device lacks it. Resolves with whether the marker file is to be
	 * written: the migration is complete and the listing holds none; the caller
	 * writes it whether or not the key was saved.
	 */
	async afterScan(report: ScanReport, seedProfile: (stored: string | undefined) => string | null): Promise<{ writeMarker: boolean }> {
		if (!report.listed) return { writeMarker: false };
		let changed = false;
		if (this.migrationPending) {
			if (!report.markerPresent) for (const source of report.sources) this.seed(source, seedProfile);
			this.migrationPending = false;
			changed = true;
		}
		if (this.prune(report.names)) changed = true;
		if (changed || !this.persisted) await this.save();
		return { writeMarker: !report.markerPresent };
	}

	/** The record as stored: plain objects without a prototype, so any key is only a key. */
	serialize(): unknown {
		const conversations = Object.create(null) as Record<string, unknown>;
		for (const [id, entry] of this.entries) {
			const sessions = Object.create(null) as Record<string, string[]>;
			for (const [profile, ids] of entry.sessions) sessions[profile] = [...ids];
			const stored: Record<string, unknown> = { sessions, started: [...entry.started] };
			if (entry.missingSince !== undefined) stored.missingSince = entry.missingSince;
			conversations[id] = stored;
		}
		return { version: 1, migrated: !this.migrationPending, conversations };
	}

	private entryOf(conversationId: string): Entry {
		let entry = this.entries.get(conversationId);
		if (!entry) this.entries.set(conversationId, (entry = { sessions: new Map(), started: new Set() }));
		return entry;
	}

	/** Enter a conversation's valid ids for its stored profile, if this device has it. */
	private seed(source: SeedSource, seedProfile: (stored: string | undefined) => string | null): void {
		if (!CONVERSATION_ID.test(source.id)) return;
		const profile = seedProfile(source.profileId);
		if (profile === null || !isSafeArgValue(profile)) return;
		const entry = this.entryOf(source.id);
		let list = entry.sessions.get(profile);
		if (!list) entry.sessions.set(profile, (list = new Set()));
		for (const id of source.sessionIds) if (isSessionId(id)) list.add(id);
	}

	/**
	 * Mark entries whose conversation has no file and clear the mark on those
	 * that have one; drop an entry missing for 30 days. True when anything changed.
	 */
	private prune(names: ReadonlySet<string>): boolean {
		const now = this.io.now();
		let changed = false;
		for (const [id, entry] of this.entries) {
			if (names.has(id)) {
				if (entry.missingSince !== undefined) {
					delete entry.missingSince;
					changed = true;
				}
			} else if (entry.missingSince === undefined) {
				entry.missingSince = now;
				changed = true;
			} else if (now - entry.missingSince >= MISSING_GRACE_MS) {
				this.entries.delete(id);
				changed = true;
			}
		}
		return changed;
	}

	private save(): Promise<boolean> {
		return this.write().then(
			() => (this.persisted = true),
			(err: unknown) => {
				this.persisted = false;
				this.io.log("could not save the session record on this device", err);
				return false;
			}
		);
	}
}
