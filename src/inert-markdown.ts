/**
 * The rendering boundary (DES-001): model Markdown passes through here before
 * `MarkdownRenderer` sees it and before an export writes it, so no other
 * plugin's code-block or inline-code processor runs on it and no remote image
 * or embed loads. Where this module's reading of the Markdown could differ
 * from the renderer's, it cuts more, never less: a wrong guess costs
 * formatting, not inertness.
 */

/** Fence languages handed to the renderer: display languages only. */
export const FENCE_ALLOWLIST: ReadonlySet<string> = new Set([
	"text",
	"txt",
	"plain",
	"markdown",
	"md",
	"json",
	"yaml",
	"yml",
	"toml",
	"ini",
	"xml",
	"html",
	"css",
	"scss",
	"javascript",
	"js",
	"typescript",
	"ts",
	"jsx",
	"tsx",
	"python",
	"py",
	"bash",
	"sh",
	"shell",
	"zsh",
	"powershell",
	"diff",
	"sql",
	"rust",
	"go",
	"java",
	"kotlin",
	"swift",
	"c",
	"cpp",
	"csharp",
	"ruby",
	"php",
	"lua",
]);

/** Raw HTML tags left to the renderer: attribute-free inline formatting. */
const INLINE_TAGS: ReadonlySet<string> = new Set([
	"br",
	"b",
	"i",
	"u",
	"s",
	"em",
	"strong",
	"sub",
	"sup",
	"kbd",
	"mark",
	"small",
	"del",
	"ins",
]);

/** What a placeholder stands for; rebuilt by the view as inert elements. */
export type InertPiece =
	| { kind: "code"; text: string; source: string }
	/** `markdown`, when set, is a fence this module built for the renderer. */
	| { kind: "fence"; text: string; lang: string; source: string; markdown?: string }
	| { kind: "math"; text: string; display: boolean; source: string }
	| { kind: "text"; text: string; source: string }
	/** A colon cut where two would meet (Dataview's `::`); `text` is `:`. */
	| { kind: "colon"; text: string; source: string };

export interface RenderCut {
	/** The Markdown to render: placeholders where code, math and remote images were. */
	markdown: string;
	/** Indexed by the number in each placeholder. */
	pieces: InertPiece[];
	/** Letters and digits; a placeholder is `${token}${index}z`. */
	token: string;
}

/** Cut model Markdown for `MarkdownRenderer`; the view restores the pieces. */
export function cutForRender(markdown: string, token = freshToken(markdown)): RenderCut {
	const cut: RenderCut = { markdown: "", pieces: [], token };
	const parts = segment(markdown);
	const blocks = parts.map((part) => (part.kind === "text" ? "" : add(cut, blockPiece(part))));
	const texts = cutTexts(parts, cut);
	// One placeholder per spelling, so labels that matched still match.
	const colons = new Map<string, string>();
	const colon = (source: string) => {
		const placeholder = colons.get(source) ?? add(cut, { kind: "colon", text: shownColon(source), source });
		colons.set(source, placeholder);
		return placeholder;
	};
	const out = parts.map((part, n) => {
		if (part.kind === "text") return splitColons(repairLinkTargets(finishText(texts[n])), colon);
		const placeholder = `${part.container}${part.leading}${blocks[n]}`;
		// Its own block, so it cannot merge into a neighbouring paragraph;
		// inside a list item no blank line, which would loosen the list.
		const blank = part.continuation.trimEnd();
		const inList = /[^ >]/.test(part.container) || (part.continuation !== "" && blank === "");
		return inList ? placeholder : [blank, placeholder, blank].join("\n");
	});
	cut.markdown = out.join("\n");
	return cut;
}

/** Model Markdown as inert Markdown for an exported note. */
export function cutForExport(markdown: string): string {
	const cut: RenderCut = { markdown: "", pieces: [], token: freshToken(markdown) };
	const parts = segment(markdown);
	const texts = cutTexts(parts, cut);
	const lines: string[] = [];
	parts.forEach((part, n) => {
		if (part.kind === "text") {
			const text = splitPlaceholders(texts[n], cut)
				.map((bit) => (typeof bit === "string" ? bit : exportForm(bit)))
				.join("");
			lines.push(finishText(text));
			return;
		}
		// A list marker on the opener line stays, as text above the block.
		if (/[^ >]/.test(part.container)) lines.push(part.container.trimEnd());
		// Unindented after a blank line (spaces only, as for the renderer): no
		// container or open block can claim the fence, so the renderer closes
		// it where this module does. Math is written as its TeX.
		if (lines.length && !/^ *$/.test(lines[lines.length - 1].split("\n").pop() ?? "")) lines.push("");
		const text = part.content.join("\n");
		lines.push(
			part.kind === "math"
				? builtFence("text", breakQuery(part.source))
				: exportFence(part.info, text)
		);
	});
	return lines.join("\n");
}

/**
 * Tool or shell output for an exported note: the fence a model fence with no
 * info string becomes. A lone carriage return ends a line for the renderer,
 * so it becomes a newline, as in model text: callers quote line by line.
 */
export function fenceForExport(text: string): string {
	return exportFence("", text.replace(/\r\n?/g, "\n"));
}

