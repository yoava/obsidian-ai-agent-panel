/**
 * A small original text-diff implementation.
 *
 * Line-level LCS first, then a word-level refinement pass inside lines that
 * were replaced, so a one-word edit highlights that word instead of painting
 * the whole line red and green. No external dependency, no Obsidian import -
 * this file is pure and runs in plain Node (see tests/diff.test.mjs).
 *
 * Everything here is bounded on purpose. Notes can be large, and a quadratic
 * LCS on two 20k-line files would freeze Obsidian's UI thread; past the cell
 * budget the diff degrades to "this block was replaced" and says so via
 * `coarse` rather than blocking.
 */

/** A run of characters inside a replaced line, flagged changed or carried over. */
export interface InlineSegment {
	text: string;
	changed: boolean;
}

export type DiffRowType = "context" | "add" | "remove" | "gap";

export interface DiffRow {
	type: DiffRowType;
	/** 1-based line number in the old text (`context` and `remove` rows). */
	oldLine?: number;
	/** 1-based line number in the new text (`context` and `add` rows). */
	newLine?: number;
	text: string;
	/** Word-level refinement; present only when a removal paired with an addition. */
	segments?: InlineSegment[];
	/** `gap` rows only: how many unchanged lines were collapsed away. */
	hidden?: number;
}

export interface FileDiff {
	rows: DiffRow[];
	added: number;
	removed: number;
	/** The two texts are identical (`rows` is empty). */
	unchanged: boolean;
	/**
	 * The inputs exceeded the LCS budget, so the changed region is reported as
	 * one wholesale replacement instead of line-by-line.
	 */
	coarse: boolean;
	/** Rows were dropped to stay under `maxRows`. */
	truncated: boolean;
}

export interface DiffOptions {
	/** Unchanged lines kept on each side of a change. Default 3. */
	context?: number;
	/** LCS table cell budget (`oldLines * newLines`). Default 1,000,000. */
	maxCells?: number;
	/** Skip word-level refinement for lines longer than this. Default 400. */
	maxInlineChars?: number;
	/** Hard cap on emitted rows. Default 4000. */
	maxRows?: number;
	/**
	 * Minimum word-level similarity for two lines to be treated as a rewrite of
	 * each other rather than unrelated. Below this, highlighting every word is
	 * noise, so the pair is left unrefined. Default 0.34.
	 */
	minSimilarity?: number;
}

const DEFAULTS = {
	context: 3,
	maxCells: 1_000_000,
	maxInlineChars: 400,
	maxRows: 4000,
	minSimilarity: 0.34,
};

/**
 * Split into display lines. A trailing newline does not become an extra empty
 * line, so "a\n" and "a" diff as equal - a missing final newline is not a
 * change worth a red row in a note editor.
 */
export function splitLines(text: string): string[] {
	if (text === "") return [];
	const lines = text.split(/\r\n|\r|\n/);
	if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
	return lines;
}

/** Longest common subsequence of two line arrays, as index pairs. */
function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
	const n = a.length;
	const m = b.length;
	// (n+1)*(m+1) fits the caller's budget check.
	const width = m + 1;
	const table = new Uint32Array((n + 1) * width);
	for (let i = n - 1; i >= 0; i--) {
		const rowBase = i * width;
		const nextBase = (i + 1) * width;
		const ai = a[i];
		for (let j = m - 1; j >= 0; j--) {
			table[rowBase + j] =
				ai === b[j]
					? table[nextBase + j + 1] + 1
					: Math.max(table[nextBase + j], table[rowBase + j + 1]);
		}
	}
	const pairs: Array<[number, number]> = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			pairs.push([i, j]);
			i++;
			j++;
		} else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
			i++;
		} else {
			j++;
		}
	}
	return pairs;
}

interface RawRow {
	type: "context" | "add" | "remove";
	oldLine?: number;
	newLine?: number;
	text: string;
	segments?: InlineSegment[];
}

