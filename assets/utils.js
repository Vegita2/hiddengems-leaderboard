/**
 * Shared utility functions for the Hidden Gems Leaderboard.
 * @module utils
 */

/**
 * Toggle Bootstrap visibility class on an element.
 * @param {Element} element
 * @param {boolean} visible
 */
export function setVisible(element, visible) {
	element.classList.toggle('d-none', !visible);
}

/**
 * Convert null/undefined to empty string.
 * @param {*} value
 * @returns {string}
 */
export function safeText(value) {
	if (value === null || value === undefined) {
		return '';
	}
	return String(value);
}

/**
 * Escape HTML special characters.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
	return safeText(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll('\'', '&#39;');
}

/**
 * Check if running from file:// protocol.
 * @returns {boolean}
 */
export function isLikelyFileUrl() {
	return window.location.protocol === 'file:';
}

/**
 * Normalize a day object from raw data.
 * @param {object} day
 * @returns {object}
 */
export function normalizeDay(day) {
	const entries = Array.isArray(day.entries) ? day.entries : [];
	const sortedEntries = [...entries].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
	return {
		date: safeText(day.date),
		stage: safeText(day.stage),
		seed: safeText(day.seed),
		entries: sortedEntries,
	};
}

/**
 * Get bot key (unique identifier) from entry.
 * @param {object} entry
 * @returns {string}
 */
export function botKey(entry) {
	return safeText(entry.bot);
}

/**
 * Get bot display label with optional emoji.
 * @param {object} entry
 * @returns {string}
 */
export function botLabel(entry) {
	const emoji = entry.emoji ? `${entry.emoji} ` : '';
	return `${emoji}${safeText(entry.bot)}`;
}

/** @type {import('../types/types').Bot[] | null} */
let botsCache = null;

/**
 * Load bots.json (cached).
 * @returns {Promise<import('../types/types').Bot[]>}
 */
export async function loadBots() {
	if (botsCache) {
		return botsCache;
	}
	const response = await fetch('./json/bots.json');
	if (!response.ok) {
		throw new Error(`Failed to fetch bots.json (${response.status})`);
	}
	botsCache = await response.json();
	return botsCache;
}

/**
 * Load leaderboard data for a specific date.
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @returns {Promise<import('../types/types').Leaderboard>}
 */
export async function loadDayData(date) {
	const response = await fetch(`./json/data/data-${date}.json`);
	if (!response.ok) {
		throw new Error(`Failed to fetch data for ${date} (${response.status})`);
	}
	return response.json();
}

/**
 * Load available dates from stages.json with stage information.
 * @returns {Promise<Array<{date: string, stage: string, stageKey: string, color: string}>>}
 */
export async function loadAvailableDates() {
	const response = await fetch('./json/stages.json');
	if (!response.ok) {
		throw new Error(`Failed to fetch stages.json (${response.status})`);
	}
	const stages = await response.json();
	if (!Array.isArray(stages) || stages.length === 0) {
		throw new Error('stages.json must be a non-empty JSON array of stage objects');
	}
	
	// Use the first stage's startDate as the earliest date (stages are sorted)
	const earliestDate = stages[0].startDate;
	if (!earliestDate) {
		throw new Error('First stage in stages.json must have a startDate');
	}
	
	// Use today as the end date
	const today = new Date().toISOString().split('T')[0];

	// Generate all dates between earliest and today (inclusive) with stage information
	const dates = [];
	// Create date in UTC to avoid timezone issues
	const [year, month, day] = earliestDate.split('-').map(Number);
	const current = new Date(Date.UTC(year, month - 1, day));

	while (true) {
		const dateStr = current.toISOString().split('T')[0];

		// Stop after today
		if (dateStr > today) break;
		
		// Find which stage this date belongs to
		const stage = stages.find(s => {
			return dateStr >= s.startDate && dateStr <= s.endDate;
		});
		
		// If we find a stage for this date, add it with stage info, otherwise just add the date
		if (stage) {
			dates.push({
				date: dateStr,
				stage: stage.stage,
				stageKey: stage.stageKey,
				color: stage.color || null
			});
		} else {
			// Date is outside any defined stage (e.g., future dates)
			dates.push({
				date: dateStr,
				stage: null,
				stageKey: null,
				color: null
			});
		}
		
		current.setUTCDate(current.getUTCDate() + 1);
	}
	
	return dates;
}

/**
 * Load and normalize data from data.json (legacy).
 * @param {Element} [serveHint] - Optional element to show file:// warning
 * @returns {Promise<Array>}
 * @deprecated Use loadBots, loadAvailableDates, and loadDayData instead
 */
export async function loadData(serveHint) {
	if (isLikelyFileUrl() && serveHint) {
		setVisible(serveHint, true);
	}
	
	const response = await fetch('./data.json');
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

/**
 * Format a number with locale support.
 * @param {*} value
 * @param {number} digits
 * @returns {string}
 */
export function formatNumber(value, digits = 2) {
	if (value === null || value === undefined || value === '') {
		return '';
	}
	const number = Number(value);
	if (!Number.isFinite(number)) {
		return String(value);
	}
	return number.toLocaleString(undefined, {maximumFractionDigits: digits, minimumFractionDigits: digits});
}

/**
 * Format an integer with locale support.
 * @param {*} value
 * @returns {string}
 */
export function formatInteger(value) {
	if (value === null || value === undefined || value === '') {
		return '';
	}
	const number = Number(value);
	if (!Number.isFinite(number)) {
		return String(value);
	}
	return number.toLocaleString(undefined, {maximumFractionDigits: 0});
}

/**
 * Truncate text with ellipsis.
 * @param {*} value
 * @param {number} maxLength
 * @returns {string}
 */
export function truncateText(value, maxLength) {
	const text = safeText(value);
	if (text.length <= maxLength) {
		return text;
	}
	if (maxLength <= 1) {
		return '…';
	}
	return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * Format ISO date as DD.MM
 * @param {string} isoDate
 * @returns {string}
 */
export function formatDisplayDate(isoDate) {
	return `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}`;
}
