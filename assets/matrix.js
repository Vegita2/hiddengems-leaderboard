import { safeText, escapeHtml, loadBots, loadAvailableDates, loadDayData, formatDisplayDate } from './utils.js';
import { DataTable } from './vendor-datatables.js';
import './components/navbar.js';
import './components/alerts.js';

const startDateInput = document.querySelector('#startDate');
const endDateInput = document.querySelector('#endDate');
const daysBadge = document.querySelector('#daysBadge');
const botsBadge = document.querySelector('#botsBadge');
const alertsComponent = document.querySelector('hg-alerts');

function parseIsoDate(value) {
	if (!value) {
		return null;
	}
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

let dataTable;

function destroyTable() {
	if (!dataTable) {
		return;
	}
	dataTable.destroy();
	dataTable = undefined;
}

function buildMatrix(daysInRange, botsById) {
	const dayDates = daysInRange.map((d) => d.date);

	const perDayRank = new Map();
	const perDayDetails = new Map();
	for (const day of daysInRange) {
		const rankByBot = new Map();
		const detailsByBot = new Map();
		for (let index = 0; index < day.entries.length; index += 1) {
			const entry = day.entries[index];
			const rank = index + 1;
			const key = safeText(entry.id); // Use ID as the key
			rankByBot.set(key, rank);
			detailsByBot.set(key, {
				rank,
				score: Number(entry.score) || 0,
				id: safeText(entry.id),
			});
		}
		perDayRank.set(day.date, rankByBot);
		perDayDetails.set(day.date, detailsByBot);
	}

	const botMeta = new Map();
	for (const day of daysInRange) {
		for (const entry of day.entries) {
			const key = safeText(entry.id); // Use ID as the key
			if (!botMeta.has(key)) {
				const bot = botsById[entry.id] || {};
				const emoji = bot.emoji ? `${bot.emoji} ` : '';
				const label = `${emoji}${safeText(bot.name || entry.id)}`; // Fallback to ID if name not found
				botMeta.set(key, { label, isStudent: Boolean(bot.student) });
			}
		}
	}

	const rows = [];
	for (const [key, meta] of botMeta.entries()) {
		let sum = 0;
		let count = 0;
		const row = { isStudent: meta.isStudent, bot: meta.label };
		const timeline = [];
		for (const date of dayDates) {
			const rank = perDayRank.get(date)?.get(key);
			const details = perDayDetails.get(date)?.get(key);
			if (typeof rank === 'number') {
				row[date] = rank;
				sum += rank;
				count += 1;
			} else {
				row[date] = '';
			}
			timeline.push({
				date,
				rank: details?.rank ?? '',
				score: details?.score ?? '',
				id: details?.id ?? '',
			});
		}
		row._timeline = timeline;
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

	return { dayDates, rows };
}

function formatRowDetails(rowData) {
	const timeline = Array.isArray(rowData?._timeline) ? rowData._timeline : [];
	const body = timeline
		.map((item) => {
			const date = escapeHtml(formatDisplayDate(safeText(item.date)));
			const rank = escapeHtml(item.rank);
			const score = escapeHtml(item.score);
			const id = escapeHtml(item.id);

			return `
				<tr>
					<td class="text-nowrap">${date}</td>
					<td class="text-nowrap">${rank}</td>
					<td class="text-nowrap">${score}</td>
					<td class="text-nowrap font-monospace small">${id}</td>
				</tr>
			`;
		})
		.join('');

	return `
		<div class="p-2">
			<div class="table-responsive">
				<table class="table table-sm table-bordered align-middle mb-0">
					<thead>
						<tr>
							<th scope="col">Day</th>
							<th scope="col">Rank</th>
							<th scope="col">Score</th>
							<th scope="col">ID</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		</div>
	`;
}

function renderTable(dayDates, rows) {
	destroyTable();

	const oldTable = document.querySelector('#rankMatrix');
	const table = oldTable.cloneNode(false);
	table.innerHTML = '<thead><tr></tr></thead><tbody></tbody>';
	oldTable.replaceWith(table);

	const headerRow = table.querySelector('thead tr');

	const columns = [
		{ title: 'Rank', data: 'rank', render: (d) => escapeHtml(d), orderable: true, searchable: false, className: 'rank-cell' },
		{ title: 'Bot', data: 'bot', render: (d) => escapeHtml(d) },
		...dayDates.map((date) => ({
			title: formatDisplayDate(date),
			data: date,
			render: (d) => escapeHtml(d),
			orderable: false,
			searchable: false,
			className: 'rank-cell',
		})),
		{
			title: 'Rank average',
			data: 'avg',
			render: (d) => (typeof d === 'number' ? escapeHtml(d.toFixed(2)) : ''),
			orderable: true,
			searchable: false,
			className: 'rank-cell',
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
		paging: true,
		pageLength: 100,
		lengthMenu: [[25, 50, 100, 250, -1], [25, 50, 100, 250, 'All']],
		scrollX: true,
		order: [[columns.length - 1, 'asc']],
		layout: {
			topStart: null,
			topEnd: null,
			bottomStart: 'info',
			bottomEnd: 'paging'
		},
		rowCallback: (row, data) => {
			row.classList.toggle('non-student', !data.isStudent);

			const cells = row.querySelectorAll('td');
			const ranks = [];
			for (let i = 1; i <= 10; i++) {
				ranks.push(`rank-${i}`);
			}
			for (let i = 0; i < dayDates.length; i += 1) {
				const date = dayDates[i];
				const cell = cells[i + 2];
				if (!cell) {
					continue;
				}

				cell.classList.remove(...ranks);

				const value = data[date];
				const rank = typeof value === 'number' ? value : Number(value);
				if (rank) {
					cell.classList.add(ranks[rank - 1]);
				}
			}
		},
	});

	table.tBodies[0]?.addEventListener('click', (event) => {
		const tr = event.target instanceof Element ? event.target.closest('tr') : null;
		if (!tr) {
			return;
		}
		const row = dataTable.row(tr);
		const rowData = row.data();
		if (!rowData) return;
		if (row.child.isShown()) {
			row.child.hide();
			tr.classList.remove('shown');
			return;
		}
		row.child(formatRowDetails(rowData)).show();
		tr.classList.add('shown');
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
	return { start, end, min, max };
}

async function main() {
	try {
		// Load bots and available dates in parallel
		const [botsArray, availableDates] = await Promise.all([
			loadBots(),
			loadAvailableDates()
		]);

		// Convert bots array to an object indexed by ID
		const botsById = {};
		for (const bot of botsArray) {
			botsById[bot.id] = bot;
		}

		if (availableDates.length === 0) {
			throw new Error('No dates found');
		}

		// Load data for all available dates
		const days = [];
		for (const dateInfo of availableDates) {
			try {
				const dayData = await loadDayData(dateInfo.date);
				days.push({
					date: dayData.date,
					stage: dayData.stage,
					seed: dayData.seed,
					entries: dayData.entries
				});
			} catch (error) {
				// Skip dates that don't have data files yet
				console.log(`Skipping ${dateInfo.date}: ${error.message}`);
			}
		}

		if (days.length === 0) {
			throw new Error('No data found');
		}

		const { start, end, min, max } = clampRange(days, '2025-12-10');
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

			const { dayDates, rows } = buildMatrix(inRangeDays, botsById);
			daysBadge.textContent = `Days: ${dayDates.length}`;
			botsBadge.textContent = `Bots: ${rows.length}`;
			renderTable(dayDates, rows);
		};

		startDateInput.addEventListener('change', update);
		endDateInput.addEventListener('change', update);
		update();
	} catch (error) {
		alertsComponent?.showError(error instanceof Error ? error.message : String(error));
	}
}

main();
