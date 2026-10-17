import { Component } from "obsidian";
import { modeName, type MenuMode, type ModeEntry } from "../../settings-core";
import { radioGroup, type PopoverContent, type PopoverFocus } from "../dom";

export interface PermissionData {
	/** `offeredModes`: Bypass only while enabled. */
	modes: ReadonlyArray<{ value: MenuMode } & ModeEntry>;
	/** The shown mode's menu value; null for a mode the CLI reported that the menu does not offer. */
	current: MenuMode | null;
}

/** "Permissions" (PRD-002.R8): the modes, the current one checked, Auto-approve and Bypass in red. */
export class PermissionPopover extends Component implements PopoverContent {
	readonly title = "Permissions";
	readonly menu = true;

	constructor(
		private readonly data: PermissionData,
		private readonly onPick: (mode: MenuMode) => void
	) {
		super();
	}

	render(el: HTMLElement, picked: () => void): PopoverFocus {
		const first = radioGroup(
			this,
			el,
			"Permission mode",
			this.data.modes.map((mode) => ({
				value: mode.value,
				label: mode.long,
				name: modeName(mode),
				icon: mode.icon,
				checked: mode.value === this.data.current,
				warn: mode.warn,
			})),
			(value) => {
				picked();
				this.onPick(value);
			},
			"mod-list"
		);
		return { first };
	}
}
