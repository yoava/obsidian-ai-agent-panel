/**
 * What the "@" list shows of a file or folder (DES-003 Suggests): how much of
 * its name the typed query matches, and the folder it sits in.
 */

/** The leading characters of `name` that the query's last path segment spells, ignoring case; 0 for none. */
export function matchedPrefix(name: string, query: string): number {
	const typed = query.slice(query.lastIndexOf("/") + 1);
	return typed !== "" && name.toLowerCase().startsWith(typed.toLowerCase()) ? typed.length : 0;
}

/** The folder a vault path sits in, as the row shows it: "Projects/", or "" at the vault root. */
export function folderLabel(path: string): string {
	const cut = path.lastIndexOf("/");
	return cut < 0 ? "" : path.slice(0, cut + 1);
}
