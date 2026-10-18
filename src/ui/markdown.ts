import {
	finishRenderMath,
	loadMathJax,
	MarkdownRenderer,
	renderMath,
	type App,
	type Component,
} from "obsidian";
import {
	attributeValue,
	breakCellColons,
	cellText,
	cutForRender,
	loadsResource,
	splitPlaceholders,
	type InertPiece,
	type RenderCut,
} from "../inert-markdown";

/** A text node the table-cell pass wrote: what it held, what it wrote, the piece it stands for. */
interface Written {
	original: string;
	data: string;
	piece?: InertPiece;
}

/** A render whose post processors are running: its root, its cut, the text nodes written in its cells. */
interface InFlight {
	root: HTMLElement;
	cut: RenderCut;
	written: Map<Text, Written>;
}

const inFlight = new Set<InFlight>();

/**
 * The one way model Markdown reaches the DOM (DES-001 Rendering boundary):
 * cut by `inert-markdown`, rendered, then its code, math and remote images
 * put back as inert elements once post processors have run, and each
 * allowlisted fence rendered alone from the fence the module built. Both
 * renders belong to `owner`, the tab's render component, so closing the tab
 * unloads what they created; once `live` turns false (the tab closed) the
 * render stops.
 */
export async function renderMarkdown(
	app: App,
	markdown: string,
	el: HTMLElement,
	owner: Component,
	live: () => boolean = () => true
): Promise<void> {
	if (!live()) return;
	const render: InFlight = { root: el, cut: cutForRender(markdown), written: new Map() };
	inFlight.add(render);
	try {
		await MarkdownRenderer.render(app, render.cut.markdown, el, "", owner);
	} finally {
		inFlight.delete(render);
	}
	if (!live()) return;
	await restoreInert(el, render, (fence, into) =>
		live() ? MarkdownRenderer.render(app, fence, into, "", owner) : Promise.resolve()
	);
}

/**
 * A post processor run early (DES-001 Rendering boundary, step 9): in the
 * table cells of a render in flight, placeholders become the text they stand
 * for (code as its Markdown span) and no two colons meet, so a plugin that copies a cell's text (a
 * table view) copies text, not tokens, and no `::` for Dataview.
 * `restoreInert` reverts what is still in place.
 */
export function protectTableCells(section: HTMLElement): void {
	for (const render of inFlight) {
		const ours = render.root === section || render.root.contains(section);
		if (!ours && !holdsPlaceholder(section.textContent ?? "", render.cut)) continue;
		const cells = section.matches("td, th") ? [section] : Array.from(section.querySelectorAll("td, th"));
		for (const cell of cells)
			if (ours || holdsPlaceholder(cell.textContent ?? "", render.cut)) protectCell(cell, render);
	}
}

function holdsPlaceholder(text: string, cut: RenderCut): boolean {
	return text.includes(cut.token) && splitPlaceholders(text, cut).some((part) => typeof part !== "string");
}

function protectCell(cell: Element, { cut, written }: InFlight): void {
	for (const node of textNodes(cell)) {
		// Inside rendered code a placeholder waits for the late pass, which writes the Markdown it replaced.
		if (!holdsPlaceholder(node.data, cut) || node.parentElement?.closest("pre, code")) continue;
		const nodes = splitPlaceholders(node.data, cut).map((part) => {
			if (typeof part === "string") return node.doc.createTextNode(part);
			const text = node.doc.createTextNode(cellText(part, cell.tagName === "TH"));
			written.set(text, { original: text.data, data: text.data, piece: part });
			return text;
		});
		node.replaceWith(...nodes);
	}
	const nodes = textNodes(cell);
	breakCellColons(nodes.map((node) => node.data)).forEach((data, n) => {
		const node = nodes[n];
		if (data === node.data) return;
		const entry = written.get(node) ?? { original: node.data, data };
		entry.data = data;
		written.set(node, entry);
		node.data = data;
	});
}