/** Diff two texts into display rows with collapsed unchanged stretches. */
export function diffText(
	oldText: string,
	newText: string,
	options: DiffOptions = {}
): FileDiff {
	const opts = { ...DEFAULTS, ...options };
	const a = splitLines(oldText);
	const b = splitLines(newText);

	// Identical prefix and suffix never need diffing, and trimming them is what
	// keeps the LCS table small for the common case of one edited paragraph.
	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) head++;
	let tail = 0;
	while (
		tail < a.length - head &&
		tail < b.length - head &&
		a[a.length - 1 - tail] === b[b.length - 1 - tail]
	)
		tail++;

	const midA = a.slice(head, a.length - tail);
	const midB = b.slice(head, b.length - tail);

	const rows: RawRow[] = [];
	for (let i = 0; i < head; i++)
		rows.push({ type: "context", oldLine: i + 1, newLine: i + 1, text: a[i] });

	let coarse = false;
	if (midA.length === 0 && midB.length === 0) {
		// nothing changed in the middle
	} else if (midA.length === 0 || midB.length === 0) {
		emitBlock(rows, midA, midB, head);
	} else if (midA.length * midB.length > opts.maxCells) {
		coarse = true;
		emitBlock(rows, midA, midB, head);
	} else {
		const pairs = lcsPairs(midA, midB);
		let ai = 0;
		let bi = 0;
		for (const [pa, pb] of pairs) {
			emitBlock(rows, midA.slice(ai, pa), midB.slice(bi, pb), head, ai, bi);
			rows.push({
				type: "context",
				oldLine: head + pa + 1,
				newLine: head + pb + 1,
				text: midA[pa],
			});
			ai = pa + 1;
			bi = pb + 1;
		}
		emitBlock(rows, midA.slice(ai), midB.slice(bi), head, ai, bi);
	}

	for (let i = 0; i < tail; i++) {
		const oldIdx = a.length - tail + i;
		const newIdx = b.length - tail + i;
		rows.push({
			type: "context",
			oldLine: oldIdx + 1,
			newLine: newIdx + 1,
			text: a[oldIdx],
		});
	}

	if (!coarse) refineInline(rows, opts.maxInlineChars, opts.minSimilarity);

	const added = rows.reduce((n, r) => n + (r.type === "add" ? 1 : 0), 0);
	const removed = rows.reduce((n, r) => n + (r.type === "remove" ? 1 : 0), 0);
	const collapsed = collapse(rows, opts.context);
	const truncated = collapsed.length > opts.maxRows;
	if (truncated) {
		const dropped = collapsed.length - opts.maxRows;
		collapsed.length = opts.maxRows;
		collapsed.push({ type: "gap", text: "", hidden: dropped });
	}

	return {
		rows: collapsed,
		added,
		removed,
		unchanged: added === 0 && removed === 0,
		coarse,
		truncated,
	};
}

/** Emit a changed block: every removal, then every addition (git's order). */
function emitBlock(
	rows: RawRow[],
	removedLines: string[],
	addedLines: string[],
	head: number,
	oldOffset = 0,
	newOffset = 0
): void {
	for (let i = 0; i < removedLines.length; i++)
		rows.push({
			type: "remove",
			oldLine: head + oldOffset + i + 1,
			text: removedLines[i],
		});
	for (let i = 0; i < addedLines.length; i++)
		rows.push({
			type: "add",
			newLine: head + newOffset + i + 1,
			text: addedLines[i],
		});
}

// ---------------------------------------------------------------------------
// Word-level refinement
// ---------------------------------------------------------------------------

/**
 * Words, whitespace runs, and single punctuation characters. Diffing at this
 * granularity reads far better than per-character for prose, which is most of
 * what a vault contains.
 */
function tokenize(text: string): string[] {
	return text.match(/[A-Za-z0-9_]+|\s+|[^A-Za-z0-9_\s]/g) ?? [];
}

/**
 * Pair each removal in a change block with the addition at the same offset and
 * highlight only the words that differ. Unequal-length blocks still pair by
 * offset: leftovers simply stay whole-line.
 */
