import { Component, MarkdownView, TFolder, type App, type Editor, type TAbstractFile, type TFile } from "obsidian";
import {
	findMentionedPaths,
	selectionLines,
	sendContext,
	type LineRange,
	type NoteGraph,
	type NoteSelection,
	type SendContext,
	type VaultEntry,
} from "./context-format";
import type { ComposerData } from "./state/tab";

/** The active note and folder the context chips name, and the lines selected in that note's editor. */
export interface ContextTargets {
	file: TFile | null;
	folder: TFolder | null;
	selection: LineRange | null;
}

/**
 * Gathers the context block's inputs from Obsidian (DES-003 Context block and
 * chips): the active note (the last focused Markdown view's file, else the
 * workspace's active file) and its editor selection, the active folder (the
 * one last clicked in the file explorer, reset when a note takes focus, else
 * the note's parent), the note's properties and links from `metadataCache`,
 * and the vault paths `@` mentions name. `context-format` builds the text.
 */
export class ContextBuilder extends Component {
	/** Folder last selected in the file explorer; overrides the note's parent. */
	private selectedFolder: TFolder | null = null;
	private editorView: MarkdownView | null = null;

	constructor(
		private readonly app: App,
		/** The active note or folder changed, or a vault item was renamed: the chips naming them follow. */
		private readonly onChanged: () => void
	) {
		super();
	}

	onload(): void {
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view instanceof MarkdownView) {
					this.editorView = leaf.view;
					// A note took focus: follow its parent folder again.
					this.selectedFolder = null;
				}
				this.onChanged();
			})
		);
		// A renamed note, folder or attached item: the chips show its new name.
		this.registerEvent(this.app.vault.on("rename", () => this.onChanged()));
		// No workspace event reports a folder selected in the file explorer, so
		// its DOM is read: folder rows carry `data-path` (DES-003 Data and security).
		this.registerDomEvent(document, "click", (evt) => {
			const target = evt.target instanceof HTMLElement ? evt.target : null;
			const path = target?.closest(".nav-folder-title[data-path]")?.getAttribute("data-path");
			if (!path) return;
			const folder = this.app.vault.getAbstractFileByPath(path);
			if (folder instanceof TFolder && folder.path !== "/") {
				this.selectedFolder = folder;
				this.onChanged();
			}
		});
	}

	/** The last focused Markdown view: its file, selection and editor (vault tools, starters). */
	get lastEditorView(): MarkdownView | null {
		return this.editorView;
	}

	targets(): ContextTargets {
		const file = this.editorView?.file ?? this.app.workspace.getActiveFile();
		const parent = file?.parent && file.parent.path !== "/" ? file.parent : null;
		const selection = file && this.editorView?.file === file ? noteSelection(this.editorView.editor) : null;
		return {
			file,
			folder: this.selectedFolder ?? parent,
			selection: selection?.text.trim() ? { from: selection.from, to: selection.to } : null,
		};
	}

	/** What a send carries for a tab's chips and attachments (DES-003 Composer, step 7). */
	forSend(composer: Readonly<ComposerData<TAbstractFile>>, text: string, withContext: boolean): SendContext {
		const { file, folder } = this.targets();
		const chips = { note: composer.includeNote, folder: composer.includeFolder, links: composer.includeLinks };
		const editor = this.editorView?.file ? this.editorView.editor : null;
		const mentions = text.includes("@")
			? findMentionedPaths(text, this.app.vault.getAllLoadedFiles().map(entryOf))
			: [];
		return sendContext(
			{
				note: file ? { path: file.path, name: file.name } : null,
				folder: folder ? { path: folder.path, name: folder.name } : null,
				chips,
				selection: withContext && chips.note && file && editor ? noteSelection(editor) : null,
				graph: withContext && chips.links && file ? this.noteGraph(file) : null,
				attached: composer.attached.map(entryOf),
			},
			withContext,
			mentions
		);
	}

	/** The note's properties, resolved links and embeds, backlinks and unresolved links. */
	private noteGraph(file: TFile): NoteGraph {
		const { metadataCache } = this.app;
		const cache = metadataCache.getFileCache(file);
		const linksTo: string[] = [];
		const broken: string[] = [];
		for (const link of [...(cache?.links ?? []), ...(cache?.frontmatterLinks ?? [])]) {
			const target = metadataCache.getFirstLinkpathDest(link.link, file.path);
			if (target) linksTo.push(target.path);
			else broken.push(link.link);
		}
		for (const embed of cache?.embeds ?? []) {
			const target = metadataCache.getFirstLinkpathDest(embed.link, file.path);
			if (target) linksTo.push(target.path);
		}
		broken.push(...Object.keys(metadataCache.unresolvedLinks[file.path] ?? {}));
		const linkedFrom = Object.entries(metadataCache.resolvedLinks)
			.filter(([source, targets]) => source !== file.path && Object.prototype.hasOwnProperty.call(targets, file.path))
			.map(([source]) => source);
		return { properties: Object.entries(cache?.frontmatter ?? {}), linksTo, linkedFrom, broken };
	}
}

function entryOf(item: TAbstractFile): VaultEntry {
	return { path: item.path, folder: item instanceof TFolder };
}

/** The editor's selection with the lines it spans as on disk (PRD-001.R12, R13); null when nothing is selected. */
export function noteSelection(editor: Editor): NoteSelection | null {
	const text = editor.getSelection();
	if (!text) return null;
	return { text, ...selectionLines(editor.getCursor("from"), editor.getCursor("to")) };
}
