import {
	finishRenderMath,
	loadMathJax,
	MarkdownRenderer,
	renderMath,
	type App,
	type Component,
} from "obsidian";
import { attributeValue, cutForRender, loadsResource, splitPlaceholders, type RenderCut } from "../inert-markdown";

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
	const cut = cutForRender(markdown);
	await MarkdownRenderer.render(app, cut.markdown, el, "", owner);
	if (!live()) return;
	await restoreInert(el, cut, (fence, into) =>
		live() ? MarkdownRenderer.render(app, fence, into, "", owner) : Promise.resolve()
	);
}

/**
 * Swap the cut's placeholders for elements built here, so no renderer or
 * post processor ever saw the code they hold. An allowlisted fence is
 * rendered alone from the fence `inert-markdown` built, math through
 * MathJax. Inside rendered code (an indented block) a placeholder comes back
 * as the Markdown it replaced.
 */
async function restoreInert(
	root: HTMLElement,
	cut: RenderCut,
	renderFence: (markdown: string, into: HTMLElement) => Promise<void>
): Promise<void> {
	if (cut.pieces.length === 0) return;
	const hasMath = cut.pieces.some((piece) => piece.kind === "math");
	if (hasMath) await loadMathJax();
	const walker = root.doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const hits: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode())
		if (node.instanceOf(Text) && node.data.includes(cut.token)) hits.push(node);
	const fences: Promise<void>[] = [];
	for (const node of hits) {
		const parts = splitPlaceholders(node.data, cut);
		const parent = node.parentElement;
		const inCode = parent?.closest("pre, code") != null;
		const fragment = createFragment((frag) => {
			for (const part of parts) {
				if (typeof part === "string") frag.appendText(part);
				else if (inCode) frag.appendText(part.source);
				else if (part.kind === "code") frag.createEl("code", { text: part.text });
				else if (part.kind === "fence" && part.markdown !== undefined) {
					const box = frag.createDiv();
					// A fence that fails to render falls back to plain code alone.
					fences.push(
						renderFence(part.markdown, box).catch(() => {
							box.empty();
							box.createEl("pre").createEl("code", { text: part.text });
						})
					);
				} else if (part.kind === "fence") frag.createEl("pre").createEl("code", { text: part.text });
				else if (part.kind === "math") frag.appendChild(withoutRemoteStyles(renderMath(part.text, part.display)));
				else frag.appendText(part.text);
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