function refineInline(
	rows: RawRow[],
	maxInlineChars: number,
	minSimilarity: number
): void {
	let i = 0;
	while (i < rows.length) {
		if (rows[i].type !== "remove") {
			i++;
			continue;
		}
		let r = i;
		while (r < rows.length && rows[r].type === "remove") r++;
		let ad = r;
		while (ad < rows.length && rows[ad].type === "add") ad++;
		const removals = rows.slice(i, r);
		const additions = rows.slice(r, ad);
		const pairs = Math.min(removals.length, additions.length);
		for (let k = 0; k < pairs; k++) {
			const from = removals[k];
			const to = additions[k];
			if (from.text.length > maxInlineChars || to.text.length > maxInlineChars)
				continue;
			if (from.text === "" || to.text === "") continue;
			const refined = refinePair(from.text, to.text, minSimilarity);
			if (!refined) continue;
			from.segments = refined.from;
			to.segments = refined.to;
		}
		i = ad > i ? ad : i + 1;
	}
}

function refinePair(
	oldLine: string,
	newLine: string,
	minSimilarity: number
): { from: InlineSegment[]; to: InlineSegment[] } | null {
	const a = tokenize(oldLine);
	const b = tokenize(newLine);
	if (a.length === 0 || b.length === 0) return null;

	const pairs = lcsPairs(a, b);
	// Similarity by shared characters, not shared tokens: one long identical
	// clause matters more than a handful of shared spaces and commas.
	let sharedChars = 0;
	for (const [pa] of pairs) sharedChars += a[pa].length;
	const total = Math.max(oldLine.length, newLine.length);
	if (total === 0 || sharedChars / total < minSimilarity) return null;

	const keptA = new Set(pairs.map(([pa]) => pa));
	const keptB = new Set(pairs.map(([, pb]) => pb));
	return {
		from: mergeSegments(a, (idx) => !keptA.has(idx)),
		to: mergeSegments(b, (idx) => !keptB.has(idx)),
	};
}

/** Collapse adjacent tokens sharing a changed flag into one segment. */
function mergeSegments(
	tokens: string[],
	isChanged: (index: number) => boolean
): InlineSegment[] {
	const out: InlineSegment[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const changed = isChanged(i);
		const last = out[out.length - 1];
		if (last && last.changed === changed) last.text += tokens[i];
		else out.push({ text: tokens[i], changed });
	}
	return out;
}

// ---------------------------------------------------------------------------
// Context collapsing
// ---------------------------------------------------------------------------

/**
 * Keep `context` unchanged rows either side of every change and replace each
 * elided stretch with a single `gap` row carrying its line count. A gap is only
 * worth it when it hides more than one line - swapping one context row for one
 * gap row saves nothing and reads worse.
 */
function collapse(rows: RawRow[], context: number): DiffRow[] {
	const keep = new Array<boolean>(rows.length).fill(false);
	let anyChange = false;
	for (let i = 0; i < rows.length; i++) {
		if (rows[i].type === "context") continue;
		anyChange = true;
		keep[i] = true;
		for (let k = 1; k <= context; k++) {
			if (i - k >= 0) keep[i - k] = true;
			if (i + k < rows.length) keep[i + k] = true;
		}
	}
	if (!anyChange) return [];

	// A gap standing for a single line saves nothing and reads worse than the
	// line itself, so keep those instead.
	for (let i = 0; i < rows.length; ) {
		if (keep[i]) {
			i++;
			continue;
		}
		let end = i;
		while (end < rows.length && !keep[end]) end++;
		if (end - i === 1) keep[i] = true;
		i = end;
	}

	const out: DiffRow[] = [];
	let run = 0;
	const flush = () => {
		if (run === 0) return;
		out.push({ type: "gap", text: "", hidden: run });
		run = 0;
	};
	for (let i = 0; i < rows.length; i++) {
		if (keep[i]) {
			flush();
			out.push({ ...rows[i] });
		} else {
			run++;
		}
	}
	flush();
	return out;
}

/** "+3 -1" style summary, or null when nothing changed. */
export function formatDiffStat(diff: FileDiff): string | null {
	if (diff.unchanged) return null;
	const parts: string[] = [];
	if (diff.added) parts.push(`+${diff.added}`);
	if (diff.removed) parts.push(`-${diff.removed}`);
	return parts.join(" ");
}
