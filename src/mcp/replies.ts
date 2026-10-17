/**
 * The `obsidian_rename` reply, kept apart from the Obsidian calls so it is
 * checked in plain Node (tests/mcp.test.mjs).
 */

/** What the vault server may hear from a CLI that is not yet a tab's: its handshake and tool discovery, never a call. */
export type UnadoptedMcp = { allow: true } | { allow: false; reply: unknown };

/**
 * The gate on an Undo's CLI before it is adopted (PRD-001.R38): `initialize`,
 * notifications and `tools/list` go through; everything else, a `tools/call`
 * included, gets a JSON-RPC error (null for a message with no id), because
 * denying `can_use_tool` does not guard this route.
 */
export function unadoptedMcp(message: unknown): UnadoptedMcp {
	const body = typeof message === "object" && message !== null ? (message as { id?: unknown; method?: unknown }) : {};
	const method = typeof body.method === "string" ? body.method : null;
	if (method !== null && (method === "initialize" || method === "tools/list" || method.startsWith("notifications/"))) return { allow: true };
	const id = typeof body.id === "string" || typeof body.id === "number" ? body.id : null;
	const reply = id === null ? null : { jsonrpc: "2.0", id, error: { code: -32601, message: "Not available while a clear is being undone" } };
	return { allow: false, reply };
}

/**
 * What `obsidian_rename` says after a move. Whether links were rewritten is
 * the user's Obsidian setting, not the tool's, so the reply never claims it.
 */
export function renameReply(from: string, to: string, linkedNotes: number): string {
	return (
		`Renamed ${from} → ${to}.` +
		(linkedNotes > 0
			? ` ${linkedNotes} note(s) linked to it; ` +
				"Obsidian updates those links as the user's link-update setting directs."
			: " Nothing linked to it.")
	);
}
