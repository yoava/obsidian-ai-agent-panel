import geistUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2";
import geistMonoUrl from "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2";
import { FontRegistry } from "./state/fonts";

/** The registry over real documents and `FontFace`s; the bytes are bundled as `data:` URLs (ADR-017 Typography). */
const registry = new FontRegistry<Document, FontFace>({ ui: geistUrl, mono: geistMonoUrl }, (doc, family, source, descriptors) => {
	// The face belongs to the document's own window, so a pop-out gets its own constructor.
	const FaceOf = doc.defaultView?.FontFace ?? FontFace;
	return new FaceOf(family, source, descriptors);
});

export function disposeFonts(doc: Document): void {
	registry.dispose(doc);
}

export function disposeAllFonts(): void {
	registry.disposeAll();
}

/**
 * Register the faces in `root`'s document now and in whichever window it
 * moves to; the returned function stops following the root.
 */
export function watchFonts(root: HTMLElement): () => void {
	registry.ensure(root.doc);
	return root.onWindowMigrated(() => registry.ensure(root.doc));
}
