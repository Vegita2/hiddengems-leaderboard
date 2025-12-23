import { safeText, escapeHtml, formatNumber, formatInteger, formatSignedInteger, truncateText, loadBots, loadAvailableDates, loadDayData, formatBotLabel } from './utils.js';
import { DataTable } from './vendor-datatables.js';
import './components/navbar.js';
import './components/alerts.js';

const dateSelect = document.querySelector('#dateSelect');
const roundModeSelect = document.querySelector('#roundMode');
const searchInput = document.querySelector('#indexSearch');
const stageBadge = document.querySelector('#stageBadge');
const seedBadge = document.querySelector('#seedBadge');
const countBadge = document.querySelector('#countBadge');
const roundSeedsCard = document.querySelector('#roundSeedsCard');
const roundSeedsTable = document.querySelector('#roundSeedsTable');
const roundSeedsTableBody = document.querySelector('#roundSeedsTable tbody');
const alertsComponent = document.querySelector('hg-alerts');

/** @type {import('../types/types').Bot[]} */
let bots = [];

let dataTable;
let currentDay = null;

function destroyTable() {
	if (!dataTable) {
		return;
	}
	dataTable.destroy();
	dataTable = undefined;
}

/**
 * @param {import('../types/types').LeaderboardEntry} entry
 * @param {number} rank
 * @param {Array<Map<number, number>>} roundRanks
 * @param {number[]} roundBestScores
 * @param {number[]} overallBestScores
 */
function rowFromEntry(entry, rank, roundRanks, roundBestScores, overallBestScores, roundMode) {
	const bot = bots[entry.id] || {};
	const row = {
		isStudent: Boolean(bot.student),
		rank,
		bot: formatBotLabel(bot, bot.id, 22),
		score: formatInteger(entry.score),
		gu: formatNumber(entry.gu, 2),
		fc: formatNumber(entry.fc, 2),
		author: safeText(bot.author),
		location: safeText(bot.location),
		language: safeText(bot.language),
		id: safeText(bot.id),
	};

	for (let i = 0; i < roundRanks.length; i += 1) {
		const rankByBot = roundRanks[i];
		row[`roundRank_${i}`] = rankByBot.get(entry.id) ?? '';
		const score = Number(entry.rounds?.[i]?.s);
		if (roundMode === 'relative' || roundMode === 'overall-relative') {
			const bestScores = roundMode === 'overall-relative' ? overallBestScores : roundBestScores;
			const baseline = bestScores?.[i];
			if (Number.isFinite(score) && Number.isFinite(baseline)) {
				row[`round_${i}`] = score - baseline;
			} else {
				row[`round_${i}`] = '';
			}
			continue;
		}
		if (roundMode === 'score') {
			row[`round_${i}`] = Number.isFinite(score) ? score : '';
			continue;
		}
		row[`round_${i}`] = rankByBot.get(entry.id) ?? '';
	}

	return row;
}

/**
 * @param {import('../types/types').Leaderboard} day
 */
function buildRoundRanks(day) {
	const roundSeeds = Array.isArray(day.roundSeeds) ? day.roundSeeds : [];
	const roundRanks = roundSeeds.map(() => new Map());
	const roundBestScores = roundSeeds.map(() => 0);
	const overallBestScores = roundSeeds.map(() => 0);
	let bestEntry = null;
	for (const entry of day.entries) {
		if (!bestEntry || Number(entry.score) > Number(bestEntry.score)) {
			bestEntry = entry;
		}
	}
	for (let i = 0; i < roundSeeds.length; i += 1) {
		const scores = [];
		for (const entry of day.entries) {
			const score = Number(entry.rounds?.[i]?.s);
			if (Number.isFinite(score)) {
				scores.push({ id: entry.id, score });
			}
		}
		scores.sort((a, b) => b.score - a.score);
		if (scores.length) {
			roundBestScores[i] = scores[0].score;
		}
		for (let index = 0; index < scores.length; index += 1) {
			roundRanks[i].set(scores[index].id, index + 1);
		}
	}
	if (bestEntry) {
		for (let i = 0; i < roundSeeds.length; i += 1) {
			const bestScore = Number(bestEntry.rounds?.[i]?.s);
			overallBestScores[i] = Number.isFinite(bestScore) ? bestScore : 0;
		}
	}
	return { roundSeeds, roundRanks, roundBestScores, overallBestScores };
}

