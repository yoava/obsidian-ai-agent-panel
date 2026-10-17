import { Component } from "obsidian";
import type { EffortChoice, ModelOption } from "../../models";
import { radioGroup, type PopoverContent, type PopoverFocus, type PopoverShell } from "../dom";

export interface ModelEffortData {
	/** `modelOptions`: the learned list with Default first, plus a configured or picked model it lacks. */
	models: readonly ModelOption[];
	model: string;
	/** `effortChoices` for the selected model. */
	efforts: readonly EffortChoice[];
	effort: string;
}

export interface ModelEffortIntents {
	onPickModel: (value: string) => void;
	onPickEffort: (value: string) => void;
}

/** The effort control's name, which the effort segment opens the popover on (PRD-001.R23). */
export const EFFORT_CONTROL = "effort";

/**
 * "Model and effort" (PRD-001.R22, R23): the models as a radio group, each
 * with the CLI's description where it gave one; the effort levels as a
 * segmented radio group, levels the selected model lacks disabled.
 */
export class ModelEffortPopover extends Component implements PopoverContent {
	readonly title = "Model and effort";
	readonly titleHidden = true;
	readonly menu = true;

	constructor(
		private readonly data: ModelEffortData,
		private readonly intents: ModelEffortIntents
	) {
		super();
	}

	render(el: HTMLElement, picked: () => void, shell: PopoverShell): PopoverFocus {
		const { data, intents } = this;
		el.createDiv({ cls: "ai-agent-panel-popover-label", text: "Model" });
		const models = radioGroup(
			this,
			el,
			"Model",
			data.models.map((option) => ({
				value: option.value,
				label: option.label,
				description: option.description,
				checked: option.value === data.model,
			})),
			(value) => {
				picked();
				intents.onPickModel(value);
			},
			"mod-list"
		);
		const section = el.createDiv({ cls: "ai-agent-panel-popover-section" });
		section.createDiv({ cls: "ai-agent-panel-popover-label", text: "Effort" });
		const effort = radioGroup(
			this,
			section,
			"Reasoning effort",
			data.efforts.map((choice) => ({
				value: choice.value,
				label: choice.short,
				checked: choice.value === data.effort,
				disabled: choice.disabled,
			})),
			(value) => {
				picked();
				intents.onPickEffort(value);
			},
			"mod-segmented"
		);
		shell.footer().createDiv({ cls: "ai-agent-panel-popover-note", text: "Applies from your next message" });
		return { first: models, named: { [EFFORT_CONTROL]: effort } };
	}
}
