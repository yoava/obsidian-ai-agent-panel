import test from "node:test";
import assert from "node:assert/strict";

const {
	API_IMAGE_MEDIA_TYPES,
	MAX_IMAGE_BYTES,
	MAX_IMAGES_PER_MESSAGE,
	collectImages,
	composerFiles,
	imageRefusal,
	notAttachedMessage,
	planSend,
	unreadableRefusal,
} = await import("./.build/attachments.mjs");

const png = { type: "image/png", size: 1000, name: "shot.png" };

test("PRD-001.R14: PNG, JPEG, GIF and WebP attach; the limits are 8 images and 4 MB", () => {
	assert.deepEqual([...API_IMAGE_MEDIA_TYPES].sort(), ["image/gif", "image/jpeg", "image/png", "image/webp"]);
	assert.equal(MAX_IMAGES_PER_MESSAGE, 8);
	assert.equal(MAX_IMAGE_BYTES, 4 * 1024 * 1024);
	for (const type of API_IMAGE_MEDIA_TYPES) assert.equal(imageRefusal({ ...png, type }, 0), null, type);
});

test("PRD-001.R14: an image of another type is refused by name, whatever its size or the count", () => {
	for (const type of ["image/bmp", "image/svg+xml", "image/tiff", "image/heic", "image/avif", "image/jpg", ""]) {
		assert.equal(imageRefusal({ type, size: 10, name: "a.x" }, 0), "a.x is not a PNG, JPEG, GIF or WebP image", type);
	}
	assert.equal(imageRefusal({ type: "image/bmp", size: MAX_IMAGE_BYTES + 1, name: "a.bmp" }, 8), "a.bmp is not a PNG, JPEG, GIF or WebP image");
});

test("PRD-001.R14: 4 MB is the largest size that attaches", () => {
	assert.equal(imageRefusal({ ...png, size: MAX_IMAGE_BYTES }, 0), null);
	assert.equal(imageRefusal({ ...png, size: MAX_IMAGE_BYTES + 1 }, 0), "shot.png is over 4 MB");
});

test("PRD-001.R14: the ninth image is refused, the eighth is not", () => {
	assert.equal(imageRefusal(png, MAX_IMAGES_PER_MESSAGE - 1), null);
	assert.equal(imageRefusal(png, MAX_IMAGES_PER_MESSAGE), "shot.png is over the limit of 8 images per message");
	assert.equal(imageRefusal(png, MAX_IMAGES_PER_MESSAGE + 3), "shot.png is over the limit of 8 images per message");
});

test("PRD-001.R14: a type refusal outranks size, and size outranks the count", () => {
	assert.match(imageRefusal({ type: "image/bmp", size: MAX_IMAGE_BYTES + 1, name: "a" }, 8), /not a PNG/);
	assert.match(imageRefusal({ ...png, size: MAX_IMAGE_BYTES + 1 }, 8), /over 4 MB/);
});

test("PRD-001.R14: a file without a name is called pasted image", () => {
	assert.equal(imageRefusal({ type: "image/bmp", size: 1, name: "" }, 0), "pasted image is not a PNG, JPEG, GIF or WebP image");
	assert.equal(unreadableRefusal(""), "pasted image could not be read");
	assert.equal(unreadableRefusal("a.png"), "a.png could not be read");
});

test("PRD-001.R14: every refusal is listed in one Notice starting Not attached:", () => {
	assert.equal(notAttachedMessage([]), null);
	assert.equal(notAttachedMessage(["a.bmp is not a PNG, JPEG, GIF or WebP image"]), "Not attached: a.bmp is not a PNG, JPEG, GIF or WebP image");
	assert.equal(
		notAttachedMessage(["a.bmp is not a PNG, JPEG, GIF or WebP image", "b.png is over 4 MB", unreadableRefusal("c.png")]),
		"Not attached: a.bmp is not a PNG, JPEG, GIF or WebP image; b.png is over 4 MB; c.png could not be read"
	);
});

