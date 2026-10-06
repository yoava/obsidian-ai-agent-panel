import { setTooltip } from "obsidian";
import {
	formatTokens,
	isWebLink,
	type CommandReport,
	type ReportAction,
	type ReportSection,
} from "./commands";

/** Rows a table shows before folding the rest behind "Show all". */
const FOLDED_ROWS = 12;

/**
 * Draw a command report into a transcript card, as the same elements its
 * Markdown renders to - a restored transcript shows that Markdown, so both
 * share the transcript's table styling. Row buttons appear only when
 * `onAction` is given, i.e. while the card is live.
 */
export function renderReport(
	el: HTMLElement,
	report: CommandReport,
	onAction?: (action: ReportAction, button: HTMLButtonElement) => void
): void {
	el.empty();
	const body = el.createDiv({ cls: "ai-agent-panel-report" });
	body.createEl("p").createEl("strong", { text: report.title });
	if (report.lead) body.createEl("p", { text: report.lead });
	if (report.meter) renderMeter(body, report.meter);
	for (const section of report.sections) {
		if (section.heading) body.createEl("p").createEl("strong", { text: section.heading });
		if (section.rows.length === 0) {
			if (section.empty) body.createEl("p").createEl("em", { text: section.empty });
			continue;
		}
		if (section.columns) renderTable(body, section, section.columns, onAction);
		else {
			const listEl = body.createEl("ul");
			for (const { cells } of section.rows) {
				const item = listEl.createEl("li");
				item.createEl("strong", { text: `${cells[0] ?? ""}:` });
				item.appendText(` ${cells.slice(1).join(" · ")}`);
			}
		}
	}
	for (const note of report.notes ?? [])
		body.createEl("p", { cls: "ai-agent-panel-report-note", text: note });
	const links = (report.links ?? []).filter((link) => isWebLink(link.href));
	if (links.length) {
		const line = body.createEl("p");
		links.forEach((link, i) => {
			if (i > 0) line.appendText(" · ");
			line.createEl("a", { text: link.label, href: link.href, cls: "external-link" });
		});
	}
}

function renderMeter(parent: HTMLElement, meter: NonNullable<CommandReport["meter"]>): void {
	const bar = parent.createDiv({ cls: "ai-agent-panel-report-meter" });
	const legend = parent.createDiv({ cls: "ai-agent-panel-report-legend" });
	meter.segments.forEach((segment, i) => {
		const color = segment.reserved ? "is-reserved" : `is-c${i % 6}`;
		const width = (segment.tokens / Math.max(1, meter.max)) * 100;
		const seg = bar.createDiv({ cls: `ai-agent-panel-report-segment ${color}` });
		seg.style.setProperty("width", `${Math.min(100, width)}%`);
		setTooltip(seg, `${segment.label}: ${formatTokens(segment.tokens)}`);
		const item = legend.createSpan({ cls: "ai-agent-panel-report-legend-item" });
		item.createSpan({ cls: `ai-agent-panel-report-swatch ${color}` });
		item.appendText(`${segment.label} ${formatTokens(segment.tokens)}`);
	});
}

function renderTable(
	parent: HTMLElement,
	section: ReportSection,
	columns: string[],
	onAction?: (action: ReportAction, button: HTMLButtonElement) => void
): void {
	const withActions = !!onAction && section.rows.some((row) => row.actions?.length);
	const wrap = parent.createDiv({ cls: "ai-agent-panel-report-table" });
	const table = wrap.createEl("table");
	const head = table.createEl("thead").createEl("tr");
	for (const column of columns) head.createEl("th", { text: column });
	if (withActions) head.createEl("th");
	const tbody = table.createEl("tbody");
	const rowEls = section.rows.map((row) => {
		const tr = tbody.createEl("tr");
		columns.forEach((_, i) => {
			const td = tr.createEl("td");
			if (i === 0 && row.status)
				td.createSpan({ cls: `ai-agent-panel-report-dot is-${row.status}` });
			td.appendText(row.cells[i] ?? "");
		});
		if (withActions) {
			const td = tr.createEl("td", { cls: "ai-agent-panel-report-actions" });
			for (const action of row.actions ?? []) {
				const button = td.createEl("button", { text: action.label });
				button.addEventListener("click", () => onAction?.(action, button));
			}
		}
		return tr;
	});
	if (rowEls.length <= FOLDED_ROWS + 2) return;
	for (const tr of rowEls.slice(FOLDED_ROWS)) tr.addClass("ai-agent-panel-hidden");
	const more = wrap.createEl("button", {
		cls: "ai-agent-panel-report-more",
		text: `Show all ${rowEls.length}`,
	});
	more.addEventListener("click", () => {
		for (const tr of rowEls) tr.removeClass("ai-agent-panel-hidden");
		more.remove();
	});
}
