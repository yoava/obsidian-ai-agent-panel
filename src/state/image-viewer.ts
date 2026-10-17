/**
 * The image viewer's state (DES-003 Image viewer; PRD-001.R14, R16): which
 * image of a message's or tool result's images shows, fitted or at actual
 * size, its caption, and the names of the thumbnails that open it. The
 * viewer is `confirm-modal`'s `ImageViewerModal`; it only draws what this returns.
 */

import type { StepImage } from "./tab";

/** One image the viewer can show: a composer or prompt image as held, or a tool result's (`stepViewerImages`). */
export interface ViewerImage {
	name: string;
	mediaType: string;
	base64: string;
	bytes: number;
}

export interface ViewerState {
	readonly images: readonly ViewerImage[];
	readonly index: number;
	/** At actual size, scrolling when larger than the window; false: fitted to it. */
	readonly actual: boolean;
}

/** The viewer on `images[index]`, fitted; an index outside the list is clamped into it. */
export function openViewer(images: readonly ViewerImage[], index: number): ViewerState {
	return { images, index: Math.min(Math.max(0, Math.trunc(index)), Math.max(0, images.length - 1)), actual: false };
}

/** Left (-1) or Right (+1): the previous or next image, fitted; at either end the state as it is. */
export function stepViewer(state: ViewerState, delta: -1 | 1): ViewerState {
	const index = state.index + delta;
	if (index < 0 || index >= state.images.length) return state;
	return { ...state, index, actual: false };
}

/** A click on the image: actual size, or fitted again. */
export function toggleSize(state: ViewerState): ViewerState {
	return { ...state, actual: !state.actual };
}

/** The image shown; undefined only for an empty list. */
export function shownImage(state: ViewerState): ViewerImage | undefined {
	return state.images[state.index];
}

/**
 * The caption: "2 of 3" when there are several, the name, the file size,
 * and the pixel size once the image has loaded ("2 of 3 · chart.png · 245 KB · 1920 × 1080").
 */
export function viewerCaption(state: ViewerState, pixels: { width: number; height: number } | null): string {
	const image = shownImage(state);
	if (!image) return "";
	const parts = state.images.length > 1 ? [`${state.index + 1} of ${state.images.length}`] : [];
	parts.push(image.name, formatBytes(image.bytes));
	if (pixels) parts.push(`${pixels.width} × ${pixels.height}`);
	return parts.join(" · ");
}

/** The image's own button, a toggle pressed while the image shows at actual size. */
export const ACTUAL_SIZE_LABEL = "Actual size";

/** A thumbnail button's accessible name. */
export function thumbLabel(name: string): string {
	return `View ${name}`;
}

/** A tool result's images, which carry no file name: "Tool result image N" among the row's, their size from the bytes. */
export function stepViewerImages(images: readonly StepImage[]): ViewerImage[] {
	return images.map((image, index) => ({
		name: `Tool result image ${index + 1}`,
		mediaType: image.mediaType,
		base64: image.data,
		bytes: base64Bytes(image.data),
	}));
}

/** The bytes base64 text decodes to, padding left out. */
export function base64Bytes(base64: string): number {
	const length = base64.replace(/[^A-Za-z0-9+/]/g, "").length;
	return Math.floor((length * 3) / 4);
}

/** "512 B", "245 KB", "3.2 MB" (the image chip and the caption). */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