/** Rendered text split back into plain strings and the pieces it holds. */
export function splitPlaceholders(text: string, cut: RenderCut): Array<string | InertPiece> {
	const parts: Array<string | InertPiece> = [];
	const pushText = (value: string) => {
		if (!value) return;
		const last = parts.length - 1;
		if (typeof parts[last] === "string") parts[last] += value;
		else parts.push(value);
	};
	const pattern = new RegExp(`${cut.token}(\\d+)z`, "g");
	let from = 0;
	for (const match of text.matchAll(pattern)) {
		const piece = cut.pieces[Number(match[1])];
		pushText(text.slice(from, match.index));
		if (piece) parts.push(piece);
		else pushText(match[0]);
		from = match.index + match[0].length;
	}
	pushText(text.slice(from));
	return parts;
}

/** Attributes the renderer fills from rendered text: an image's alt, a heading's data-heading. */
const TEXT_ATTRIBUTES: ReadonlySet<string> = new Set(["alt", "title", "aria-label", "data-heading"]);

/**
 * An attribute's value once rendering is done: in text attributes every
 * placeholder reads as its text; elsewhere (a link's `href`, a footnote's
 * id) only colons come back, which cannot change a URL's scheme.
 */
export function attributeValue(name: string, value: string, cut: RenderCut): string {
	if (TEXT_ATTRIBUTES.has(name)) return plainText(value, cut);
	return value.replace(new RegExp(`${cut.token}(\\d+)z`, "g"), (placeholder, index: string) => {
		const piece = cut.pieces[Number(index)];
		return piece?.kind === "colon" ? piece.text : placeholder;
	});
}

/** Attribute text (an image's alt, a heading's data-heading) with its placeholders read as text. */
export function plainText(text: string, cut: RenderCut): string {
	return splitPlaceholders(text, cut)
		.map((bit) => (typeof bit === "string" ? bit : bit.kind === "math" ? bit.source : bit.text))
		.join("");
}

/** Schemes a click hands to the OS; `file:` and everything else open nothing. */
export function opensInOs(href: string): boolean {
	return /^(?:https?|mailto|obsidian):/i.test(href);
}

/** A fence language the renderer may highlight: allowlisted, or a plain fence that is no query. */
export function isAllowedFence(info: string, content: string): boolean {
	const lang = fenceLang(info);
	if (lang) return FENCE_ALLOWLIST.has(lang);
	const first = content.split("\n").find((line) => line.trim() !== "") ?? "";
	return !/^\s*(?:\$?=|(?:table|list|task|calendar)\b)/i.test(first);
}

// Blocks ---------------------------------------------------------------------

/**
 * A fence or block-math opener after any blockquote and list-item markers.
 * Leading spaces past three still count: a block inside a list item sits
 * deeper. Block math follows Obsidian: two or more `$`, no other `$` on the line.
 */
