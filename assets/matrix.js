import { safeText, escapeHtml, loadBots, loadAvailableDates, loadDayData, formatDisplayDate, truncateText, formatInteger } from './utils.js';
import { DataTable } from './vendor-datatables.js';
import './components/navbar.js';
import './components/alerts.js';

const startDateInput = document.querySelector('#startDate');
const endDateInput = document.querySelector('#endDate');
const stageSelect = document.querySelector('#stageSelect');
const stageKeySelect = document.querySelector('#stageKeySelect');
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
				const label = truncateText(`${emoji}${safeText(bot.name || entry.id)}`, 22); // Fallback to ID if name not found
				botMeta.set(key, { label, isStudent: Boolean(bot.student) });
			}
		}
	}

	const rows = [];
	for (const [key, meta] of botMeta.entries()) {
		const ranks = [];
		const row = { isStudent: meta.isStudent, bot: meta.label };
		const scoresByDate = {};
		const scoreCells = [];
		for (const date of dayDates) {
			const rank = perDayRank.get(date)?.get(key);
			const details = perDayDetails.get(date)?.get(key);
			if (typeof rank === 'number') {
				row[date] = rank;
				ranks.push(rank);
			} else {
				row[date] = '';
			}
			scoresByDate[date] = typeof details?.score === 'number' ? details.score : '';
			const scoreText = escapeHtml(formatInteger(scoresByDate[date]));
			scoreCells.push(`<td class="score-cell">${scoreText}</td>`);
		}
		row._scores = scoresByDate;
		row._scoreRowHtml = `
			<tr class="score-row">
				<td class="score-label">Score</td>
				${scoreCells.join('')}
				<td></td>
			</tr>
		`;
		let median = '';
		if (ranks.length) {
			ranks.sort((a, b) => a - b);
			const mid = Math.floor(ranks.length / 2);
			median = ranks.length % 2 === 0
				? (ranks[mid - 1] + ranks[mid]) / 2
				: ranks[mid];
		}
		row.median = median;
		rows.push(row);
	}

	rows.sort((a, b) => {
		const av = typeof a.median === 'number' ? a.median : Number.POSITIVE_INFINITY;
		const bv = typeof b.median === 'number' ? b.median : Number.POSITIVE_INFINITY;
		if (av !== bv) {
			return av - bv;
		}
		return safeText(a.bot).localeCompare(safeText(b.bot));
	});

	return { dayDates, rows };
}

