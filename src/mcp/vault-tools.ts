import { MarkdownView, TFile, TFolder, normalizePath, type App } from "obsidian";
import {
	errorResult,
	optionalNumber,
	requireString,
	textResult,
	type McpTool,
	type McpToolResult,
} from "./server";
import { matchesQuery, normalizeProperties, parseQuery, type NoteFacts } from "./query";

/**
 * The `obsidian` MCP server's tools: the things Claude cannot do from the
 * filesystem alone, because they need Obsidian's link graph and metadata index.
 *
 * Every one of these still goes through the normal permission prompt - the CLI
 * asks before calling any MCP tool - so nothing here is a way around consent.
 */

const MAX_RESULTS = 200;
const MAX_LINKS = 500;

/** Resolve a path or link text the model supplied to a real file. */
function resolveFile(app: App, raw: string): TFile | null {
	const path = normalizePath(raw);
	const direct = app.vault.getAbstractFileByPath(path);
	if (direct instanceof TFile) return direct;
	// Try it as an extensionless path, then as link text - the model usually has
	// the name from a wiki link rather than a full path.
	const withExtension = app.vault.getAbstractFileByPath(`${path}.md`);
	if (withExtension instanceof TFile) return withExtension;
	return app.metadataCache.getFirstLinkpathDest(path, "");
}

function notFound(raw: string): McpToolResult {
	return errorResult(
		`No note found at "${raw}". Paths are vault-relative (e.g. "notes/Ideas.md"); ` +
			"a name without a folder works too if it is unambiguous."
	);
}

