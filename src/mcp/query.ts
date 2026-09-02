/**
 * The little query language behind `obsidian_search`.
 *
 * This is deliberately *metadata*-aware rather than content-aware: Claude
 * already has Grep for text. What it cannot do from the filesystem is ask
 * questions about tags, frontmatter properties and headings, because those live
 * in Obsidian's index. So the grammar covers exactly that.
 *
 *   tag:#project           a tag, with or without the "#"
 *   heading:Roadmap        a heading anywhere in the note
 *   path:daily/            a substring of the note's path
 *   prop:status            the property exists
 *   prop:status=done       the property equals a value
 *   folder:notes           the note is in this folder (or below it)
 *   -tag:archive           negation, on any of the above
 *   roadmap                a bare term: matches the note's name or path
 *
 * Quoted values keep their spaces: `heading:"Open questions"`.
 *
 * Pure, no Obsidian import - parsed and matched in plain Node tests.
 */

export type QueryField = "tag" | "heading" | "path" | "prop" | "folder" | "text";

export interface QueryTerm {
	field: QueryField;
	/** Lower-cased for comparison; `prop` splits this into key and value. */
	value: string;
	/** Only for `prop:key=value`. */
	propValue?: string;
	negated: boolean;
}

export interface ParsedQuery {
	terms: QueryTerm[];
	/** Field words that looked like a filter but are not one, e.g. "titel:x". */
	unknownFields: string[];
}

const FIELDS: Record<string, QueryField> = {
	tag: "tag",
	tags: "tag",
	heading: "heading",
	headings: "heading",
	path: "path",
	prop: "prop",
	property: "prop",
	properties: "prop",
	folder: "folder",
	dir: "folder",
};

/** Split on whitespace, keeping quoted runs together. */
function tokenize(query: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	for (const char of query) {
		if (quote) {
			if (char === quote) quote = null;
			else current += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current) tokens.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	if (current) tokens.push(current);
	return tokens;
}

export function parseQuery(query: string): ParsedQuery {
	const terms: QueryTerm[] = [];
	const unknownFields: string[] = [];
	for (const token of tokenize(query)) {
		let rest = token;
		let negated = false;
		if (rest.startsWith("-") && rest.length > 1) {
			negated = true;
			rest = rest.slice(1);
		}
		const colon = rest.indexOf(":");
		if (colon <= 0) {
			if (rest) terms.push({ field: "text", value: rest.toLowerCase(), negated });
			continue;
		}
		const rawField = rest.slice(0, colon).toLowerCase();
		const rawValue = rest.slice(colon + 1);
		const field = FIELDS[rawField];
		if (!field) {
			// Not a filter, so treat the whole token as a text term - but say so, so
			// the tool can tell the model it may have meant a filter.
			unknownFields.push(rawField);
			terms.push({ field: "text", value: rest.toLowerCase(), negated });
			continue;
		}
		if (!rawValue) continue;
		if (field === "prop") {
			const equals = rawValue.indexOf("=");
			if (equals > 0)
				terms.push({
					field,
					value: rawValue.slice(0, equals).toLowerCase(),
					propValue: rawValue.slice(equals + 1).toLowerCase(),
					negated,
				});
			else terms.push({ field, value: rawValue.toLowerCase(), negated });
			continue;
		}
		const value = field === "tag" ? rawValue.replace(/^#/, "").toLowerCase() : rawValue.toLowerCase();
		terms.push({ field, value, negated });
	}
	return { terms, unknownFields };
}

/** Everything the matcher needs to know about one note. */
export interface NoteFacts {
	path: string;
	/** File name without its extension. */
	basename: string;
	/** Tags without the leading "#", lower-cased. */
	tags: string[];
	/** Heading texts, lower-cased. */
	headings: string[];
	/** Frontmatter, keys lower-cased; values stringified and lower-cased. */
	properties: Record<string, string[]>;
}

function matchTerm(term: QueryTerm, note: NoteFacts): boolean {
	switch (term.field) {
		case "tag":
			// Nested tags match their parents: tag:project hits #project/alpha.
			return note.tags.some(
				(tag) => tag === term.value || tag.startsWith(`${term.value}/`)
			);
		case "heading":
			return note.headings.some((heading) => heading.includes(term.value));
		case "path":
			return note.path.toLowerCase().includes(term.value);
		case "folder": {
			const folder = term.value.replace(/\/+$/, "");
			const dir = note.path.toLowerCase().split("/").slice(0, -1).join("/");
			return folder === "" ? dir === "" : dir === folder || dir.startsWith(`${folder}/`);
		}
		case "prop": {
			const values = note.properties[term.value];
			if (values === undefined) return false;
			if (term.propValue === undefined) return true;
			return values.some((value) => value === term.propValue);
		}
		case "text":
			return (
				note.basename.toLowerCase().includes(term.value) ||
				note.path.toLowerCase().includes(term.value)
			);
	}
}

/** All terms must hold (negated ones must not). An empty query matches nothing. */
export function matchesQuery(parsed: ParsedQuery, note: NoteFacts): boolean {
	if (parsed.terms.length === 0) return false;
	for (const term of parsed.terms) {
		const hit = matchTerm(term, note);
		if (term.negated ? hit : !hit) return false;
	}
	return true;
}

/** Frontmatter into the lower-cased string lists the matcher compares against. */
export function normalizeProperties(
	frontmatter: Record<string, unknown> | undefined
): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	if (!frontmatter) return out;
	for (const [key, raw] of Object.entries(frontmatter)) {
		const values = (Array.isArray(raw) ? raw : [raw])
			.filter((value) => value !== null && value !== undefined)
			.map((value) =>
				(typeof value === "object" ? JSON.stringify(value) : String(value)).toLowerCase()
			);
		out[key.toLowerCase()] = values;
	}
	return out;
}
