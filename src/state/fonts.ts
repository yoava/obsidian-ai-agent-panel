/** The family the panel's interface text is registered under; `styles.css` names it in `--ai-agent-panel-font-ui`. */
export const FAMILY_UI = "AI Agent Panel Geist";

/** The monospace family, named in `--ai-agent-panel-font-mono`. */
export const FAMILY_MONO = "AI Agent Panel Geist Mono";

/** What the latin subset of both fonts covers (fontsource's `unicode-range` for it). */
const LATIN_RANGE =
	"U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

export interface FaceDescriptors {
	weight: string;
	display: "swap";
	unicodeRange: string;
}

/** The `FontFace` surface the registry uses. */
export interface LoadableFace {
	load(): Promise<unknown>;
}

/** The `document.fonts` surface the registry uses. */
export interface FontHost<F> {
	fonts: { add(face: F): unknown; delete(face: F): unknown };
}

/** The faces' bytes as `data:` URLs. */
export interface FontData {
	ui: string;
	mono: string;
}

/**
 * The panel's two faces in each document that shows it (ADR-017 Typography):
 * added once per document, removed when the document goes. Documents and the
 * `FontFace` factory are injected, so the logic runs in plain Node.
 */
export class FontRegistry<D extends FontHost<F>, F extends LoadableFace> {
	private readonly faces = new Map<D, F[]>();

	constructor(
		private readonly data: FontData,
		private readonly makeFace: (doc: D, family: string, source: string, descriptors: FaceDescriptors) => F
	) {}

	/** Register the faces in `doc` unless they already are. A load settling later changes nothing. */
	ensure(doc: D): void {
		if (this.faces.has(doc)) return;
		const descriptors: FaceDescriptors = { weight: "100 900", display: "swap", unicodeRange: LATIN_RANGE };
		const made = [
			this.makeFace(doc, FAMILY_UI, `url(${this.data.ui})`, descriptors),
			this.makeFace(doc, FAMILY_MONO, `url(${this.data.mono})`, descriptors),
		];
		this.faces.set(doc, made);
		for (const face of made) {
			doc.fonts.add(face);
			face.load().catch(() => undefined);
		}
	}

	/** Remove the faces from `doc`; none registered is a no-op. */
	dispose(doc: D): void {
		const made = this.faces.get(doc);
		if (!made) return;
		this.faces.delete(doc);
		for (const face of made) doc.fonts.delete(face);
	}

	disposeAll(): void {
		for (const doc of [...this.faces.keys()]) this.dispose(doc);
	}

	/** The documents holding the faces now. */
	documents(): D[] {
		return [...this.faces.keys()];
	}
}