function buildColumns(roundSeeds, roundMode) {
	const baseColumns = [
		{ title: 'Rank', data: 'rank', render: (d) => escapeHtml(d) },
		{ title: 'Bot', data: 'bot', render: (d) => escapeHtml(d) },
		{ title: 'Score', data: 'score', render: (d) => escapeHtml(d) },
		{ title: 'GU', data: 'gu', render: (d) => escapeHtml(d) },
		{ title: 'FC', data: 'fc', render: (d) => escapeHtml(d) },
	];

	const roundColumns = roundMode === 'hide' ? [] : roundSeeds.map((seed, index) => ({
		title: `${index + 1}`,
		data: `round_${index}`,
		rankData: `roundRank_${index}`,
		render: (d, type) => {
			if (type === 'sort' || type === 'type') {
				if (roundMode === 'score' || roundMode === 'relative' || roundMode === 'overall-relative') {
					return d === '' ? Number.NEGATIVE_INFINITY : Number(d);
				}
				return d === '' ? Number.POSITIVE_INFINITY : Number(d);
			}
			if (roundMode === 'score') {
				return escapeHtml(formatInteger(d));
			}
			if (roundMode === 'relative' || roundMode === 'overall-relative') {
				return escapeHtml(formatSignedInteger(d));
			}
			return escapeHtml(d);
		},
		orderable: true,
		searchable: false,
		className: 'rank-cell',
		isRound: true,
		isRoundDiff: roundMode === 'relative' || roundMode === 'overall-relative',
	}));

	const metaColumns = [
		{
			title: 'Author',
			data: 'author',
			render: (data, type) => {
				const author = safeText(data);
				if (type !== 'display') return escapeHtml(author);
				const short = truncateText(author, 20);
				return short === author ? escapeHtml(short) : `<span title="${escapeHtml(author)}">${escapeHtml(short)}</span>`;
			},
		},
		{
			title: 'Location',
			data: 'location',
			render: (data, type) => {
				const location = safeText(data);
				if (type !== 'display') return escapeHtml(location);
				const short = truncateText(location, 15);
				return short === location ? escapeHtml(short) : `<span title="${escapeHtml(location)}">${escapeHtml(short)}</span>`;
			},
		},
		{ title: 'Language', data: 'language', render: (d) => escapeHtml(d) },
	];

	return [...baseColumns, ...roundColumns, ...metaColumns];
}