test("PRD-001.R14: collectImages checks every file and lists each refusal", async () => {
	// Ten PNGs, then a BMP: a loop that stops at the first refusal misses the last three.
	const files = [
		...Array.from({ length: 10 }, (_, i) => ({ type: "image/png", size: 10, name: `${i + 1}.png` })),
		{ type: "image/bmp", size: 10, name: "late.bmp" },
	];
	const read = [];
	const { images, refusals } = await collectImages(files, 0, async (file) => {
		read.push(file.name);
		return `b64:${file.name}`;
	});
	assert.deepEqual(images.map((image) => image.name), files.slice(0, 8).map((file) => file.name));
	assert.deepEqual(read, files.slice(0, 8).map((file) => file.name));
	assert.deepEqual(refusals, [
		"9.png is over the limit of 8 images per message",
		"10.png is over the limit of 8 images per message",
		"late.bmp is not a PNG, JPEG, GIF or WebP image",
	]);
	assert.equal(
		notAttachedMessage(refusals),
		"Not attached: 9.png is over the limit of 8 images per message; 10.png is over the limit of 8 images per message; late.bmp is not a PNG, JPEG, GIF or WebP image"
	);
});

test("PRD-001.R14: collectImages counts the images already on the message", async () => {
	const files = ["a", "b", "c"].map((name) => ({ type: "image/webp", size: 5, name: `${name}.webp` }));
	const { images, refusals } = await collectImages(files, 6, async () => "x");
	assert.deepEqual(images, [
		{ mediaType: "image/webp", base64: "x", name: "a.webp", bytes: 5 },
		{ mediaType: "image/webp", base64: "x", name: "b.webp", bytes: 5 },
	]);
	assert.deepEqual(refusals, ["c.webp is over the limit of 8 images per message"]);
});

test("PRD-001.R14: collectImages lists a file that cannot be read and keeps the others", async () => {
	const files = [
		{ type: "image/png", size: 1, name: "bad.png" },
		{ type: "image/gif", size: 2, name: "" },
	];
	const { images, refusals } = await collectImages(files, 0, async (file) => {
		if (file.name === "bad.png") throw new Error("denied");
		return "ok";
	});
	assert.deepEqual(images, [{ mediaType: "image/gif", base64: "ok", name: "pasted image", bytes: 2 }]);
	assert.deepEqual(refusals, ["bad.png could not be read"]);
	// An unreadable file takes no place: of nine files, eight still attach.
	const eight = Array.from({ length: 9 }, (_, i) => ({ type: "image/png", size: 1, name: `${i}.png` }));
	const result = await collectImages(eight, 0, async (file) => {
		if (file.name === "0.png") throw new Error("denied");
		return "ok";
	});
	assert.equal(result.images.length, 8);
	assert.deepEqual(result.refusals, ["0.png could not be read"]);
});

test("PRD-001.R14: the composer takes every file of a paste or drop that holds an image, in order", () => {
	const pdf = { type: "application/pdf", size: 10, name: "notes.pdf" };
	const folder = { type: "", size: 0, name: "Projects" };
	assert.deepEqual(composerFiles([png, pdf]), [png, pdf]);
	assert.deepEqual(composerFiles([pdf, folder, png]), [pdf, folder, png]);
	// A refused image type is still an image: it gets a Notice, not a fall-through.
	const bmp = { type: "image/bmp", size: 1, name: "a.bmp" };
	assert.deepEqual(composerFiles([bmp]), [bmp]);
});

test("PRD-001.R14: the composer takes nothing from a paste or drop with no image file", () => {
	assert.deepEqual(composerFiles([]), []);
	assert.deepEqual(composerFiles([{ type: "application/pdf", size: 10, name: "notes.pdf" }]), []);
	assert.deepEqual(composerFiles([{ type: "", size: 0, name: "folder" }, { type: "text/markdown", size: 3, name: "a.md" }]), []);
});