function noteFacts(app: App, file: TFile): NoteFacts {
	const cache = app.metadataCache.getFileCache(file);
	const tags = new Set<string>();
	for (const tag of cache?.tags ?? []) tags.add(tag.tag.replace(/^#/, "").toLowerCase());
	// Frontmatter tags are indexed separately from inline ones.
	const frontmatterTags = cache?.frontmatter?.tags ?? cache?.frontmatter?.tag;
	for (const tag of Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags])
		if (typeof tag === "string") tags.add(tag.replace(/^#/, "").toLowerCase());
	return {
		path: file.path,
		basename: file.basename,
		tags: [...tags],
		headings: (cache?.headings ?? []).map((heading) => heading.heading.toLowerCase()),
		properties: normalizeProperties(cache?.frontmatter),
	};
}

/** Every note that links to `file`, from the resolved-link index. */
function backlinksOf(app: App, file: TFile): string[] {
	const found: string[] = [];
	for (const [source, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
		if (source === file.path) continue;
		if (Object.prototype.hasOwnProperty.call(targets, file.path)) found.push(source);
	}
	return found.sort();
}

export function createVaultTools(app: App): McpTool[] {
	return [
		{
			name: "obsidian_links",
			description:
				"A note's place in the vault's link graph: outgoing links, embeds, the " +
				"notes that link to it, and links that point nowhere. Uses Obsidian's " +
				"own index, so it sees links the filesystem cannot resolve.",
			inputSchema: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description: 'Vault-relative path, e.g. "notes/Ideas.md".',
					},
				},
				required: ["path"],
			},
			async handler(args) {
				const path = requireString(args, "path");
				if (!path.ok) return path.error;
				const file = resolveFile(app, path.value);
				if (!file) return notFound(path.value);

				const cache = app.metadataCache.getFileCache(file);
				const outgoing = new Set<string>();
				const unresolved = new Set<string>();
				for (const link of [...(cache?.links ?? []), ...(cache?.frontmatterLinks ?? [])]) {
					const target = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
					if (target) outgoing.add(target.path);
					else unresolved.add(link.link);
				}
				const embeds = new Set<string>();
				for (const embed of cache?.embeds ?? []) {
					const target = app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
					if (target) embeds.add(target.path);
					else unresolved.add(embed.link);
				}
				// The index also tracks unresolved links per source, which catches
				// forms the per-link walk above can miss.
				for (const link of Object.keys(
					app.metadataCache.unresolvedLinks[file.path] ?? {}
				))
					unresolved.add(link);

				const lines = [`# ${file.path}`];
				const section = (title: string, values: string[]) => {
					lines.push("", `## ${title} (${values.length})`);
					if (values.length === 0) lines.push("(none)");
					else for (const value of values.slice(0, MAX_LINKS)) lines.push(`- ${value}`);
					if (values.length > MAX_LINKS)
						lines.push(`- … ${values.length - MAX_LINKS} more`);
				};
				section("Outgoing links", [...outgoing].sort());
				section("Embeds", [...embeds].sort());
				section("Backlinks", backlinksOf(app, file));
				section("Unresolved links", [...unresolved].sort());
				return textResult(lines.join("\n"));
			},
		},

		{
			name: "obsidian_search",
			description:
				"Search notes by metadata rather than by text: tags, frontmatter " +
				"properties, headings, and paths. Use Grep for note *contents*; use " +
				"this for questions the filesystem cannot answer. Query syntax: " +
				'tag:project  heading:"Open questions"  prop:status=done  prop:due  ' +
				"folder:daily  path:2026  -tag:archive  and bare words match the note " +
				"name or path. All terms must match; prefix any with - to exclude.",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string", description: "The query, e.g. 'tag:project -prop:status=done'." },
					limit: {
						type: "number",
						description: `Maximum notes to return (default 50, max ${MAX_RESULTS}).`,
					},
				},
				required: ["query"],
			},
			async handler(args) {
				const query = requireString(args, "query");
				if (!query.ok) return query.error;
				const parsed = parseQuery(query.value);
				if (parsed.terms.length === 0)
					return errorResult(
						"That query had nothing to match on. Try tag:, heading:, prop:, folder:, path:, or a bare word."
					);
				const limit = Math.min(optionalNumber(args, "limit") ?? 50, MAX_RESULTS);

				const matches: NoteFacts[] = [];
				for (const file of app.vault.getMarkdownFiles()) {
					const facts = noteFacts(app, file);
					if (matchesQuery(parsed, facts)) matches.push(facts);
				}
				matches.sort((a, b) => a.path.localeCompare(b.path));

				const lines = [`${matches.length} note(s) matched \`${query.value}\`.`];
				if (parsed.unknownFields.length > 0)
					lines.push(
						"",
						`Note: ${parsed.unknownFields.join(", ")} is not a filter, so it was matched as text. ` +
							"Filters are tag, heading, path, prop, folder."
					);
				lines.push("");
				for (const note of matches.slice(0, limit)) {
					const bits: string[] = [];
					if (note.tags.length) bits.push(note.tags.map((tag) => `#${tag}`).join(" "));
					const props = Object.entries(note.properties)
						.filter(([, values]) => values.length > 0)
						.slice(0, 6)
						.map(([key, values]) => `${key}: ${values.join(", ")}`);
					if (props.length) bits.push(props.join(" · "));
					lines.push(`- ${note.path}${bits.length ? ` — ${bits.join(" — ")}` : ""}`);
				}
				if (matches.length > limit)
					lines.push(`… ${matches.length - limit} more (raise limit to see them)`);
				return textResult(lines.join("\n"));
			},
		},

		{
			name: "obsidian_properties",
			description:
				"Read or update a note's frontmatter properties. Without a patch this " +
				"reads them. With a patch, the given keys are merged in; a key set to " +
				"null is removed. Obsidian rewrites the frontmatter block itself, so " +
				"formatting and the rest of the note are left alone.",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "Vault-relative path to the note." },
					patch: {
						type: "object",
						description:
							"Properties to set. Omit to read. Use null as a value to delete a key.",
					},
				},
				required: ["path"],
			},
			async handler(args) {
				const path = requireString(args, "path");
				if (!path.ok) return path.error;
				const file = resolveFile(app, path.value);
				if (!file) return notFound(path.value);

				const patch = args.patch;
				if (patch === undefined || patch === null) {
					const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
					return textResult(
						frontmatter && Object.keys(frontmatter).length > 0
							? `${file.path} properties:\n${JSON.stringify(frontmatter, null, 2)}`
							: `${file.path} has no frontmatter properties.`
					);
				}
				if (typeof patch !== "object" || Array.isArray(patch))
					return errorResult('"patch" must be an object of property names to values.');

				const changes = patch as Record<string, unknown>;
				const removed: string[] = [];
				const set: string[] = [];
				await app.fileManager.processFrontMatter(file, (frontmatter) => {
					for (const [key, value] of Object.entries(changes)) {
						if (value === null) {
							delete frontmatter[key];
							removed.push(key);
						} else {
							frontmatter[key] = value;
							set.push(key);
						}
					}
				});
				const parts: string[] = [];
				if (set.length) parts.push(`set ${set.join(", ")}`);
				if (removed.length) parts.push(`removed ${removed.join(", ")}`);
				return textResult(
					`${file.path}: ${parts.length ? parts.join("; ") : "nothing to change"}.`
				);
			},
		},

		{
			name: "obsidian_rename",
			description:
				"Rename or move a note, updating every link that points to it. This is " +
				"the only safe way to move a note: a plain filesystem move would leave " +
				"every backlink in the vault broken.",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "The note to rename, vault-relative." },
					newPath: {
						type: "string",
						description:
							'Its new vault-relative path, including the extension, e.g. "archive/Old idea.md".',
					},
				},
				required: ["path", "newPath"],
			},
			async handler(args) {
				const path = requireString(args, "path");
				if (!path.ok) return path.error;
				const newPath = requireString(args, "newPath");
				if (!newPath.ok) return newPath.error;
				const file = resolveFile(app, path.value);
				if (!file) return notFound(path.value);

				const target = normalizePath(newPath.value);
				if (target === file.path) return textResult(`${file.path} is already there.`);
				if (app.vault.getAbstractFileByPath(target))
					return errorResult(`${target} already exists - pick another name.`);

				// renameFile does not create intermediate folders.
				const parent = target.split("/").slice(0, -1).join("/");
				if (parent && !(app.vault.getAbstractFileByPath(parent) instanceof TFolder))
					await app.vault.createFolder(parent).catch(() => undefined);

				const before = backlinksOf(app, file).length;
				await app.fileManager.renameFile(file, target);
				return textResult(
					`Renamed ${path.value} → ${target}.` +
						(before > 0
							? ` ${before} note(s) linked to it; Obsidian updated those links.`
							: " Nothing linked to it.")
				);
			},
		},

		{
			name: "obsidian_active",
			description:
				"What the user is looking at right now: the active note, the cursor " +
				"position, and any selected text. Use this instead of guessing which " +
				'note "this" or "here" refers to.',
			inputSchema: { type: "object", properties: {} },
			async handler() {
				const view = app.workspace.getActiveViewOfType(MarkdownView);
				const file = view?.file ?? app.workspace.getActiveFile();
				if (!file) return textResult("No note is open.");
				const lines = [`Active note: ${file.path}`];
				const editor = view?.editor;
				if (editor) {
					const cursor = editor.getCursor();
					lines.push(`Cursor: line ${cursor.line + 1}, column ${cursor.ch + 1}`);
					const selection = editor.getSelection();
					if (selection)
						lines.push(
							`Selection (${selection.length} chars):`,
							"```",
							selection.length > 4000 ? `${selection.slice(0, 4000)}\n… truncated` : selection,
							"```"
						);
					else lines.push("Selection: none");
				} else {
					lines.push("(not open in an editor, so there is no cursor or selection)");
				}
				return textResult(lines.join("\n"));
			},
		},

		{
			name: "obsidian_open",
			description:
				"Open a note in the user's Obsidian window. This changes what they are " +
				"looking at, so use it when they asked to be taken somewhere - not to " +
				"read a file (use Read for that).",
			inputSchema: {
				type: "object",
				properties: {
					path: { type: "string", description: "Vault-relative path to the note." },
					newPane: {
						type: "boolean",
						description: "Open beside the current note instead of replacing it.",
					},
				},
				required: ["path"],
			},
			async handler(args) {
				const path = requireString(args, "path");
				if (!path.ok) return path.error;
				const file = resolveFile(app, path.value);
				if (!file) return notFound(path.value);
				const leaf = app.workspace.getLeaf(args.newPane === true ? "split" : false);
				await leaf.openFile(file);
				return textResult(`Opened ${file.path}.`);
			},
		},
	];
}
