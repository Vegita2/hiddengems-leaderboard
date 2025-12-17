const dateSelect = document.querySelector("#dateSelect");
const stageBadge = document.querySelector("#stageBadge");
const seedBadge = document.querySelector("#seedBadge");
const countBadge = document.querySelector("#countBadge");
const loadError = document.querySelector("#loadError");
const serveHint = document.querySelector("#serveHint");

function setVisible(element, visible) {
	element.classList.toggle("d-none", !visible);
}

function formatNumber(value, digits = 2) {
	if (value === null || value === undefined || value === "") return "";
	const number = Number(value);
	if (!Number.isFinite(number)) return String(value);
	return number.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatInteger(value) {
	if (value === null || value === undefined || value === "") return "";
	const number = Number(value);
	if (!Number.isFinite(number)) return String(value);
	return number.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function safeText(value) {
	if (value === null || value === undefined) return "";
	return String(value);
}

function escapeHtml(value) {
	return safeText(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function showError(message) {
	loadError.textContent = message;
	setVisible(loadError, true);
}

function isLikelyFileUrl() {
	return window.location.protocol === "file:";
}

function normalizeDay(day) {
	const entries = Array.isArray(day.entries) ? day.entries : [];
	const sortedEntries = [...entries].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
	return {
		date: safeText(day.date),
		stage: safeText(day.stage),
		seed: safeText(day.seed),
		entries: sortedEntries,
	};
}

function rowFromEntry(entry, rank) {
	const emoji = entry.emoji ? `${entry.emoji} ` : "";
	const commit = safeText(entry.commit);
	return {
		isStudent: Boolean(entry.student),
		rank,
		bot: `${emoji}${safeText(entry.bot)}`,
		score: formatInteger(entry.score),
		gu: formatNumber(entry.gu, 2),
		cf: formatNumber(entry.cf, 2),
		fc: formatNumber(entry.fc, 2),
		author: safeText(entry.author),
		location: safeText(entry.location),
		language: safeText(entry.language),
		commit: commit ? commit.slice(0, 8) : "",
		commitFull: commit,
	};
}

let dataTable;
function initTable() {
	dataTable = new DataTable("#leaderboard", {
		data: [],
		rowCallback: (row, data) => {
			row.classList.toggle("non-student", !data.isStudent);
		},
		columns: [
			{ title: "Rank", data: "rank", render: (d) => escapeHtml(d) },
			{ title: "Bot", data: "bot", render: (d) => escapeHtml(d) },
			{ title: "Score", data: "score", render: (d) => escapeHtml(d) },
			{ title: "GU", data: "gu", render: (d) => escapeHtml(d) },
			{ title: "CF", data: "cf", render: (d) => escapeHtml(d) },
			{ title: "FC", data: "fc", render: (d) => escapeHtml(d) },
			{ title: "Author", data: "author", render: (d) => escapeHtml(d) },
			{ title: "Location", data: "location", render: (d) => escapeHtml(d) },
			{ title: "Language", data: "language", render: (d) => escapeHtml(d) },
			{
				title: "Commit",
				data: "commit",
				render: (data, _type, row) =>
					data
						? `<span class="font-monospace" title="${escapeHtml(row.commitFull)}">${escapeHtml(data)}</span>`
						: "",
			},
		],
		deferRender: true,
		paging: false,
		order: [[2, "desc"]],
	});
}

function setBadges(day) {
	stageBadge.textContent = day.stage ? day.stage : "Stage: n/a";
	seedBadge.textContent = day.seed ? `Seed: ${day.seed}` : "Seed: n/a";
	countBadge.textContent = `Entries: ${day.entries.length}`;
}

function setSelectedDay(day) {
	setBadges(day);
	const rows = day.entries.map((entry, index) => rowFromEntry(entry, index + 1));
	dataTable.clear();
	dataTable.rows.add(rows);
	dataTable.draw();
}

function fillDateSelect(days) {
	dateSelect.innerHTML = "";
	for (const day of days) {
		const option = document.createElement("option");
		option.value = day.date;
		option.textContent = day.date;
		dateSelect.append(option);
	}
}

async function loadData() {
	if (isLikelyFileUrl()) {
		setVisible(serveHint, true);
	}

	const response = await fetch("./data.json", { cache: "no-store" });
	if (!response.ok) throw new Error(`Failed to fetch data.json (${response.status})`);
	const raw = await response.json();
	if (!Array.isArray(raw)) throw new Error("data.json must be a JSON array of day objects");

	const days = raw.map(normalizeDay).filter((d) => d.date);
	days.sort((a, b) => a.date.localeCompare(b.date));
	return days;
}

async function main() {
	try {
		initTable();
		const days = await loadData();
		if (days.length === 0) throw new Error("No days found in data.json");

		fillDateSelect(days);
		const latest = days[days.length - 1];
		dateSelect.value = latest.date;
		setSelectedDay(latest);

		dateSelect.addEventListener("change", () => {
			const selected = days.find((d) => d.date === dateSelect.value);
			if (!selected) return;
			setSelectedDay(selected);
		});
	} catch (error) {
		showError(error instanceof Error ? error.message : String(error));
	}
}

main();
