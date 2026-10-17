import { clearTimer, setTimer, type TimerHandle, type TimerHost } from "../timers";

/**
 * The delayed close of a textarea's popup after its blur (PRD-001.R19): the
 * delay lets a mousedown on a row land first, and a close that comes due after
 * focus returned (the commands button refocuses the textarea) does not run.
 */
export class BlurClose {
	private timer: TimerHandle | undefined;

	constructor(
		private readonly close: () => void,
		private readonly hasFocus: () => boolean,
		private readonly delayMs: number,
		private readonly host?: TimerHost
	) {}

	/** Close after the delay unless focus is back by then; replaces a pending close. */
	schedule(): void {
		this.cancel();
		this.timer = setTimer(
			() => {
				this.timer = undefined;
				if (!this.hasFocus()) this.close();
			},
			this.delayMs,
			this.host
		);
	}

	/** Drop a pending close, as focus returned. */
	cancel(): void {
		clearTimer(this.timer, this.host);
		this.timer = undefined;
	}
}

/** The slice of a textarea that {@link holdsFocus} reads. */
export interface FocusTarget {
	ownerDocument: { activeElement: unknown; hasFocus(): boolean };
}

/** The element is its own document's focused element and that window has focus, so a blur to another window still closes. */
export function holdsFocus(el: FocusTarget & object): boolean {
	return el.ownerDocument.activeElement === el && el.ownerDocument.hasFocus();
}
