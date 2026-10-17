/**
 * A branch's rewind held by the tab (PRD-002.R15, DES-004) until a rewind
 * succeeds, so every session the tab creates meanwhile gets it: a session
 * dropped after a failed rewind (a profile change) must not leave the next
 * fork uncut. Pure, so it is tested in plain Node (tests/state-branch-hold.test.mjs).
 */
export class BranchHold<R, S extends object> {
	private rewind: R | null = null;
	/** The session the rewind was last given to, so asking again does not arm it twice. */
	private givenTo: S | null = null;

	/** A new branch: its rewind replaces any held. */
	set(rewind: R): void {
		this.rewind = rewind;
		this.givenTo = null;
	}

	/** Gives the held rewind to `session` through `arm`, once per session. */
	give(session: S, arm: (rewind: R) => void): void {
		if (this.rewind === null || this.givenTo === session) return;
		this.givenTo = session;
		arm(this.rewind);
	}

	/** The held rewind, if any. */
	get held(): R | null {
		return this.rewind;
	}

	/** A rewind succeeded: nothing is held. */
	cut(): void {
		this.clear();
	}

	/** The resume was dropped or forgotten: no branch is left to make. */
	clear(): void {
		this.rewind = null;
		this.givenTo = null;
	}
}

/**
 * A branch's record still to be written: handed out once, by the send that
 * first writes its rewind, so a branch opened and closed unused stores
 * nothing and a retry does not record it again.
 */
export class BranchIntent<T> {
	private value: T | null = null;

	set(value: T | null): void {
		this.value = value;
	}

	/** The value, once; null after, or when none was set. */
	take(): T | null {
		const value = this.value;
		this.value = null;
		return value;
	}
}
