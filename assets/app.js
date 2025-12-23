import { safeText, escapeHtml, formatNumber, formatInteger, truncateText, loadBots, loadAvailableDates, loadDayData } from './utils.js';
import { DataTable } from './vendor-datatables.js';
import './components/navbar.js';
import './components/alerts.js';

const dateSelect = document.querySelector('#dateSelect');
const stageBadge = document.querySelector('#stageBadge');
const seedBadge = document.querySelector('#seedBadge');
const countBadge = document.querySelector('#countBadge');
const alertsComponent = document.querySelector('hg-alerts');

/** @type {import('../types/types').Bot[]} */
let bots = [];

/**
 * @param {import('../types/types').LeaderboardEntry} entry
 * @param {number} rank
 */
function rowFromEntry(entry, rank) {
	const bot = bots[entry.id] || {};
	const emoji = bot.emoji ? `${bot.emoji} ` : '';
	return {
		isStudent: Boolean(bot.student),
		rank,
		bot: `${emoji}${safeText(bot.name)}`,
		score: formatInteger(entry.score),
		gu: formatNumber(entry.gu, 2),
		fc: formatNumber(entry.fc, 2),
		author: safeText(bot.author),
		location: safeText(bot.location),
		language: safeText(bot.language),
		id: safeText(bot.id),
	};
}

let dataTable;
function initTable() {
	dataTable = new DataTable('#leaderboard', {
		data: [],
		rowCallback: (row, data) => {
			row.classList.toggle('non-student', !data.isStudent);
		},
		columns: [
			{ title: 'Rank', data: 'rank', render: (d) => escapeHtml(d) },
			{ title: 'Bot', data: 'bot', render: (d) => escapeHtml(d) },
			{ title: 'Score', data: 'score', render: (d) => escapeHtml(d) },
			{ title: 'GU', data: 'gu', render: (d) => escapeHtml(d) },
			{ title: 'FC', data: 'fc', render: (d) => escapeHtml(d) },
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
			{
				title: 'ID',
				data: 'id',
				render: (data) => `<span class="font-monospace small">${escapeHtml(data)}</span>`,
			},
		],
		deferRender: true,
		paging: false,
		order: [[2, 'desc']],
		layout: {
			topStart: null,
			topEnd: null,
			bottomStart: 'info',
			bottomEnd: null
		}
	});
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
	setBadges(day);
	const sortedEntries = [...day.entries].sort((a, b) => b.score - a.score);
	const rows = sortedEntries.map((entry, index) => rowFromEntry(entry, index + 1));
	dataTable.clear();
	dataTable.rows.add(rows);
	dataTable.draw();
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
		initTable();

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

		dateSelect.addEventListener('change', async () => {
			const selectedDate = dateSelect.value;
			try {
				const day = await loadDayData(selectedDate);
				setSelectedDay(day);
			} catch (error) {
				alertsComponent?.showError(error instanceof Error ? error.message : String(error));
			}
		});
	} catch (error) {
		alertsComponent?.showError(error instanceof Error ? error.message : String(error));
	}
}

main();