function renderTable(columns, rows) {
	destroyTable();

	const oldTable = document.querySelector('#leaderboard');
	const table = oldTable.cloneNode(false);
	table.innerHTML = '<thead><tr></tr></thead><tbody></tbody>';
	oldTable.replaceWith(table);

	const headerRow = table.querySelector('thead tr');
	for (const col of columns) {
		const th = document.createElement('th');
		th.textContent = col.title;
		headerRow.append(th);
	}

	const roundColumnIndexes = [];
	let applyDiffColors = false;
	for (let i = 0; i < columns.length; i += 1) {
		if (columns[i].isRound) {
			roundColumnIndexes.push(i);
			if (columns[i].isRoundDiff) {
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
		rowCallback: (row, data) => {
			row.classList.toggle('non-student', !data.isStudent);
			const cells = row.querySelectorAll('td');
			for (const colIndex of roundColumnIndexes) {
				const cell = cells[colIndex];
				if (!cell) {
					continue;
				}
				cell.classList.remove(...rankClasses);
				cell.classList.remove('diff-positive', 'diff-negative');
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
		columns,
		deferRender: true,
		paging: true,
		pageLength: 100,
		lengthMenu: [[25, 50, 100, 250, -1], [25, 50, 100, 250, 'All']],
		order: [[2, 'desc']],
		scrollX: true,
		layout: {
			topStart: null,
			topEnd: null,
			bottomStart: 'info',
			bottomEnd: 'paging'
		}
	});

	if (searchInput) {
		dataTable.search(searchInput.value).draw();
	}

}

/**
 * @param {import('../types/types').Leaderboard} day
 */
function setBadges(day) {
	stageBadge.textContent = day.stage ? day.stage : 'Stage: n/a';
	seedBadge.textContent = day.seed ? `Seed: ${day.seed}` : 'Seed: n/a';
	countBadge.textContent = `Entries: ${day.entries.length}`;
}

/**
 * @param {import('../types/types').Leaderboard} day
 */
function setSelectedDay(day) {
	currentDay = day;
	setBadges(day);
	if (roundSeedsTable && roundSeedsTableBody && roundSeedsCard) {
		const roundSeeds = Array.isArray(day.roundSeeds) ? day.roundSeeds : [];
		if (roundSeeds.length) {
			const headerCells = ['<th>Round</th>', ...roundSeeds.map((seed, index) => `<th>${index + 1}</th>`)];
			roundSeedsTable.querySelector('thead tr').innerHTML = headerCells.join('');
			const cells = ['<td>Seed</td>', ...roundSeeds.map((seed) => `<td>${escapeHtml(seed)}</td>`)];
			roundSeedsTableBody.innerHTML = `<tr>${cells.join('')}</tr>`;
			roundSeedsCard.classList.remove('d-none');
		} else {
			roundSeedsTable.querySelector('thead tr').innerHTML = '';
			roundSeedsTableBody.innerHTML = '';
			roundSeedsCard.classList.add('d-none');
		}
	}
	const sortedEntries = [...day.entries].sort((a, b) => b.score - a.score);
	const { roundSeeds, roundRanks, roundBestScores, overallBestScores } = buildRoundRanks(day);
	const roundMode = roundModeSelect?.value || 'rank';
	const rows = sortedEntries.map((entry, index) => rowFromEntry(entry, index + 1, roundRanks, roundBestScores, overallBestScores, roundMode));
	const columns = buildColumns(roundSeeds, roundMode);
	renderTable(columns, rows);
}

/**
 * @param {Array<{date: string, stage: string|null, stageKey: string|null, color: string|null}>} dates
 */
function fillDateSelect(dates) {
	dateSelect.innerHTML = '';
	for (const dateInfo of dates) {
		const option = document.createElement('option');
		option.value = dateInfo.date;
		// Display format: "2025-10-07 | System Check (stage-0@0.1)"
		let displayText = dateInfo.date;
		if (dateInfo.stage && dateInfo.stageKey) {
			displayText = `${dateInfo.date} | ${dateInfo.stage} (${dateInfo.stageKey})`;
		} else if (dateInfo.stage) {
			displayText = `${dateInfo.date} | ${dateInfo.stage}`;
		}
		option.textContent = displayText;

		// Set background color if available
		if (dateInfo.color) {
			option.style.backgroundColor = dateInfo.color;
			// Set text color to white for better contrast on dark backgrounds
			option.style.color = '#ffffff';
		}

		dateSelect.append(option);
	}
}

async function main() {
	try {
		// Load bots and available dates in parallel
		const [botsData, dates] = await Promise.all([
			loadBots(),
			loadAvailableDates()
		]);
		bots = botsData;

		if (dates.length === 0) throw new Error('No dates found in stages.json');

		fillDateSelect(dates);
		const latestDateInfo = dates[dates.length - 1];
		dateSelect.value = latestDateInfo.date;

		// Load and display the latest day
		const latestDay = await loadDayData(latestDateInfo.date);
		setSelectedDay(latestDay);

		searchInput?.addEventListener('input', () => {
			dataTable?.search(searchInput.value).draw();
		});

		dateSelect.addEventListener('change', async () => {
			const selectedDate = dateSelect.value;
			try {
				const day = await loadDayData(selectedDate);
				setSelectedDay(day);
			} catch (error) {
				alertsComponent?.showError(error instanceof Error ? error.message : String(error));
			}
		});

		roundModeSelect?.addEventListener('change', () => {
			if (currentDay) {
				setSelectedDay(currentDay);
			}
		});
	} catch (error) {
		alertsComponent?.showError(error instanceof Error ? error.message : String(error));
	}
}

main();
