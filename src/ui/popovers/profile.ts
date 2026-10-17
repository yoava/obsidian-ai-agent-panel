import { Component } from "obsidian";
import { profileLabel, type CliProfile } from "../../settings-core";
import { radioGroup, type PopoverContent, type PopoverFocus } from "../dom";

export interface ProfileData {
	profiles: ReadonlyArray<Pick<CliProfile, "id" | "name">>;
	/** The tab's profile id. */
	current: string;
}

/** "CLI profile" (PRD-001.R3): the profiles, the current one checked; the pick's rules are DES-002's. */
export class ProfilePopover extends Component implements PopoverContent {
	readonly title = "CLI profile";
	readonly menu = true;

	constructor(
		private readonly data: ProfileData,
		private readonly onPick: (profileId: string) => void
	) {
		super();
	}

	render(el: HTMLElement, picked: () => void): PopoverFocus {
		const first = radioGroup(
			this,
			el,
			"CLI profile",
			this.data.profiles.map((profile) => ({
				value: profile.id,
				label: profileLabel(profile, true),
				checked: profile.id === this.data.current,
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
