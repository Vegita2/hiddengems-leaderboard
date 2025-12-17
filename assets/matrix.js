const startDateInput = document.querySelector('#startDate');
const endDateInput = document.querySelector('#endDate');
const daysBadge = document.querySelector('#daysBadge');
const botsBadge = document.querySelector('#botsBadge');
const loadError = document.querySelector('#loadError');
const serveHint = document.querySelector('#serveHint');

function setVisible(element, visible) {
	element.classList.toggle('d-none', !visible);
}

function safeText(value) {
	if (value === null || value === undefined) {
		return '';
	}
	return String(value);
}

function escapeHtml(value) {
	return safeText(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll('\'', '&#39;');
}

function showError(message) {
	loadError.textContent = message;
	setVisible(loadError, true);
}

function isLikelyFileUrl() {
	return window.location.protocol === 'file:';
}

function normalizeDay(day) {
	const entries = Array.isArray(day.entries) ? day.entries : [];
	const sortedEntries = [...entries].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
	return {
		date: safeText(day.date),
		entries: sortedEntries,
	};
}

function botKey(entry) {
	return safeText(entry.bot);
}

function botLabel(entry) {
	const emoji = entry.emoji ? `${entry.emoji} ` : '';
	return `${emoji}${safeText(entry.bot)}`;
}

function parseIsoDate(value) {
	if (!value) {
		return null;
	}
	// Expect yyyy-mm-dd (lexicographic order matches chronological)
	return value;
}

function inRange(dayIso, startIso, endIso) {
	if (startIso && dayIso < startIso) {
		return false;
	}
	if (endIso && dayIso > endIso) {
		return false;
	}
	return true;
}

async function loadData() {
	if (isLikelyFileUrl()) {
		setVisible(serveHint, true);
	}
	
	const response = await fetch('./data.json', {cache: 'no-store'});
	if (!response.ok) {
		throw new Error(`Failed to fetch data.json (${response.status})`);
	}
	const raw = await response.json();
	if (!Array.isArray(raw)) {
		throw new Error('data.json must be a JSON array of day objects');
	}
	
	const days = raw.map(normalizeDay).filter((d) => d.date);
	days.sort((a, b) => a.date.localeCompare(b.date));
	return days;
}

let dataTable;

function destroyTable() {
	if (!dataTable) {
		return;
	}
	dataTable.destroy();
	dataTable = undefined;
}

function buildMatrix(daysInRange) {
	const dayDates = daysInRange.map((d) => d.date);
	
	const perDayRank = new Map();
	for (const day of daysInRange) {
		const rankByBot = new Map();
		for (let index = 0; index < day.entries.length; index += 1) {
			const entry = day.entries[index];
			rankByBot.set(botKey(entry), index + 1);
		}
		perDayRank.set(day.date, rankByBot);
	}
	
	const botMeta = new Map(); // botKey -> { label, isStudent }
	for (const day of daysInRange) {
		for (const entry of day.entries) {
			const key = botKey(entry);
			if (!botMeta.has(key)) {
				botMeta.set(key, {label: botLabel(entry), isStudent: Boolean(entry.student)});
			}
		}
	}
	
	const rows = [];
	for (const [key, meta] of botMeta.entries()) {
		let sum = 0;
		let count = 0;
		const row = {isStudent: meta.isStudent, bot: meta.label};
		for (const date of dayDates) {
			const rank = perDayRank.get(date)?.get(key);
			if (typeof rank === 'number') {
				row[date] = rank;
				sum += rank;
				count += 1;
			} else {
				row[date] = '';
			}
		}
		row.avg = count ? sum / count : '';
		rows.push(row);
	}
	
	rows.sort((a, b) => {
		const av = typeof a.avg === 'number' ? a.avg : Number.POSITIVE_INFINITY;
		const bv = typeof b.avg === 'number' ? b.avg : Number.POSITIVE_INFINITY;
		if (av !== bv) {
			return av - bv;
		}
		return safeText(a.bot).localeCompare(safeText(b.bot));
	});
	
	for (let i = 0; i < rows.length; i += 1) {
		rows[i].rank = i + 1;
	}
	
	return {dayDates, rows};
}

function renderTable(dayDates, rows) {
	destroyTable();
	
	const oldTable = document.querySelector('#rankMatrix');
	const table = oldTable.cloneNode(false);
	table.innerHTML = '<thead><tr></tr></thead><tbody></tbody>';
	oldTable.replaceWith(table);
	
	const headerRow = table.querySelector('thead tr');
	
	const columns = [
		{title: 'Rank', data: 'rank', render: (d) => escapeHtml(d), orderable: true, searchable: false},
		{title: 'Bot', data: 'bot', render: (d) => escapeHtml(d)},
		...dayDates.map((date) => ({
			title: `${date.slice(8, 10)}.${date.slice(5, 7)}`,
			data: date,
			render: (d) => escapeHtml(d),
			orderable: false,
			searchable: false,
		})),
		{
			title: 'Rank average',
			data: 'avg',
			render: (d) => (typeof d === 'number' ? escapeHtml(d.toFixed(2)) : ''),
			orderable: true,
			searchable: false,
		},
	];
	
	for (const col of columns) {
		const th = document.createElement('th');
		th.textContent = col.title;
		headerRow.append(th);
	}
	
	dataTable = new DataTable(table, {
		data: rows,
		columns,
		deferRender: true,
		paging: false,
		scrollX: true,
		order: [[columns.length - 1, 'asc']],
		rowCallback: (row, data) => {
			row.classList.toggle('non-student', !data.isStudent);

			const cells = row.querySelectorAll('td');
			for (let i = 0; i < dayDates.length; i += 1) {
				const date = dayDates[i];
				const cell = cells[i + 2];
				if (!cell) {
					continue;
				}

				cell.classList.remove('rank-1', 'rank-2', 'rank-3');

				const value = data[date];
				const rank = typeof value === 'number' ? value : Number(value);
				if (rank === 1) {
					cell.classList.add('rank-1');
				} else if (rank === 2) {
					cell.classList.add('rank-2');
				} else if (rank === 3) {
					cell.classList.add('rank-3');
				}
			}
		},
	});
}

function clampRange(days, startIso, endIso) {
	const min = days[0]?.date ?? '';
	const max = days[days.length - 1]?.date ?? '';
	let start = startIso || min;
	let end = endIso || max;
	if (start && end && start > end) {
		[start, end] = [end, start];
	}
	return {start, end, min, max};
}

async function main() {
	try {
		const days = await loadData();
		if (days.length === 0) {
			throw new Error('No days found in data.json');
		}
		
		const {start, end, min, max} = clampRange(days);
		startDateInput.min = min;
		startDateInput.max = max;
		endDateInput.min = min;
		endDateInput.max = max;
		startDateInput.value = start;
		endDateInput.value = end;
		
		const update = () => {
			const startIso = parseIsoDate(startDateInput.value);
			const endIso = parseIsoDate(endDateInput.value);
			const inRangeDays = days.filter((d) => inRange(d.date, startIso, endIso));
			
			const {dayDates, rows} = buildMatrix(inRangeDays);
			daysBadge.textContent = `Days: ${dayDates.length}`;
			botsBadge.textContent = `Bots: ${rows.length}`;
			renderTable(dayDates, rows);
		};
		
		startDateInput.addEventListener('change', update);
		endDateInput.addEventListener('change', update);
		update();
	} catch (error) {
		showError(error instanceof Error ? error.message : String(error));
	}
}

main();
