/**
 * Run a save at most once at a time. A call made while a save is in flight
 * shares the one save queued after it, which reads the state when it runs, so
 * an older snapshot can never be written after a newer one. One loop runs the
 * saves and claims the queued one in the same step that settles the last, so
 * no call can start a save beside it.
 */
export function serializeSaves(write: () => Promise<void>): () => Promise<void> {
	let active = false;
	let queued: Waiter | null = null;

	const drain = async (first: Waiter): Promise<void> => {
		let current: Waiter | null = first;
		while (current) {
			try {
				await write();
				current.resolve();
			} catch (err) {
				current.reject(err);
			}
			current = queued;
			queued = null;
		}
		active = false;
	};

	return () => {
		if (active) {
			queued ??= waiter();
			return queued.promise;
		}
		active = true;
		const first = waiter();
		void drain(first);
		return first.promise;
	};
}

interface Waiter {
	promise: Promise<void>;
	resolve(): void;
	reject(err: unknown): void;
}

function waiter(): Waiter {
	let resolve!: () => void;
	let reject!: (err: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