const BLOCK_OPEN = /^((?: *(?:> ?|(?:[-*+]|\d+[.)]) +))*)( *)(?:(`{3,}|~{3,})(.*)|(\${2,})([^$]*))$/;

interface Block {
	kind: "fence" | "math";
	content: string[];
	source: string;
	container: string;
	leading: string;
	info: string;
	lang: string;
	/** Prefix a line needs to stay inside the block's container. */
	continuation: string;
}

type Segment = { kind: "text"; text: string } | Block;

function segment(markdown: string): Segment[] {
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	const parts: Segment[] = [];
	let text: string[] = [];
	const flush = () => {
		if (text.length) parts.push({ kind: "text", text: text.join("\n") });
		text = [];
	};
	let i = 0;
	while (i < lines.length) {
		const open = BLOCK_OPEN.exec(lines[i]);
		if (!open || (open[3]?.[0] === "`" && open[4].includes("`"))) {
			text.push(lines[i++]);
			continue;
		}
		const [, container, leading, run = "", info = "", dollars = "", rest = ""] = open;
		const math = dollars !== "";
		const continuation = container.replace(/[^ >]/g, " ") + leading;
		const closes = math ? mathCloser(dollars.length) : fenceCloser(run);
		let end = i + 1;
		let closed = false;
		while (end < lines.length && continues(lines[end], continuation)) {
			if (lines[end].startsWith(continuation) && closes(lines[end].slice(continuation.length))) {
				closed = true;
				break;
			}
			end++;
		}
		// A container that ends first ends the block for the renderer too.
		const inner = lines
			.slice(i + 1, end)
			.map((line) => (line.startsWith(continuation) ? line.slice(continuation.length) : ""));
		const content = math ? mathContent(rest, inner, closed ? lines[end].slice(continuation.length) : null) : inner;
		const last = closed ? end + 1 : end;
		flush();
		parts.push({
			kind: math ? "math" : "fence",
			content,
			source: lines.slice(i, last).join("\n"),
			container,
			leading,
			info,
			lang: math ? "" : fenceLang(info),
			continuation,
		});
		i = last;
	}
	flush();
	return parts;
}

function fenceCloser(run: string): (line: string) => boolean {
	const closer = new RegExp(`^ {0,3}${run[0]}{${run.length},}[ \\t]*$`);
	return (line) => closer.test(line);
}

/** Obsidian's block-math closer: the line ends in at least as many `$`, with none before. */
function mathCloser(count: number): (line: string) => boolean {
	return (line) => {
		const trimmed = line.replace(/ +$/, "");
		const run = /\$+$/.exec(trimmed);
		return !!run && run[0].length >= count && trimmed.indexOf("$") === run.index;
	};
}

/** Block math's TeX: text after the opener, the lines between, and text before the closer. */
function mathContent(rest: string, inner: string[], closer: string | null): string[] {
	const content = rest.trim() ? [rest.trim(), ...inner] : inner;
	const before = closer?.replace(/ *\$+ *$/, "").trim();
	return before ? [...content, before] : content;
}

function continues(line: string, continuation: string): boolean {
	if (line.startsWith(continuation)) return true;
	// A blank line stays in a list item; a quote needs its marker even then.
	if (continuation.includes(">")) return line.trimEnd() === continuation.trimEnd();
	return line.trim() === "";
}

function fenceLang(info: string): string {
	return info.trim().split(/\s+/)[0].toLowerCase();
}

/** A fence or block math as the piece its placeholder stands for. */
function blockPiece(block: Block): InertPiece {
	const text = block.content.join("\n");
	if (block.kind === "math")
		return isSafeTex(text)
			? { kind: "math", text, display: true, source: block.source }
			: { kind: "fence", text: block.source, lang: "", source: block.source };
	const piece: Extract<InertPiece, { kind: "fence" }> = { kind: "fence", text, lang: block.lang, source: block.source };
	// Rendered as a fence only where the renderer certainly reads one: no
	// list marker on the opener line, at most three spaces in. Elsewhere the
	// opener could be paragraph text, and stays plain code.
	const proven = !/[^ >]/.test(block.container) && block.leading.length <= 3;
	if (proven && isAllowedFence(block.info, text) && !startsQuery(text)) piece.markdown = builtFence(block.lang, text);
	return piece;
}

/**
 * MathJax commands that set CSS, attributes or links, change options or load
 * code: its style filter keeps `cursor`, so `cursor: url(…)` fetches, and
 * `\fcolorbox` writes its colour into a style string. TeX holding one is
 * shown as code.
 */
const UNSAFE_TEX = /\\(?:style|bbox|class|cssId|data|href|require|mmlToken|unicode|fcolorbox|setOptions)(?![A-Za-z])/;

function isSafeTex(tex: string): boolean {
	return !UNSAFE_TEX.test(tex);
}

/** CSS that fetches when applied: `url()` and the image functions. */
export function loadsResource(css: string): boolean {
	return /(?:url|image|image-set|-webkit-image-set|cross-fade|element)\s*\(/i.test(css);
}

/** Dataview runs any `pre > code` whose trimmed text starts with `=` or `$=`. */
function startsQuery(text: string): boolean {
	return /^\$?=/.test(text.trim());
}

/** A backslash before a leading `=` or `$=`; shown literally inside code. */
function breakQuery(text: string): string {
	return startsQuery(text) ? text.replace(/^(\s*)/, "$1\\") : text;
}

/** A fence for a note: its language when allowed, else `text`; a leading `=` or `$=` broken. */
function exportFence(info: string, text: string): string {
	return builtFence(isAllowedFence(info, text) ? fenceLang(info) : "text", breakQuery(text));
}

/** A fence whose backtick run outlasts every run inside, so only its own closer ends it. */
function builtFence(lang: string, text: string): string {
	const run = "`".repeat(Math.max(3, longestRun(text, "`") + 1));
	return text ? `${run}${lang}\n${text}\n${run}` : `${run}${lang}\n${run}`;
}

function longestRun(text: string, char: string): number {
	let longest = 0;
	for (const match of text.matchAll(new RegExp(`${char}+`, "g"))) longest = Math.max(longest, match[0].length);
	return longest;
}

// Text -----------------------------------------------------------------------

/** Record a piece; returns its placeholder. */
function add(cut: RenderCut, piece: InertPiece): string {
	return `${cut.token}${cut.pieces.push(piece) - 1}z`;
}

/** Text with its placeholders put back as the Markdown they replaced. */
function expand(text: string, cut: RenderCut): string {
	return splitPlaceholders(text, cut)
		.map((bit) => (typeof bit === "string" ? bit : bit.source))
		.join("");
}

/**
 * Every text segment cut, in an order where each step sees no earlier cut.
 * Definitions are read after code and math are cut, from the same text the
 * image lookup reads.
 */
function cutTexts(parts: Segment[], cut: RenderCut): string[] {
	const coded = parts.map((part) => (part.kind === "text" ? cutCodeAndMath(part.text, cut) : ""));
	const defs = definitions(coded.filter((_, n) => parts[n].kind === "text").join("\n"), cut);
	return coded.map((text, n) => {
		if (parts[n].kind !== "text") return "";
		let out = cutImages(text, defs, cut);
		// A tilde run could open a fence the scan above missed.
		out = out.replace(/(?<!\\)~{3,}/g, "\\$&");
		out = unwrapAngleTargets(out);
		return escapeHtml(out);
	});
}

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;

/**
 * CommonMark code spans and Obsidian math become placeholders, the earlier
 * start winning as in the renderer; a backtick or `$` that opens nothing is
 * escaped, so the renderer cannot pair what this scan left alone.
 */
function cutCodeAndMath(text: string, cut: RenderCut): string {
	let out = "";
	let i = 0;
	const misses = { inline: -1, display: -1 };
	while (i < text.length) {
		const c = text[i];
		if (c === "\\" && ASCII_PUNCTUATION.test(text[i + 1] ?? "")) {
			out += text.slice(i, i + 2);
			i += 2;
			continue;
		}
		if (c === "$") {
			const math = mathSpan(text, i, misses);
			if (math) {
				const source = text.slice(i, math.end);
				out += add(
					cut,
					isSafeTex(math.text)
						? { kind: "math", text: math.text, display: math.display, source }
						: { kind: "code", text: source, source }
				);
				i = math.end;
			} else {
				// Escaped like a lone backtick: the renderer cannot open math the cut did not see.
				out += "\\$";
				i++;
			}
			continue;
		}
		if (c !== "`") {
			out += c;
			i++;
			continue;
		}
		let run = i;
		while (text[run] === "`") run++;
		const length = run - i;
		const close = closingRun(text, run, length);
		if (close < 0) {
			out += "\\`".repeat(length);
			i = run;
			continue;
		}
		out += add(cut, {
			kind: "code",
			text: spanText(text.slice(run, close)),
			source: text.slice(i, close + length),
		});
		i = close + length;
	}
	return out;
}

