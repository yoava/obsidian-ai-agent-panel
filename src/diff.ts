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

export type DiffRowType = "context" | "add" | "remove" | "gap" | "cut";

export interface DiffRow {
	type: DiffRowType;
	/**
	 * 1-based line number in the old text (`context` and `remove` rows); on a
	 * `gap` row, the first line it hides.
	 */
	oldLine?: number;
	/**
	 * 1-based line number in the new text (`context` and `add` rows); on a `gap`
	 * row, the first line it hides.
	 */
	newLine?: number;
	text: string;
	/** Word-level refinement; present only when a removal paired with an addition. */
	segments?: InlineSegment[];
	/**
	 * `gap` rows: how many unchanged lines were collapsed away. `cut` rows: how
	 * many rows were dropped to stay under `maxRows`.
	 */
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
	/** Rows were dropped to stay under `maxRows`; the last row is a `cut` row. */
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

/** Most rows one gap expands to; the rest stays a gap row. */
const MAX_GAP_ROWS = 20_000;

/**
 * A chunk of rows drawn in one animation frame ends at this many rows or at
 * `CHUNK_CHARS` characters of row text, whichever comes first, so long lines
 * stay inside the 100 ms task bound too (PRD-001.R29).
 */
const CHUNK_ROWS = 500;
const CHUNK_CHARS = 50_000;

/** An option left undefined (`{ context: opts.context }`) keeps its default. */
function withDefaults(options: DiffOptions): typeof DEFAULTS {
	const opts = { ...DEFAULTS };
	for (const key of Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>)
		opts[key] = options[key] ?? DEFAULTS[key];
	return opts;
}

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
	const opts = withDefaults(options);
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
		collapsed.push({ type: "cut", text: "", hidden: dropped });
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
 * Pair each removal in a change block with an addition and
 * highlight only the words that differ. Equal-length blocks pair by offset;
 * unequal ones by similarity (`alignBlock`). Leftovers stay whole-line.
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
		const refinable = (from: RawRow, to: RawRow): boolean =>
			from.text.length <= maxInlineChars &&
			to.text.length <= maxInlineChars &&
			from.text !== "" &&
			to.text !== "";
		const offsets: [number, number][] = Array.from({ length: Math.min(removals.length, additions.length) }, (_, k) => [k, k]);
		const pairs =
			removals.length !== additions.length && removals.length <= MAX_ALIGNED && additions.length <= MAX_ALIGNED
				? (alignByTokens(removals, additions, refinable, minSimilarity) ?? offsets)
				: offsets;
		for (const [fromAt, toAt] of pairs) {
			const from = removals[fromAt];
			const to = additions[toAt];
			if (!refinable(from, to)) continue;
			const refined = refinePair(from.text, to.text, minSimilarity);
			if (!refined) continue;
			from.segments = refined.from;
			to.segments = refined.to;
		}
		i = ad > i ? ad : i + 1;
	}
}

/** The largest block, either side, whose lines are aligned by similarity rather than by offset. */
const MAX_ALIGNED = 24;

/** The most work (Σ tokens² over a block's lines) spent aligning one block; a bigger block pairs by offset. */
export const MAX_ALIGN_WORK = 120_000;

/** Token-pair cells the word-level LCS has filled; read by tests to bound the work, never by the app. */
export const refineWork = { cells: 0 };

/**
 * Pair a block's lines by cheap similarity (shared token characters, no LCS),
 * or null when the block's Σ tokens² is over `MAX_ALIGN_WORK`, so the caller
 * falls back to offset pairing.
 */
function alignByTokens(
	removals: RawRow[],
	additions: RawRow[],
	refinable: (from: RawRow, to: RawRow) => boolean,
	minSimilarity: number
): [number, number][] | null {
	const tokens = (rows: RawRow[]) => rows.map((row) => tokenize(row.text));
	const from = tokens(removals);
	const to = tokens(additions);
	let work = 0;
	for (const list of [from, to]) for (const t of list) work += t.length * t.length;
	if (work > MAX_ALIGN_WORK) return null;
	const counts = (t: string[]) => {
		const map = new Map<string, number>();
		for (const token of t) map.set(token, (map.get(token) ?? 0) + 1);
		return map;
	};
	const fromCounts = from.map(counts);
	const toCounts = to.map(counts);
	return alignBlock(removals, additions, (a, b, ia, ib) => {
		if (!refinable(a, b)) return 0;
		let shared = 0;
		for (const [token, n] of fromCounts[ia]) shared += Math.min(n, toCounts[ib].get(token) ?? 0) * token.length;
		const score = shared / Math.max(a.text.length, b.text.length);
		return score < minSimilarity ? 0 : score;
	});
}

/**
 * The in-order pairing of a block's removals and additions with the most
 * similarity between them, so a paragraph re-wrapped to fewer or more lines
 * still pairs the lines that share words (a zero score pairs nothing).
 */
