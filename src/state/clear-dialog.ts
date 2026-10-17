/**
 * The question a `/clear` asks while agents or background tasks run
 * (PRD-001.R38; DES-003 Stop and clear dialog): the counts from the tab's
 * task list, the title they make and the fixed words. Pure, so it is tested
 * in plain Node.
 */

/** The answer to the stop question: stop and clear, clear without stopping (nothing runs any more), or leave everything as it was. */
export type StopAnswer = "stop" | "clear" | "cancel";

/** What the CLI reports of a task that the count needs. */
export interface CountedTask {
	taskType?: string;
}

/** The task type the CLI gives a subagent; every other task counts as a background task. */
export const AGENT_TASK_TYPE = "local_agent";

export interface TaskCounts {
	agents: number;
	tasks: number;
}

export const STOP_BODY = "Clearing stops them. What they reported so far stays above, dimmed.";
export const STOP_CONFIRM = "Stop and clear";
export const STOP_CANCEL = "Cancel";
/** Shown in the messages when the 15 s bound passed or the CLI exited first; nothing was cleared. */
export const STOP_FAILED = "Could not stop every agent, so the context was not cleared.";

/**
 * What to do with a stop question now: ask (the tab is shown and no question
 * is open), wait until the tab is shown, or answer no because a question is
 * already open (opening a second popover on the same trigger would only close
 * the first).
 */
export function stopAskMode(shown: boolean, open: boolean): "ask" | "wait" | "refuse" {
	if (!shown) return "wait";
	return open ? "refuse" : "ask";
}

/**
 * An answer that is settled once: `resolve` runs first, so whoever waits goes
 * on, then `after` (returning focus), whose throw is logged and changes
 * nothing. Later answers are ignored.
 */
export function settleOnce(resolve: (answer: StopAnswer) => void, after: () => void): (answer: StopAnswer) => void {
	let done = false;
	return (answer) => {
		if (done) return;
		done = true;
		resolve(answer);
		try {
			after();
		} catch (err) {
			console.error("AI Agent Panel: returning focus failed", err);
		}
	};
}

/** The agents and the other tasks among `tasks`. */
export function countTasks(tasks: readonly CountedTask[]): TaskCounts {
	const agents = tasks.filter((task) => task.taskType === AGENT_TASK_TYPE).length;
	return { agents, tasks: tasks.length - agents };
}

/**
 * "1 agent is still running", "2 background tasks are still running", or for
 * both kinds the two counts joined by "and"; null when nothing runs.
 */
export function stopTitle(counts: TaskCounts): string | null {
	const parts: string[] = [];
	if (counts.agents > 0) parts.push(`${counts.agents} ${counts.agents === 1 ? "agent" : "agents"}`);
	if (counts.tasks > 0) parts.push(`${counts.tasks} ${counts.tasks === 1 ? "background task" : "background tasks"}`);
	if (parts.length === 0) return null;
	const verb = parts.length === 1 && parts[0].startsWith("1 ") ? "is" : "are";
	return `${parts.join(" and ")} ${verb} still running`;
}