/** Spaces only: the renderer continues a paragraph over a whitespace line holding a tab. */
const BLANK_LINE = / *(?:\n|$)/y;

function blankLineAfter(text: string, newline: number): boolean {
	BLANK_LINE.lastIndex = newline + 1;
	return BLANK_LINE.test(text);
}

/** Start of the next run of exactly `length` backticks in the paragraph, or -1. */
function closingRun(text: string, from: number, length: number): number {
	let j = from;
	while (j < text.length) {
		if (text[j] === "\n" && blankLineAfter(text, j)) return -1;
		if (text[j] !== "`") {
			j++;
			continue;
		}
		let end = j;
		while (text[end] === "`") end++;
		if (end - j === length) return j;
		j = end;
	}
	return -1;
}

function spanText(raw: string): string {
	const text = raw.replace(/\r?\n/g, " ");
	return /^ .* $/s.test(text) && text.trim() !== "" ? text.slice(1, -1) : text;
}

/**
 * Obsidian's inline math at a `$`: `$…$` opens on a non-blank and closes on
 * a `$` after a non-blank that no digit follows; `$$…$$` closes on the next
 * `$$`; a backslash skips the next character. Inline math stays on its line
 * here (the renderer's may run on, which only costs formatting); display
 * math stops at a blank line. `misses` records how far a failed scan
 * reached, since a later opener before that point fails the same way.
 */
function mathSpan(
	text: string,
	at: number,
	misses: { inline: number; display: number }
): { text: string; display: boolean; end: number } | null {
	const display = text[at + 1] === "$";
	const start = at + (display ? 2 : 1);
	if (!display && (text[start] === " " || text[start] === "\t")) return null;
	const key = display ? "display" : "inline";
	if (start < misses[key]) return null;
	let d = start;
	for (; d < text.length; d++) {
		const ch = text[d];
		if (ch === "\n" && (!display || blankLineAfter(text, d))) break;
		if (ch === "\\") {
			// Skips the next character, unless that ends the line or paragraph.
			if (text[++d] === "\n" && (!display || blankLineAfter(text, d))) break;
			continue;
		}
		if (ch !== "$") continue;
		if (display) {
			if (text[d + 1] === "$") return { text: text.slice(start, d), display, end: d + 2 };
		} else if (d > start && !/[ \t]/.test(text[d - 1]) && !/[0-9]/.test(text[d + 1] ?? "")) {
			return { text: text.slice(start, d), display, end: d + 1 };
		}
	}
	misses[key] = d;
	return null;
}

/**
 * Every image becomes its alt text and URL unless it is certain to be a
 * vault image: an inline `![…](…)` on one line or `![[…]]` with a vault source. A
 * reference-style image is always cut, since its definition can sit
 * anywhere the renderer looks.
 */
function cutImages(text: string, defs: Map<string, string>, cut: RenderCut): string {
	let out = "";
	let i = 0;
	const replace = (from: number, to: number, shown: string) => {
		out += add(cut, { kind: "text", text: shown, source: expand(text.slice(from, to), cut) });
		i = to;
	};
	const keep = (at: number, length: number) => {
		out += text.slice(at, at + length);
		i = at + length;
	};
	for (;;) {
		const at = text.indexOf("![", i);
		if (at < 0) break;
		out += text.slice(i, at);
		i = at;
		if (escaped(text, at)) {
			keep(at, 1);
			continue;
		}
		if (text[at + 2] === "[") {
			// Obsidian's embed: `![[target]]` on one line. Anything else falls
			// back to `![` and an image, as in the renderer.
			const end = text.indexOf("]]", at + 3);
			const inner = end < 0 ? "" : text.slice(at + 3, end);
			if (inner.trim() && !/[[\]\n]/.test(inner)) {
				const target = inner.split("|")[0].trim();
				if (isVaultSource(target)) keep(at, 2);
				else replace(at, end + 2, target);
				continue;
			}
		}
		const altEnd = closingBracket(text, at + 1);
		if (altEnd < 0) {
			// Unclosed here; escaped in case the renderer finds a closer.
			out += "\\!";
			i = at + 1;
			continue;
		}
		const alt = shown(text.slice(at + 2, altEnd), cut);
		if (text[altEnd + 1] === "(") {
			const link = destination(text, altEnd + 2);
			// On one line: a block starting on the next would end the paragraph,
			// and the renderer would read `![…]` as a reference image.
			if (link && isVaultSource(link.url) && !text.slice(at, link.end).includes("\n")) {
				keep(at, 1);
				continue;
			}
			if (link) {
				replace(at, link.end, imageText(alt, link.url));
				continue;
			}
		}
		let label = text.slice(at + 2, altEnd);
		let end = altEnd + 1;
		if (text[altEnd + 1] === "[") {
			const refEnd = text.indexOf("]", altEnd + 2);
			if (refEnd >= 0) {
				const inner = text.slice(altEnd + 2, refEnd);
				if (inner.trim()) label = inner;
				end = refEnd + 1;
			}
		}
		const url = defs.get(normalizeLabel(label));
		replace(at, end, url === undefined ? shown(text.slice(at, end), cut) : imageText(alt, url));
	}
	return out + text.slice(i);
}