function alignBlock(
	removals: RawRow[],
	additions: RawRow[],
	score: (from: RawRow, to: RawRow, fromAt: number, toAt: number) => number
): [number, number][] {
	const n = removals.length;
	const m = additions.length;
	const scores = removals.map((from, a) => additions.map((to, b) => score(from, to, a, b)));
	const best: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let a = 1; a <= n; a++)
		for (let b = 1; b <= m; b++)
			best[a][b] = Math.max(best[a - 1][b], best[a][b - 1], best[a - 1][b - 1] + scores[a - 1][b - 1]);
	const out: [number, number][] = [];
	for (let a = n, b = m; a > 0 && b > 0; ) {
		if (best[a][b] === best[a - 1][b]) a--;
		else if (best[a][b] === best[a][b - 1]) b--;
		else {
			out.unshift([a - 1, b - 1]);
			a--;
			b--;
		}
	}
	return out;
}

function refinePair(
	oldLine: string,
	newLine: string,
	minSimilarity: number
): { from: InlineSegment[]; to: InlineSegment[] } | null {
	const a = tokenize(oldLine);
	const b = tokenize(newLine);
	if (a.length === 0 || b.length === 0) return null;

	refineWork.cells += a.length * b.length;
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
	// Every row of a run is unchanged, so its first row's numbers start the gap.
	const flush = (end: number) => {
		if (run === 0) return;
		const first = rows[end - run];
		out.push({
			type: "gap",
			text: "",
			hidden: run,
			oldLine: first.oldLine,
			newLine: first.newLine,
		});
		run = 0;
	};
	for (let i = 0; i < rows.length; i++) {
		if (keep[i]) {
			flush(i);
			out.push({ ...rows[i] });
		} else {
			run++;
		}
	}
	flush(rows.length);
	return out;
}

/**
 * The unchanged lines a `gap` row hides, as `context` rows taken by the gap's
 * line range from the old text's lines (unchanged lines read the same in both
 * texts) - no re-diff. At most `limit` rows come back; `rest` is a gap row for
 * the lines after them, or null when none remain.
 */
export function expandGap(
	gap: DiffRow,
	oldLines: string[],
	limit = MAX_GAP_ROWS
): { rows: DiffRow[]; rest: DiffRow | null } {
	const { oldLine, newLine, hidden } = gap;
	if (gap.type !== "gap" || oldLine === undefined || newLine === undefined || !hidden)
		return { rows: [], rest: gap };
	const count = Math.min(hidden, limit);
	const rows: DiffRow[] = [];
	for (let k = 0; k < count; k++)
		rows.push({
			type: "context",
			oldLine: oldLine + k,
			newLine: newLine + k,
			text: oldLines[oldLine - 1 + k],
		});
	const rest: DiffRow | null =
		count < hidden
			? {
					type: "gap",
					text: "",
					hidden: hidden - count,
					oldLine: oldLine + count,
					newLine: newLine + count,
				}
			: null;
	return { rows, rest };
}

/**
 * Draw `rows` in chunks without holding the UI thread: the first chunk now,
 * whether or not the target is on the page yet, each later one when
 * `schedule` runs the step it is given (an animation frame). `draw` gets the
 * chunk and whether it is the last. Nothing more is drawn once `alive` says
 * the target is gone. A chunk always holds at least one row, so a line longer
 * than the character budget still draws.
 */
export function drawInChunks(
	rows: DiffRow[],
	draw: (chunk: DiffRow[], last: boolean) => void,
	schedule: (step: () => void) => void,
	alive: () => boolean,
	maxRows = CHUNK_ROWS,
	maxChars = CHUNK_CHARS
): void {
	let next = 0;
	const chunk = () => {
		let end = next;
		let chars = 0;
		while (end < rows.length && end - next < maxRows && chars < maxChars)
			chars += rows[end++].text.length;
		const last = end >= rows.length;
		draw(rows.slice(next, end), last);
		next = end;
		if (!last) schedule(step);
	};
	const step = () => {
		if (alive()) chunk();
	};
	chunk();
}

/**
 * The changed region before and after, as two texts: context rows on both
 * sides, removals before only, additions after only. Gap and cut rows stand
 * for lines that are not in the diff, so they contribute nothing.
 */
export function sidesOf(diff: FileDiff): { before: string; after: string } {
	const before: string[] = [];
	const after: string[] = [];
	for (const row of diff.rows) {
		if (row.type === "gap" || row.type === "cut") continue;
		if (row.type !== "add") before.push(row.text);
		if (row.type !== "remove") after.push(row.text);
	}
	return { before: before.join("\n"), after: after.join("\n") };
}

/** "+3 -1" style summary, or null when nothing changed. */
export function formatDiffStat(diff: FileDiff): string | null {
	if (diff.unchanged) return null;
	const parts: string[] = [];
	if (diff.added) parts.push(`+${diff.added}`);
	if (diff.removed) parts.push(`-${diff.removed}`);
	return parts.join(" ");
}
