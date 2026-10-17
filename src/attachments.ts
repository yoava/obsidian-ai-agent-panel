/**
 * What the composer attaches and what a send takes along: which pasted or
 * dropped images attach (PRD-001.R14), how each refusal is worded, and which
 * context block and images a message carries (PRD-001.R12). Obsidian-free so
 * tests can drive it.
 */

import { isBareMessage } from "./commands";

/**
 * Image types the API accepts. Also gates which tool-result images the panel
 * draws; anything else is refused or skipped rather than guessed at.
 */
export const API_IMAGE_MEDIA_TYPES: ReadonlySet<string> = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
]);
export const MAX_IMAGES_PER_MESSAGE = 8;
/** Roughly the API's per-image ceiling; the CLI downscales, but not unboundedly. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Files that are not images the Notice names; the rest are counted. */
export const MAX_NAMED_OTHER_FILES = 10;

/** An image waiting in the composer, already base64-encoded for the wire. */
export interface PendingImage {
	mediaType: string;
	base64: string;
	name: string;
	bytes: number;
}

/** The parts of a `File` that decide whether it attaches. */
export interface ImageCandidate {
	type: string;
	size: number;
	name: string;
}

function label(name: string): string {
	return name || "pasted image";
}

/** Why an image cannot join the message, or null. `count` is the images already on it. */
export function imageRefusal(file: ImageCandidate, count: number): string | null {
	if (!API_IMAGE_MEDIA_TYPES.has(file.type)) {
		return `${label(file.name)} is not a PNG, JPEG, GIF or WebP image`;
	}
	if (file.size > MAX_IMAGE_BYTES) return `${label(file.name)} is over 4 MB`;
	if (count >= MAX_IMAGES_PER_MESSAGE) {
		return `${label(file.name)} is over the limit of ${MAX_IMAGES_PER_MESSAGE} images per message`;
	}
	return null;
}

/**
 * The files of a paste or drop that the composer takes (PRD-001.R14): all of
 * them when one has an `image/*` type, so `collectImages` names the others as
 * not attached; none otherwise, and the event is left to Obsidian.
 */
export function composerFiles<F extends { type: string }>(files: readonly F[]): F[] {
	return files.some((file) => file.type.startsWith("image/")) ? [...files] : [];
}

export function unreadableRefusal(name: string): string {
	return `${label(name)} could not be read`;
}

/** The one Notice that lists every refusal, or null when there were none. */
export function notAttachedMessage(refusals: readonly string[]): string | null {
	return refusals.length ? `Not attached: ${refusals.join("; ")}` : null;
}

/**
 * Check every file, in order, against the images already on the message
 * (`count`): the ones that attach, and a refusal for each that does not.
 * `read` returns a file's base64 bytes; a throw makes the file unreadable.
 * Past `MAX_NAMED_OTHER_FILES` files that are not images, the rest are counted
 * in a final "and N more".
 */
export async function collectImages<F extends ImageCandidate>(
	files: readonly F[],
	count: number,
	read: (file: F) => Promise<string>
): Promise<{ images: PendingImage[]; refusals: string[] }> {
	const images: PendingImage[] = [];
	const refusals: string[] = [];
	let others = 0;
	for (const file of files) {
		const refusal = imageRefusal(file, count + images.length);
		if (refusal) {
			if (file.type.startsWith("image/") || ++others <= MAX_NAMED_OTHER_FILES) refusals.push(refusal);
			continue;
		}
		try {
			images.push({
				mediaType: file.type,
				base64: await read(file),
				name: label(file.name),
				bytes: file.size,
			});
		} catch {
			refusals.push(unreadableRefusal(file.name));
		}
	}
	if (others > MAX_NAMED_OTHER_FILES) refusals.push(`and ${others - MAX_NAMED_OTHER_FILES} more`);
	return { images, refusals };
}

/** What one send takes along. */
export interface SendPlan {
	/** Put the context block in front, label the bubble, store the context paths. */
	withContext: boolean;
	/** The pending images that go with this message. */
	send: readonly PendingImage[];
	/** The pending images that stay in the composer for the next message. */
	keep: readonly PendingImage[];
}

/**
 * A mid-turn message is a short correction, so it skips the context block but
 * takes the images. A bare message (a `/` command) takes neither: both would
 * break it, and the images wait (PRD-001.R12).
 */
export function planSend(text: string, queued: boolean, pending: readonly PendingImage[]): SendPlan {
	const bare = isBareMessage(text);
	return {
		withContext: !queued && !bare,
		send: bare ? [] : pending,
		keep: bare ? pending : [],
	};
}