/** Whether the character at `at` follows an odd run of backslashes. */
function escaped(text: string, at: number): boolean {
	let run = 0;
	while (text[at - 1 - run] === "\\") run++;
	return run % 2 === 1;
}

/** Cut Markdown as the reader sees it: placeholders back, escapes undone. */
function shown(text: string, cut: RenderCut): string {
	return expand(text, cut).replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

function imageText(alt: string, url: string): string {
	const label = alt.trim();
	return label ? `${label} (${url})` : url;
}

/**
 * A source certain to be a vault path: no scheme, no `//`, and no character
 * that hides one (an entity, a backslash) or that a later step rewrites.
 */
function isVaultSource(url: string): boolean {
	// The renderer may decode percent escapes, so the decoded form is checked too.
	let decoded: string;
	try {
		decoded = decodeURIComponent(url);
	} catch {
		return false;
	}
	return [url, decoded].every((form) => !form.trim().startsWith("//") && !/[:\\<>&!`$[\]~]/.test(form));
}

/** Index of the `]` closing the `[` at `open`, within one paragraph, or -1. */
function closingBracket(text: string, open: number): number {
	let depth = 0;
	for (let j = open; j < text.length; j++) {
		const c = text[j];
		if (c === "\\") j++;
		else if (c === "[") depth++;
		else if (c === "]" && --depth === 0) return j;
		else if (c === "\n" && blankLineAfter(text, j)) return -1;
	}
	return -1;
}

/** The destination of an inline link starting after `(`, and the index past `)`. */
function destination(text: string, start: number): { url: string; end: number } | null {
	let j = skipSpace(text, start);
	let url: string;
	if (text[j] === "<") {
		const close = text.indexOf(">", j);
		if (close < 0 || text.slice(j, close).includes("\n")) return null;
		url = text.slice(j + 1, close);
		j = close + 1;
	} else {
		let depth = 0;
		const from = j;
		for (; j < text.length; j++) {
			const c = text[j];
			if (c === "\\") j++;
			else if (c <= " ") break;
			else if (c === "(") depth++;
			else if (c === ")" && depth-- === 0) break;
		}
		url = text.slice(from, j);
	}
	j = skipSpace(text, j);
	const quote = text[j];
	if (quote === '"' || quote === "'" || quote === "(") {
		const closeChar = quote === "(" ? ")" : quote;
		for (j++; j < text.length && text[j] !== closeChar; j++) if (text[j] === "\\") j++;
		if (j >= text.length) return null;
		j = skipSpace(text, j + 1);
	}
	return text[j] === ")" ? { url, end: j + 1 } : null;
}

function skipSpace(text: string, from: number): number {
	let j = from;
	let newlines = 0;
	while (j < text.length && (text[j] === " " || text[j] === "\t" || (text[j] === "\n" && ++newlines === 1))) j++;
	return j;
}

/**
 * Link reference definitions, first one per label, for the text a cut
 * image shows. The destination may sit on a later line, after blank ones.
 */
function definitions(text: string, cut: RenderCut): Map<string, string> {
	const defs = new Map<string, string>();
	const lines = text.split("\n");
	lines.forEach((line, n) => {
		const bare = line.replace(/^(?: *(?:> ?|(?:[-*+]|\d+[.)]) +))*\s*/, "");
		const def = /^\[((?:\\.|[^\\\]])+)\]:[ \t]*(\S*)/.exec(bare);
		if (!def) return;
		const next = lines.slice(n + 1).find((later) => later.trim() !== "") ?? "";
		const raw = def[2] || next.trim().split(/\s+/)[0];
		const url = expand(raw.replace(/^<([^>]*)>.*$/, "$1"), cut);
		const label = normalizeLabel(def[1]);
		if (!defs.has(label)) defs.set(label, url);
	});
	return defs;
}

/** CommonMark's label matching: whitespace collapsed, case folded. */
function normalizeLabel(label: string): string {
	return label.replace(/\s+/g, " ").trim().toLowerCase().toUpperCase();
}

/**
 * `](<a b.md>)` and `]: <a b.md>` lose their angle brackets so the HTML
 * escape below cannot break them; spaces and parentheses are percent-encoded.
 */
function unwrapAngleTargets(text: string): string {
	return text.replace(
		/(\]\(\s*|\]:[ \t]*)<([^<>\n]*)>/g,
		(_, lead: string, target: string) =>
			lead + target.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")
	);
}

/** No quote or `=` (in an email's local part, no `/` either): inside raw HTML those would make attributes. */
const AUTOLINK = /<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>"'=]*>/y;
const EMAIL_AUTOLINK =
	/<[A-Za-z0-9.!#$%&*+?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*>/y;
const PLAIN_TAG = /<\/?([A-Za-z][A-Za-z0-9]*)[ \t]*\/?>/y;
/**
 * What may precede a block on its line: indentation, quote and list markers
 * of any length, a task box holding any character, a footnote label, a
 * callout marker (Obsidian parses a callout title as blocks).
 */
const LINE_PREFIX = String.raw`(?:[^\S\n]|>|[-*+](?=\s)|\d+[.)](?=\s)|\[[^\n]\](?=\s)|\[\^[^\]\n]*\]:|\[![^\]\n]*\][+-]?)*`;
const BLOCK_PREFIX = new RegExp(`^${LINE_PREFIX}$`);

/**
 * Raw HTML shows as text unless it is an attribute-free inline formatting
 * tag in running text; one alone on its line would open an HTML block, so
 * it shows as text too. An entity, not a backslash: inside an HTML block a
 * backslash is text.
 */
function escapeHtml(text: string): string {
	return text.replace(/<(?=[A-Za-z/!?])/g, (lt, at: number) => {
		for (const pattern of [AUTOLINK, EMAIL_AUTOLINK]) {
			pattern.lastIndex = at;
			if (pattern.test(text)) return lt;
		}
		PLAIN_TAG.lastIndex = at;
		const tag = PLAIN_TAG.exec(text);
		if (!tag || !INLINE_TAGS.has(tag[1].toLowerCase())) return "&lt;";
		const lineStart = text.lastIndexOf("\n", at - 1) + 1;
		const lineEnd = text.indexOf("\n", at);
		const after = text.slice(PLAIN_TAG.lastIndex, lineEnd < 0 ? text.length : lineEnd);
		return BLOCK_PREFIX.test(text.slice(lineStart, at)) && after.trim() === "" ? "&lt;" : lt;
	});
}

/** Line-start escapes, on the final text of a segment, pieces included. */
function finishText(text: string): string {
	return escapeDefinitionStarts(escapeQueryStarts(escapeBlockOpeners(text)));
}

const QUERY_START = new RegExp(`^(${LINE_PREFIX})(\\$?=)(.*)$`, "gm");

/**
 * A backslash before `=` or `$=` at the start of a line, so indented code
 * cannot start with a Dataview query.
 */
function escapeQueryStarts(text: string): string {
	return text.replace(QUERY_START, (line, prefix: string, start: string, rest: string) => {
		// A highlight (`==`) or setext underline stays where it cannot be
		// indented code: at most three spaces in.
		const shallow = /(?:^|\S) {0,3}$/.test(prefix);
		const kept = start === "=" && shallow && (rest.startsWith("=") || /^[ \t]*$/.test(rest));
		return kept ? line : `${prefix}\\${start}${rest}`;
	});
}

const DEFINITION_START = new RegExp(`^(${LINE_PREFIX})\\[`, "gm");

/**
 * The renderer reads a definition's label up to the first `]`, across blank
 * lines, then its destination and title across them too, so a definition
 * could swallow a fence this module built. A line-start `[` is escaped when
 * no `]` follows in the text, or when it opens a definition that does not
 * end on its own line, or one whose destination is not a plain vault path:
 * an inline image the renderer splits (emphasis closing inside it) falls back
 * to a reference, which must not find a remote one. A footnote stays.
 */
function escapeDefinitionStarts(text: string): string {
	const list = LIST_OR_FOOTNOTE.exec(text);
	const listEnd = list ? text.indexOf("\n", list.index) : -1;
	const listFrom = !list || listEnd < 0 ? Infinity : listEnd;
	return text.replace(DEFINITION_START, (match, prefix: string, at: number) => {
		const open = at + prefix.length;
		let close = open + 1;
		while (close < text.length && text[close] !== "]") close += text[close] === "\\" ? 2 : 1;
		if (close >= text.length) return `${prefix}\\[`;
		if (text[close + 1] !== ":") return match;
		const newline = text.indexOf("\n", open);
		const lineEnd = newline < 0 ? text.length : newline;
		const rest = text.slice(close + 2, lineEnd);
		if (close > lineEnd || OPEN_DEFINITION.test(rest)) return `${prefix}\\[`;
		const footnote = text[open + 1] === "^";
		const read = (at > listFrom ? LOOSE_DEFINITION_PREFIX : DEFINITION_PREFIX).test(prefix);
		return footnote || !read || isVaultSource(rest.trim().split(/[ \t]/)[0]) ? match : `${prefix}\\[`;
	});
}

/**
 * What may stand before a definition the renderer reads: quote markers (a
 * callout's marker after one), list markers (a task box after one), footnote
 * labels, each after at most three spaces, and at most three before the `[`;
 * more makes indented code. Below a list item or footnote any indentation
 * counts, since a continued item holds definitions indented four or more.
 */
const definitionPrefix = (space: string, afterMarker: string) =>
	new RegExp(
		`^(?:${space}(?:>[ \\t]?(?:${space}\\[![^\\]\\n]*\\][+-]?[ \\t]+)?|(?:[-*+]|\\d{1,9}[.)])${afterMarker}(?:${space}\\[[^\\n]\\][ \\t]+)?|\\[\\^[^\\]\\n]*\\]:[ \\t]*))*${space}$`
	);
const DEFINITION_PREFIX = definitionPrefix(" {0,3}", "[ \\t]");
const LOOSE_DEFINITION_PREFIX = definitionPrefix("[ \\t]*", "[ \\t]+");
/** A line opening a list item or a footnote. */
const LIST_OR_FOOTNOTE = /^[ \t>]*(?:(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|\[\^[^\]\n]*\]:)/m;

/**
 * The rest of a definition's line when the definition could continue below:
 * no destination, an unclosed `<…>`, or a title whose quote does not close.
 */
const OPEN_DEFINITION = /^[ \t]*(?:$|<[^>]*$|(?:<[^>]*>|[^\s<]\S*)[ \t]+(?:"[^"]*|'[^']*|\([^)]*)$)/;

const MATH_OPENER = new RegExp(`^(${LINE_PREFIX})(?=\\\${2,}[^$\\n]*$)`, "gm");

/**
 * Text cannot open a comment or block math the cut did not see: either runs
 * on past a fence this module built and closes inside it, and a comment's
 * closer starts a block mid-line, where no line-start escape reaches.
 */
function escapeBlockOpeners(text: string): string {
	let out = "";
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === "\\" && ASCII_PUNCTUATION.test(text[i + 1] ?? "")) {
			out += c + text[++i];
			continue;
		}
		out += c === "%" && text[i + 1] === "%" ? "\\%" : c;
	}
	return out.replace(MATH_OPENER, "$1\\");
}

/** Schemes that make a link target a URL rather than a vault path. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** The `](target)` half of an inline Markdown link. */
const LINK_TARGET = /\]\(([^()\n]+)\)/g;

/**
 * Claude writes vault paths verbatim, so a link to a note whose name contains
 * a space - `[Log](Projects/Progress Log.md)` - isn't a link at all to a
 * Markdown parser. Percent-encode those spaces, the form Obsidian writes.
 */
function repairLinkTargets(markdown: string): string {
	return markdown.replace(LINK_TARGET, (whole, target: string) => {
		const trimmed = target.trim();
		if (!trimmed.includes(" ") || URL_SCHEME.test(trimmed)) return whole;
		// CommonMark allows a title after the target: `(path "Title")`.
		const title = /\s+["'].*$/.exec(trimmed);
		const path = title ? trimmed.slice(0, title.index) : trimmed;
		if (!path.includes(" ")) return whole;
		return `](${path.replace(/ /g, "%20")}${title ? ` ${title[0].trim()}` : ""})`;
	});
}

/**
 * One Markdown decoding step: a backslash escape, a numeric entity (no `;`
 * needed) or a named entity that can spell part of a colon's entity
 * (`&amp` needs no `;`).
 */
const MARKDOWN_DECODE = /\\([!-/:-@[-`{-~])|&(?:#[xX]([0-9a-fA-F]+);?|#([0-9]+);?|(amp|AMP);?|(num|semi|colon);)/y;
const NAMED: Readonly<Record<string, string>> = { amp: "&", AMP: "&", num: "#", semi: ";", colon: ":" };
/** An entity that decodes to `:`, and any start of one. */
const COLON_ENTITY = /&(?:colon;|#0*58(?![0-9]);?|#[xX]0*3[aA](?![0-9a-fA-F]);?)/y;
const COLON_ENTITY_START = /^&(?:c(?:o(?:l(?:o(?:n;?)?)?)?)?|#(?:[xX]0*(?:3(?:[aA];?)?)?|0*(?:5(?:8;?)?)?)?)?$/;
/** Where the colon scan stops: an escape, an `&`, `%%` or a colon. Text between is plain. */
const COLON_SCAN = /\\[!-/:-@[-`{-~]|&|%%|:/g;

/** The character Markdown decodes at `at`, and where its source ends. */
function decodeAt(text: string, at: number): { char: string; end: number } {
	MARKDOWN_DECODE.lastIndex = at;
	const step = MARKDOWN_DECODE.exec(text);
	if (!step) return { char: text[at], end: at + 1 };
	const [whole, escape, hex, dec, amp, named] = step;
	const code = hex !== undefined ? parseInt(hex, 16) : Number(dec);
	const char =
		escape ?? (amp ? "&" : named ? NAMED[named] : code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�");
	return { char, end: at + whole.length };
}

/**
 * Whether the source at `at` (an `&` or `\&`) reads as a colon, and where
 * that reading ends: decoded as Markdown, then once more for an attribute
 * (Obsidian unescapes an image's alt and a link's title and decodes them),
 * so twice-encoded spellings count too.
 */
function colonAt(text: string, at: number): { colon: boolean; end: number } {
	const first = decodeAt(text, at);
	if (first.char !== "&") return { colon: first.char === ":", end: first.end };
	let decoded = "&";
	const ends = [first.end];
	for (let i = first.end; i < text.length && COLON_ENTITY_START.test(decoded); ) {
		const next = decodeAt(text, i);
		decoded += next.char;
		ends.push(next.end);
		i = next.end;
	}
	COLON_ENTITY.lastIndex = 0;
	const entity = COLON_ENTITY.exec(decoded);
	return entity ? { colon: true, end: ends[entity[0].length - 1] } : { colon: false, end: first.end };
}

/**
 * Source spans of every colon that follows another, as text shows them or
 * an attribute reads them. A colon right after `%%` counts once a colon has
 * stood right before one: a comment vanishes from the rendered note, so the
 * colons on either side of it meet, wherever it opened.
 */
function secondColons(text: string): Array<[number, number]> {
	const spans: Array<[number, number]> = [];
	const scan = new RegExp(COLON_SCAN);
	let afterColon = false;
	let colonBeforeComment = false;
	let last = 0;
	for (let match = scan.exec(text); match; match = scan.exec(text)) {
		const at = match.index;
		if (at > last) afterColon = false;
		const token = match[0];
		let end = at + token.length;
		if (token === "%%") {
			colonBeforeComment ||= afterColon;
			afterColon = colonBeforeComment;
			last = end;
			continue;
		}
		let colon = token === ":" || token === "\\:";
		if (token === "&" || token === "\\&") ({ colon, end } = colonAt(text, at));
		if (colon && afterColon) spans.push([at, end]);
		afterColon = colon;
		last = scan.lastIndex = end;
	}
	return spans;
}

/**
 * Rewrites the second of every two colons that would meet: Dataview reads
 * `key::` as an inline field and renders its value again as Markdown.
 */
function splitColons(text: string, second: (colon: string) => string): string {
	let out = "";
	let from = 0;
	for (const [start, end] of secondColons(text)) {
		out += text.slice(from, start) + second(text.slice(start, end));
		from = end;
	}
	return out + text.slice(from);
}

/** A colon's spelling as text shows it: Markdown-decoded once. */
function shownColon(source: string): string {
	let shown = "";
	for (let i = 0; i < source.length; ) {
		const step = decodeAt(source, i);
		shown += step.char;
		i = step.end;
	}
	return shown;
}

// Export ---------------------------------------------------------------------

/**
 * A piece as Markdown that renders as its own text and nothing more. Inline
 * math too: the renderer could pair a `$` written as-is with another than
 * this module did, and open math over text a later step escaped.
 */
function exportForm(piece: InertPiece): string {
	if (piece.kind === "math") return escapeInline(piece.source);
	const text = escapeInline(piece.text);
	return piece.kind === "code" ? `\\\`${text}\\\`` : text;
}

/** Invisible, no line break, not whitespace to CommonMark: it splits a token and changes no parse. */
const WORD_JOINER = "\u2060";

/**
 * `<` and `%` as the file or a rendered text node may hold them: the character,
 * an escape or an entity (`&lt` and numeric entities need no `;`); an escaped
 * entity counts too, which costs only a joiner. A joiner after the `<` covers
 * its escape.
 */
const LESS_THAN = String.raw`<|&(?:lt|LT);?|&#0*60;?|&#[xX]0*3[cC];?`;
const PERCENT = String.raw`\\?(?:%|&percnt;|&#0*37(?![0-9]);?|&#[xX]0*25(?![0-9a-fA-F]);?)`;
const TEMPLATE_OPEN = new RegExp(`(${LESS_THAN})(?=${PERCENT})`, "g");

/**
 * A word joiner after every `<` that a `%` follows, so Templater finds no
 * `<%` in an exported note's file or in its rendered text nodes, code included.
 */
export function breakTemplateCommands(note: string): string {
	return note.replace(TEMPLATE_OPEN, `$1${WORD_JOINER}`);
}

/**
 * A word joiner between every two colons that would meet, so Dataview reads no
 * inline field from an exported note: neither its index, which reads code
 * blocks too, nor its rendering of the note.
 */
export function breakInlineFields(note: string): string {
	return splitColons(note, (colon) => WORD_JOINER + colon);
}

function escapeInline(text: string): string {
	return text
		.replace(/\s*\n\s*/g, " ")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/[\\`*_~=[\]()!#$%^|:]/g, "\\$&");
}

/** Entities and escapes decoded in one pass. */
const DECODE = /\\([!-/:-@[-`{-~])|&(?:#[xX]([0-9a-fA-F]+);?|#([0-9]+);?|(amp|AMP);?)/g;

function decodeOnce(text: string): string {
	return text.replace(DECODE, (whole, escape: string | undefined, hex: string | undefined, dec: string | undefined, amp) => {
		if (escape !== undefined) return escape;
		if (amp) return "&";
		const code = hex !== undefined ? parseInt(hex, 16) : Number(dec);
		return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
	});
}

/**
 * A token the text does not contain, as written, as rendered text or as an
 * attribute (decoded twice), so no text in it can stand for a piece.
 */
export function freshToken(text: string, next: () => string = randomToken): string {
	const once = decodeOnce(text);
	const forms = [text, once, decodeOnce(once.replace(/\\/g, "\\\\"))];
	let token = next();
	while (forms.some((form) => form.includes(token))) token = next();
	return token;
}

function randomToken(): string {
	const bytes = new Uint8Array(12);
	crypto.getRandomValues(bytes);
	return "i" + Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}