function renderTable(dayDates, rows) {
	destroyTable();

	const oldTable = document.querySelector('#rankMatrix');
	const table = oldTable.cloneNode(false);
	table.innerHTML = '<thead><tr></tr></thead><tbody></tbody>';
	oldTable.replaceWith(table);

	const headerRow = table.querySelector('thead tr');

	const columns = [
		{ title: 'Bot', data: 'bot', render: (d) => escapeHtml(d) },
		...dayDates.map((date) => ({
			title: formatDisplayDate(date),
			data: date,
			isDay: true,
			render: (d, type) => {
				if (type === 'sort' || type === 'type') {
					return d === '' ? Number.POSITIVE_INFINITY : Number(d);
				}
				return escapeHtml(d);
			},
			orderable: true,
			searchable: false,
			className: 'rank-cell',
		})),
		{
			title: 'median',
			data: 'median',
			render: (d) => (typeof d === 'number' ? escapeHtml(d) : ''),
			orderable: true,
			searchable: false,
			className: 'rank-cell',
		},
	];

	for (const col of columns) {
		const th = document.createElement('th');
		th.textContent = col.title;
		if (col.isDay) {
			th.classList.add('day-column');
		}
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
				const cell = cells[i + 1];
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

	table.addEventListener('draw.dt', () => {
		const scoreRows = table.tBodies[0]?.querySelectorAll('.score-row');
		scoreRows?.forEach((row) => row.remove());
		table.tBodies[0]?.querySelectorAll('tr.shown').forEach((row) => row.classList.remove('shown'));
	});

	table.tBodies[0]?.addEventListener('click', (event) => {
		const tr = event.target instanceof Element ? event.target.closest('tr') : null;
		if (!tr) {
			return;
		}
		if (tr.classList.contains('score-row')) {
			return;
		}
		const nextRow = tr.nextElementSibling;
		if (nextRow && nextRow.classList.contains('score-row')) {
			nextRow.remove();
			tr.classList.remove('shown');
			return;
		}

		const rowData = dataTable.row(tr).data();
		if (!rowData) {
			return;
		}
		tr.insertAdjacentHTML('afterend', rowData._scoreRowHtml);
		tr.classList.add('shown');
	});
}

function clampRange(availableDates, startIso, endIso) {
	const min = availableDates[0]?.date ?? '';
	const max = availableDates[availableDates.length - 1]?.date ?? '';
	let start = startIso || min;
	let end = endIso || max;
	if (start && end && start > end) {
		[start, end] = [end, start];
	}
	return { start, end, min, max };
}

function buildRangeMap(availableDates, keyName) {
	const ranges = new Map();
	const options = [];
	for (const dateInfo of availableDates) {
		const key = safeText(dateInfo[keyName]);
		if (!key) {
			continue;
		}
		if (!ranges.has(key)) {
			ranges.set(key, { start: dateInfo.date, end: dateInfo.date });
			options.push(key);
		} else {
			ranges.get(key).end = dateInfo.date;
		}
	}
	return { ranges, options };
}

function buildStageKeyMap(availableDates) {
	const keysByStage = new Map();
	const allKeys = new Set();
	const stageByKey = new Map();
	for (const dateInfo of availableDates) {
		const stage = safeText(dateInfo.stage);
		const stageKey = safeText(dateInfo.stageKey);
		if (!stageKey) {
			continue;
		}
		allKeys.add(stageKey);
		if (stage && !stageByKey.has(stageKey)) {
			stageByKey.set(stageKey, stage);
		}
		if (!stage) {
			continue;
		}
		if (!keysByStage.has(stage)) {
			keysByStage.set(stage, new Set());
		}
		keysByStage.get(stage).add(stageKey);
	}
	return { keysByStage, allKeys, stageByKey };
}

function fillSelectOptions(select, options, allLabel, includeAll = true) {
	if (!select) {
		return;
	}
	select.innerHTML = '';
	if (includeAll) {
		const allOption = document.createElement('option');
		allOption.value = '';
		allOption.textContent = allLabel;
		select.append(allOption);
	}
	for (const option of options) {
		const item = document.createElement('option');
		item.value = option;
		item.textContent = option;
		select.append(item);
	}
	select.value = '';
}

function updateStageKeyOptions(stageKeySelectInput, stageKeyMap, stageValue, selectedKey = '') {
	if (!stageKeySelectInput) {
		return;
	}
	const stageKeys = stageValue ? stageKeyMap.keysByStage.get(stageValue) : null;
	const options = stageKeys ? Array.from(stageKeys) : Array.from(stageKeyMap.allKeys);
	options.sort((a, b) => a.localeCompare(b));
	fillSelectOptions(stageKeySelectInput, options, 'All stage keys');
	if (selectedKey && options.includes(selectedKey)) {
		stageKeySelectInput.value = selectedKey;
	}
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
		for (let i = 0; i < botsArray.length; i += 1) {
			const bot = botsArray[i];
			botsById[bot.id] = bot;
			botsById[i] = bot;
		}

		if (availableDates.length === 0) {
			throw new Error('No dates found');
		}

		// Determine the min/max dates from available dates
		const minDate = availableDates[0].date;
		const maxDate = availableDates[availableDates.length - 1].date;

		// Set initial date range (default to last 7 days or available range)
		const defaultStart = availableDates.length > 7
			? availableDates[availableDates.length - 7].date
			: minDate;
		const defaultEnd = maxDate;

		// Clamp the initial range
		const { start, end, min, max } = clampRange(availableDates, defaultStart, defaultEnd);
		startDateInput.min = min;
		startDateInput.max = max;
		endDateInput.min = min;
		endDateInput.max = max;
		startDateInput.value = start;
		endDateInput.value = end;

		const stageRanges = buildRangeMap(availableDates, 'stage');
		const stageKeyRanges = buildRangeMap(availableDates, 'stageKey');
		const stageKeyMap = buildStageKeyMap(availableDates);
		stageRanges.options.sort((a, b) => a.localeCompare(b));
		fillSelectOptions(stageSelect, stageRanges.options, 'All stages', false);
		updateStageKeyOptions(stageKeySelect, stageKeyMap, '');

		let lastStageKey = '';
		let lastStage = '';
		for (let i = availableDates.length - 1; i >= 0; i -= 1) {
			const key = safeText(availableDates[i].stageKey);
			if (key) {
				lastStageKey = key;
				lastStage = safeText(availableDates[i].stage);
				break;
			}
		}
		if (lastStageKey) {
			if (stageSelect && lastStage) {
				stageSelect.value = lastStage;
			}
			updateStageKeyOptions(stageKeySelect, stageKeyMap, lastStage, lastStageKey);
			const range = stageKeyRanges.ranges.get(lastStageKey);
			if (range) {
				startDateInput.value = range.start;
				endDateInput.value = range.end;
			}
		}

		// Update function that loads only the necessary data
		const update = async () => {
			try {
				const startIso = parseIsoDate(startDateInput.value);
				const endIso = parseIsoDate(endDateInput.value);

				// Filter available dates to only those in range
				const datesInRange = availableDates.filter((d) => inRange(d.date, startIso, endIso));

				// Show loading state
				daysBadge.textContent = `Days: Loading...`;
				botsBadge.textContent = `Bots: Loading...`;

				// Load data only for dates in the selected range
				const days = [];
				const loadPromises = datesInRange.map(async (dateInfo) => {
					try {
						const dayData = await loadDayData(dateInfo.date);
						return {
							date: dayData.date,
							stage: dayData.stage,
							seed: dayData.seed,
							entries: dayData.entries
						};
					} catch (error) {
						// Skip dates that don't have data files yet
						console.log(`Skipping ${dateInfo.date}: ${error.message}`);
						return null;
					}
				});

				const loadedDays = await Promise.all(loadPromises);
				// Filter out null values (failed loads)
				for (const day of loadedDays) {
					if (day !== null) {
						days.push(day);
					}
				}

				if (days.length === 0) {
					daysBadge.textContent = `Days: 0`;
					botsBadge.textContent = `Bots: 0`;
					destroyTable();
					alertsComponent?.showError('No data available for selected date range');
					return;
				}

				// Sort days by date
				days.sort((a, b) => a.date.localeCompare(b.date));

				const { dayDates, rows } = buildMatrix(days, botsById);
				daysBadge.textContent = `Days: ${dayDates.length}`;
				botsBadge.textContent = `Bots: ${rows.length}`;
				renderTable(dayDates, rows);
			} catch (error) {
				alertsComponent?.showError(error instanceof Error ? error.message : String(error));
			}
		};

		// Add debouncing to prevent excessive loading
		let updateTimeout;
		const debouncedUpdate = () => {
			clearTimeout(updateTimeout);
			updateTimeout = setTimeout(update, 300);
		};

		startDateInput.addEventListener('change', debouncedUpdate);
		endDateInput.addEventListener('change', debouncedUpdate);
		stageSelect?.addEventListener('change', () => {
			if (stageKeySelect) {
				updateStageKeyOptions(stageKeySelect, stageKeyMap, stageSelect.value);
				stageKeySelect.value = '';
			}
			const range = stageRanges.ranges.get(stageSelect.value);
			if (!range) {
				return;
			}
			startDateInput.value = range.start;
			endDateInput.value = range.end;
			debouncedUpdate();
		});
		stageKeySelect?.addEventListener('change', () => {
			const selectedKey = stageKeySelect.value;
			const stage = selectedKey
				? (stageKeyMap.stageByKey.get(selectedKey) || '')
				: (stageSelect?.value || '');
			if (stageSelect && stage) {
				stageSelect.value = stage;
			}
			updateStageKeyOptions(stageKeySelect, stageKeyMap, stage || '', selectedKey);
			const range = selectedKey
				? stageKeyRanges.ranges.get(selectedKey)
				: stageRanges.ranges.get(stageSelect?.value || '');
			if (!range) {
				return;
			}
			startDateInput.value = range.start;
			endDateInput.value = range.end;
			debouncedUpdate();
		});

		// Initial load
		await update();
	} catch (error) {
		alertsComponent?.showError(error instanceof Error ? error.message : String(error));
	}
}

main();
