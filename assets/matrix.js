import { safeText, escapeHtml, loadBots, loadAvailableDates, loadDayData, formatDisplayDate, formatBotLabel, formatInteger, formatSignedInteger } from './utils.js';
import { initDateRangeSelectors } from './date-range.js';
import { DataTable } from './vendor-datatables.js';
import './components/navbar.js';
import './components/alerts.js';

const startDateInput = document.querySelector('#startDate');
const endDateInput = document.querySelector('#endDate');
const stageSelect = document.querySelector('#stageSelect');
const stageKeySelect = document.querySelector('#stageKeySelect');
const dayModeSelect = document.querySelector('#dayMode');
const searchInput = document.querySelector('#matrixSearch');
const daysBadge = document.querySelector('#daysBadge');
const botsBadge = document.querySelector('#botsBadge');
const alertsComponent = document.querySelector('hg-alerts');

let dataTable;
let currentDays = [];
let botsById = {};

function destroyTable() {
	if (!dataTable) {
		return;
	}
	dataTable.destroy();
	dataTable = undefined;
}

function buildMatrix(daysInRange, botsById, dayMode) {
	const dayDates = daysInRange.map((d) => d.date);

	const perDayRank = new Map();
	const perDayScore = new Map();
	const perDayGit = new Map();
	const bestScoresByDate = new Map();
	for (const day of daysInRange) {
		const rankByBot = new Map();
		const scoreByBot = new Map();
		const gitByBot = new Map();
		let bestScore = null;
		for (let index = 0; index < day.entries.length; index += 1) {
			const entry = day.entries[index];
			const rank = index + 1;
			const key = safeText(entry.id); // Use ID as the key
			rankByBot.set(key, rank);
			const score = Number(entry.score);
			if (Number.isFinite(score)) {
				scoreByBot.set(key, score);
				if (bestScore === null || score > bestScore) {
					bestScore = score;
				}
			}
			if (entry.git) {
				gitByBot.set(key, String(entry.git));
			}
		}
		perDayRank.set(day.date, rankByBot);
		perDayScore.set(day.date, scoreByBot);
		perDayGit.set(day.date, gitByBot);
		bestScoresByDate.set(day.date, bestScore);
	}

	const botMeta = new Map();
	for (const day of daysInRange) {
		for (const entry of day.entries) {
			const key = safeText(entry.id); // Use ID as the key
			if (!botMeta.has(key)) {
				const bot = botsById[entry.id] || {};
				const label = formatBotLabel(bot, entry.id, 22); // Fallback to ID if name not found
				botMeta.set(key, { label, isStudent: Boolean(bot.student) });
			}
		}
	}

	const botMedians = new Map();
	let bestBotKey = null;
	let bestBotMedian = null;
	let bestBotLabel = '';
	for (const [key, meta] of botMeta.entries()) {
		const ranks = [];
		for (const date of dayDates) {
			const rank = perDayRank.get(date)?.get(key);
			if (typeof rank === 'number') {
				ranks.push(rank);
			}
		}
		let median = '';
		if (ranks.length) {
			ranks.sort((a, b) => a - b);
			const mid = Math.floor(ranks.length / 2);
			median = ranks.length % 2 === 0
				? (ranks[mid - 1] + ranks[mid]) / 2
				: ranks[mid];
		}
		botMedians.set(key, median);
		if (typeof median === 'number') {
			if (bestBotMedian === null || median < bestBotMedian) {
				bestBotMedian = median;
				bestBotKey = key;
				bestBotLabel = meta.label;
			} else if (median === bestBotMedian && meta.label.localeCompare(bestBotLabel) < 0) {
				bestBotKey = key;
				bestBotLabel = meta.label;
			}
		}
	}

	const overallScoresByDate = new Map();
	if (bestBotKey) {
		for (const date of dayDates) {
			overallScoresByDate.set(date, perDayScore.get(date)?.get(bestBotKey));
		}
	}

	const rows = [];
	for (const [key, meta] of botMeta.entries()) {
		const row = { isStudent: meta.isStudent, bot: meta.label };
		for (const date of dayDates) {
			const rank = perDayRank.get(date)?.get(key);
			const score = perDayScore.get(date)?.get(key);
			const rankKey = `rank_${date}`;
			row[rankKey] = typeof rank === 'number' ? rank : '';
			if (dayMode === 'score') {
				row[date] = Number.isFinite(score) ? score : '';
				continue;
			}
			if (dayMode === 'git') {
				row[date] = perDayGit.get(date)?.get(key) ?? '';
				continue;
			}
			if (dayMode === 'relative' || dayMode === 'overall-relative') {
				const baseline = dayMode === 'overall-relative'
					? overallScoresByDate.get(date)
					: bestScoresByDate.get(date);
				const hasScore = Number.isFinite(score);
				const hasBaseline = Number.isFinite(baseline);
				if (hasScore && hasBaseline) {
					row[date] = score - baseline;
					row[`score_${date}`] = score;
					row[`isBaseline_${date}`] = score === baseline;
				} else {
					row[date] = '';
					row[`score_${date}`] = '';
					row[`isBaseline_${date}`] = false;
				}
				continue;
			}
			row[date] = typeof rank === 'number' ? rank : '';
		}
		row.median = botMedians.get(key) ?? '';
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

function renderTable(dayDates, rows, dayMode) {
	destroyTable();

	const oldTable = document.querySelector('#rankMatrix');
	const table = oldTable.cloneNode(false);
	table.innerHTML = '<thead><tr></tr></thead><tbody></tbody>';
	oldTable.replaceWith(table);

	const headerRow = table.querySelector('thead tr');

	const dayColumns = dayDates.map((date) => ({
		title: formatDisplayDate(date),
		data: date,
		rankData: `rank_${date}`,
		isDay: true,
		isDayDiff: dayMode === 'relative' || dayMode === 'overall-relative',
		render: (d, type, row) => {
			if (type === 'sort' || type === 'type') {
				if (dayMode === 'score' || dayMode === 'relative' || dayMode === 'overall-relative') {
					return d === '' ? Number.NEGATIVE_INFINITY : Number(d);
				}
				if (dayMode === 'git') {
					return d ?? '';
				}
				return d === '' ? Number.POSITIVE_INFINITY : Number(d);
			}
			if (dayMode === 'score') {
				return escapeHtml(formatInteger(d));
			}
			if (dayMode === 'git') {
				return escapeHtml(d ?? '');
			}
			if (dayMode === 'relative' || dayMode === 'overall-relative') {
				const isBaseline = Boolean(row?.[`isBaseline_${date}`]);
				if (isBaseline) {
					return escapeHtml(formatInteger(row?.[`score_${date}`]));
				}
				return escapeHtml(formatSignedInteger(d));
			}
			return escapeHtml(d);
		},
		orderable: true,
		searchable: false,
		className: 'rank-cell',
	}));

	const columns = [
		{ title: 'Bot', data: 'bot', render: (d) => escapeHtml(d) },
		...dayColumns,
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

	const dayColumnIndexes = [];
	let applyDiffColors = false;
	for (let i = 0; i < columns.length; i += 1) {
		if (columns[i].isDay) {
			dayColumnIndexes.push(i);
			if (columns[i].isDayDiff) {
				applyDiffColors = true;
			}
		}
	}
	const rankClasses = [];
	for (let i = 1; i <= 10; i += 1) {
		rankClasses.push(`rank-${i}`);
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
			for (const colIndex of dayColumnIndexes) {
				const cell = cells[colIndex];
				if (!cell) {
					continue;
				}

				cell.classList.remove(...rankClasses);
				if (applyDiffColors) {
					cell.classList.remove('diff-positive', 'diff-negative');
				}

				const rankValue = data[columns[colIndex].rankData];
				const rank = typeof rankValue === 'number' ? rankValue : Number(rankValue);
				if (rank && rank <= rankClasses.length) {
					cell.classList.add(rankClasses[rank - 1]);
				}
				if (applyDiffColors) {
					const value = data[columns[colIndex].data];
					const diff = typeof value === 'number' ? value : Number(value);
					if (diff > 0) {
						cell.classList.add('diff-positive');
					} else if (diff < 0) {
						cell.classList.add('diff-negative');
					}
				}
			}
		},
	});

	if (searchInput) {
		dataTable.search(searchInput.value).draw();
	}

	table.addEventListener('draw.dt', () => {
		table.tBodies[0]?.querySelectorAll('tr.shown').forEach((row) => row.classList.remove('shown'));
	});
}

async function main() {
	try {
		// Load bots and available dates in parallel
		const [botsArray, availableDates] = await Promise.all([
			loadBots(),
			loadAvailableDates()
		]);

		// Convert bots array to an object indexed by ID
		botsById = {};
		for (let i = 0; i < botsArray.length; i += 1) {
			const bot = botsArray[i];
			botsById[bot.id] = bot;
			botsById[i] = bot;
		}

		if (availableDates.length === 0) {
			throw new Error('No dates found');
		}

		let dateRange;

		// Update function that loads only the necessary data
		const update = async () => {
			try {
				const datesInRange = dateRange ? dateRange.getDatesInRange() : availableDates;

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
					currentDays = [];
					destroyTable();
					alertsComponent?.showError('No data available for selected date range');
					return;
				}

				// Sort days by date
				days.sort((a, b) => a.date.localeCompare(b.date));

				currentDays = days;
				const dayMode = dayModeSelect?.value || 'rank';
				const { dayDates, rows } = buildMatrix(days, botsById, dayMode);
				daysBadge.textContent = `Days: ${dayDates.length}`;
				botsBadge.textContent = `Bots: ${rows.length}`;
				renderTable(dayDates, rows, dayMode);
			} catch (error) {
				alertsComponent?.showError(error instanceof Error ? error.message : String(error));
			}
		};

		dateRange = initDateRangeSelectors({
			availableDates,
			startDateInput,
			endDateInput,
			stageSelect,
			stageKeySelect,
			onChange: () => void update(),
			debounceMs: 300,
		});

		searchInput?.addEventListener('input', () => {
			dataTable?.search(searchInput.value).draw();
		});

		dayModeSelect?.addEventListener('change', () => {
			if (!currentDays.length) {
				return;
			}
			const dayMode = dayModeSelect.value;
			const { dayDates, rows } = buildMatrix(currentDays, botsById, dayMode);
			daysBadge.textContent = `Days: ${dayDates.length}`;
			botsBadge.textContent = `Bots: ${rows.length}`;
			renderTable(dayDates, rows, dayMode);
		});

		// Initial load
		await update();
	} catch (error) {
		alertsComponent?.showError(error instanceof Error ? error.message : String(error));
	}
}

main();