test("PRD-001.R14: in a mixed drop the images attach and each other file is named, in drop order", async () => {
	const files = [
		{ type: "image/png", size: 10, name: "a.png" },
		{ type: "application/pdf", size: 10, name: "notes.pdf" },
		{ type: "image/gif", size: 10, name: "b.gif" },
		{ type: "", size: 0, name: "Projects" },
		{ type: "image/svg+xml", size: 10, name: "c.svg" },
	];
	const { images, refusals } = await collectImages(files, 0, async () => "x");
	assert.deepEqual(images.map((image) => image.name), ["a.png", "b.gif"]);
	assert.equal(
		notAttachedMessage(refusals),
		"Not attached: notes.pdf is not a PNG, JPEG, GIF or WebP image; Projects is not a PNG, JPEG, GIF or WebP image; c.svg is not a PNG, JPEG, GIF or WebP image"
	);
});

test("PRD-001.R14: a file that is not an image takes no place among the 8", async () => {
	const files = [
		{ type: "application/pdf", size: 1, name: "x.pdf" },
		...Array.from({ length: 8 }, (_, i) => ({ type: "image/png", size: 1, name: `${i}.png` })),
	];
	const { images, refusals } = await collectImages(files, 0, async () => "x");
	assert.equal(images.length, 8);
	assert.deepEqual(refusals, ["x.pdf is not a PNG, JPEG, GIF or WebP image"]);
});

test("PRD-001.R14: the Notice names at most 10 files that are not images, then says how many more", async () => {
	const others = Array.from({ length: 13 }, (_, i) => ({ type: "application/pdf", size: 1, name: `${i + 1}.pdf` }));
	const files = [others[0], png, ...others.slice(1)];
	const { images, refusals } = await collectImages(files, 0, async () => "x");
	assert.deepEqual(images.map((image) => image.name), ["shot.png"]);
	assert.equal(refusals.length, 11);
	assert.equal(refusals[0], "1.pdf is not a PNG, JPEG, GIF or WebP image");
	assert.equal(refusals[9], "10.pdf is not a PNG, JPEG, GIF or WebP image");
	assert.equal(refusals[10], "and 3 more");
	assert.match(notAttachedMessage(refusals), /; 10\.pdf is not a PNG, JPEG, GIF or WebP image; and 3 more$/);
});

test("PRD-001.R14: ten files that are not images are all named, with no 'more'", async () => {
	const others = Array.from({ length: 10 }, (_, i) => ({ type: "text/plain", size: 1, name: `${i + 1}.txt` }));
	const { refusals } = await collectImages([png, ...others], 0, async () => "x");
	assert.deepEqual(refusals.map((refusal) => refusal.split(" ")[0]), others.map((file) => file.name));
});

test("PRD-001.R14: image refusals are not capped; only the files that are not images are", async () => {
	const bmps = Array.from({ length: 12 }, (_, i) => ({ type: "image/bmp", size: 1, name: `${i + 1}.bmp` }));
	const { refusals } = await collectImages([png, ...bmps], 0, async () => "x");
	assert.equal(refusals.length, 12);
	assert.ok(refusals.every((refusal) => refusal.endsWith("is not a PNG, JPEG, GIF or WebP image")));
});

const pending = [
	{ mediaType: "image/png", base64: "a", name: "a.png", bytes: 1 },
	{ mediaType: "image/gif", base64: "b", name: "b.gif", bytes: 2 },
];

test("PRD-001.R12: a bare message sends no images and leaves them pending", () => {
	for (const queued of [false, true]) {
		const plan = planSend("/compact", queued, pending);
		assert.deepEqual(plan.send, [], String(queued));
		assert.equal(plan.keep, pending, String(queued));
	}
});

test("PRD-001.R12: a message that is not bare sends the pending images", () => {
	for (const queued of [false, true]) {
		const plan = planSend("summarize this", queued, pending);
		assert.equal(plan.send, pending, String(queued));
		assert.deepEqual(plan.keep, [], String(queued));
	}
	assert.deepEqual(planSend("hello", false, []), { withContext: true, send: [], keep: [] });
});

test("PRD-001.R12: only a message that is neither queued nor bare takes the context block", () => {
	assert.equal(planSend("hello", false, []).withContext, true);
	assert.equal(planSend("hello", true, []).withContext, false);
	assert.equal(planSend("/compact", false, []).withContext, false);
	assert.equal(planSend("/compact", true, []).withContext, false);
	// An image-only message has empty text.
	assert.equal(planSend("", false, pending).withContext, true);
});