function textNodes(root: Element): Text[] {
	const walker = root.doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.instanceOf(Text)) nodes.push(node);
	return nodes;
}

/**
 * Swap the cut's placeholders for elements built here, so no renderer or
 * post processor ever saw the code they hold. An allowlisted fence is
 * rendered alone from the fence `inert-markdown` built, math through
 * MathJax. Inside rendered code (an indented block) a placeholder comes back
 * as the Markdown it replaced. A text node the table-cell pass wrote and no
 * one changed since gets its text back, or its piece built here.
 */
async function restoreInert(
	root: HTMLElement,
	{ cut, written }: InFlight,
	renderFence: (markdown: string, into: HTMLElement) => Promise<void>
): Promise<void> {
	if (cut.pieces.length === 0 && written.size === 0) return;
	const hasMath = cut.pieces.some((piece) => piece.kind === "math");
	if (hasMath) await loadMathJax();
	const fences: Promise<void>[] = [];
	const build = (frag: DocumentFragment, piece: InertPiece): void => {
		if (piece.kind === "code") frag.createEl("code", { text: piece.text });
		else if (piece.kind === "fence" && piece.markdown !== undefined) {
			const box = frag.createDiv();
			// A fence that fails to render falls back to plain code alone.
			fences.push(
				renderFence(piece.markdown, box).catch(() => {
					box.empty();
					box.createEl("pre").createEl("code", { text: piece.text });
				})
			);
		} else if (piece.kind === "fence") frag.createEl("pre").createEl("code", { text: piece.text });
		else if (piece.kind === "math") frag.appendChild(withoutRemoteStyles(renderMath(piece.text, piece.display)));
		else frag.appendText(piece.text);
	};
	for (const [node, entry] of written) {
		// A copy another plugin made, or text it changed, stays as it is.
		if (!root.contains(node) || node.data !== entry.data) continue;
		const piece = entry.piece;
		if (piece) node.replaceWith(createFragment((frag) => build(frag, piece)));
		else node.data = entry.original;
	}
	const walker = root.doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const hits: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode())
		if (node.instanceOf(Text) && node.data.includes(cut.token)) hits.push(node);
	for (const node of hits) {
		const parts = splitPlaceholders(node.data, cut);
		const parent = node.parentElement;
		const inCode = parent?.closest("pre, code") != null;
		const fragment = createFragment((frag) => {
			for (const part of parts) {
				if (typeof part === "string") frag.appendText(part);
				else if (inCode) frag.appendText(part.source);
				else build(frag, part);
			}
		});
		// A block's placeholder is a paragraph of its own; the block replaces it.
		const only = parts.length === 1 && typeof parts[0] !== "string" ? parts[0] : null;
		const block = only?.kind === "fence" || (only?.kind === "math" && only.display);
		if (block && parent?.tagName === "P" && parent.childNodes.length === 1) parent.replaceWith(fragment);
		else node.replaceWith(fragment);
	}
	// Every attribute: a link's href and a footnote's id hold colons too.
	for (const el of Array.from(root.querySelectorAll("*")))
		for (const { name, value } of Array.from(el.attributes))
			if (value.includes(cut.token)) el.setAttribute(name, attributeValue(name, value, cut));
	try {
		await Promise.all(fences);
	} finally {
		if (hasMath) await finishRenderMath();
	}
}

/**
 * MathJax output before it is attached: a style that would fetch (MathJax's
 * filter keeps `cursor`, which takes `url()`) is dropped, as is any source
 * attribute. `inert-markdown` already cuts the commands that set styles;
 * this holds if one is missed.
 */
function withoutRemoteStyles(math: HTMLElement): HTMLElement {
	for (const el of [math, ...Array.from(math.querySelectorAll("*"))]) {
		const style = `${el.getAttribute("style") ?? ""} ${el.instanceOf(HTMLElement) ? el.style.cssText : ""}`;
		if (loadsResource(style)) el.removeAttribute("style");
		for (const name of ["src", "srcset", "xlink:href"]) el.removeAttribute(name);
	}
	return math;
}
