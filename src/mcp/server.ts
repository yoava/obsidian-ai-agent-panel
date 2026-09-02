/**
 * A minimal in-process MCP server.
 *
 * The CLI drives this over the stdio pipe the plugin already owns: each
 * JSON-RPC message arrives as an `mcp_message` control request, and the reply
 * this returns is sent straight back as its `mcp_response`. There is no port, no
 * `.mcp.json`, no second process and no credential anywhere - the transport is
 * strictly request/response over the existing channel.
 *
 * No Obsidian import: the vault tools are injected, so the protocol half is
 * exercised in plain Node (tests/mcp.test.mjs).
 */

export interface JsonRpcMessage {
	jsonrpc?: string;
	id?: string | number;
	method?: string;
	params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: string | number;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

/** What a tool hands back: MCP content blocks, plus an error flag. */
export interface McpToolResult {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
}

export interface McpTool {
	name: string;
	description: string;
	/** JSON Schema for the arguments, as the model will see it. */
	inputSchema: Record<string, unknown>;
	handler(args: Record<string, unknown>): Promise<McpToolResult>;
}

export interface McpServerInfo {
	name: string;
	version: string;
	instructions?: string;
}

/** The protocol version the plugin implements; a client's own is echoed back. */
const FALLBACK_PROTOCOL_VERSION = "2025-06-18";

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

export function textResult(text: string): McpToolResult {
	return { content: [{ type: "text", text }] };
}

export function errorResult(text: string): McpToolResult {
	return { content: [{ type: "text", text }], isError: true };
}

export class McpServer {
	constructor(
		private readonly info: McpServerInfo,
		private readonly tools: McpTool[]
	) {}

	get toolNames(): string[] {
		return this.tools.map((tool) => tool.name);
	}

	/**
	 * Handle one JSON-RPC message. Returns null for notifications, which the
	 * CLI's transport accepts as a `mcp_response` of null (verified live).
	 */
	async handle(message: JsonRpcMessage): Promise<JsonRpcResponse | null> {
		const id = message.id;
		if (id === undefined) return null; // notification: nothing to answer
		const reply = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
		const fail = (code: number, msg: string): JsonRpcResponse => ({
			jsonrpc: "2.0",
			id,
			error: { code, message: msg },
		});

		switch (message.method) {
			case "initialize": {
				const requested = message.params?.protocolVersion;
				return reply({
					// Agreeing with the client avoids a version negotiation we have no
					// reason to fail; the surface used here is stable across versions.
					protocolVersion:
						typeof requested === "string" ? requested : FALLBACK_PROTOCOL_VERSION,
					// Only tools. Advertising resources or prompts would invite
					// resources/list and prompts/list round-trips for nothing.
					capabilities: { tools: {} },
					serverInfo: { name: this.info.name, version: this.info.version },
					...(this.info.instructions ? { instructions: this.info.instructions } : {}),
				});
			}
			case "ping":
				return reply({});
			case "tools/list":
				return reply({
					tools: this.tools.map((tool) => ({
						name: tool.name,
						description: tool.description,
						inputSchema: tool.inputSchema,
					})),
				});
			case "tools/call": {
				const name = message.params?.name;
				if (typeof name !== "string") return fail(INVALID_PARAMS, "tools/call: name must be a string");
				const tool = this.tools.find((entry) => entry.name === name);
				if (!tool) return fail(METHOD_NOT_FOUND, `Unknown tool: ${name}`);
				const rawArgs = message.params?.arguments;
				const args =
					rawArgs !== null && typeof rawArgs === "object" && !Array.isArray(rawArgs)
						? (rawArgs as Record<string, unknown>)
						: {};
				try {
					return reply(await tool.handler(args));
				} catch (err) {
					// A thrown handler becomes a tool-level error, not a protocol error:
					// the model can read it and try something else.
					return reply(
						errorResult(
							`${name} failed: ${err instanceof Error ? err.message : String(err)}`
						)
					);
				}
			}
			default:
				return fail(METHOD_NOT_FOUND, `Method not found: ${String(message.method)}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Argument helpers - tools get untyped JSON from the model
// ---------------------------------------------------------------------------

export function requireString(
	args: Record<string, unknown>,
	key: string
): { ok: true; value: string } | { ok: false; error: McpToolResult } {
	const value = args[key];
	if (typeof value !== "string" || value.trim() === "")
		return { ok: false, error: errorResult(`"${key}" is required and must be a non-empty string.`) };
	return { ok: true, value: value.trim() };
}

export function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
	const value = args[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
