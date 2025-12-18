const startDateInput = document.querySelector('#startDate');
const endDateInput = document.querySelector('#endDate');
const daysBadge = document.querySelector('#daysBadge');
const botsBadge = document.querySelector('#botsBadge');
const loadError = document.querySelector('#loadError');
const serveHint = document.querySelector('#serveHint');
const canvas = document.querySelector('#rankChart');

function setVisible(element, visible) {
	element.classList.toggle('d-none', !visible);
}

function safeText(value) {
	if (value === null || value === undefined) return '';
	return String(value);
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
	if (!value) return null;
	return value;
}

function inRange(dayIso, startIso, endIso) {
	if (startIso && dayIso < startIso) return false;
	if (endIso && dayIso > endIso) return false;
	return true;
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

function hashString(text) {
	let hash = 0;
	for (let i = 0; i < text.length; i += 1) {
		hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
	}
	return hash;
}

function colorForKey(key) {
	const hash = hashString(key);
	const hue = hash % 360;
	const sat = 70;
	const light = 55;
	return `hsl(${hue}deg ${sat}% ${light}%)`;
}

function buildRankSeries(daysInRange) {
	const dayDates = daysInRange.map((d) => d.date);

	const rankByDay = new Map(); // date -> Map(botKey -> rank)
	for (const day of daysInRange) {
		const perBot = new Map();
		for (let index = 0; index < day.entries.length; index += 1) {
			const entry = day.entries[index];
			perBot.set(botKey(entry), index + 1);
		}
		rankByDay.set(day.date, perBot);
	}

	const botMeta = new Map(); // botKey -> label
	for (const day of daysInRange) {
		for (const entry of day.entries) {
			const key = botKey(entry);
			if (!botMeta.has(key)) botMeta.set(key, botLabel(entry));
		}
	}

	const datasets = [];
	for (const [key, label] of botMeta.entries()) {
		const color = colorForKey(key);
		const data = dayDates.map((date) => {
			const rank = rankByDay.get(date)?.get(key);
			return typeof rank === 'number' ? rank : null;
		});
		datasets.push({
			label,
			data,
			borderColor: color,
			backgroundColor: color,
			borderWidth: 1,
			pointRadius: 0,
			pointHitRadius: 6,
			tension: 0,
			spanGaps: false,
		});
	}

	datasets.sort((a, b) => a.label.localeCompare(b.label));
	return { dayDates, datasets };
}

async function loadData() {
	if (isLikelyFileUrl()) {
		setVisible(serveHint, true);
	}

	const response = await fetch('./data.json', { cache: 'no-store' });
	if (!response.ok) throw new Error(`Failed to fetch data.json (${response.status})`);
	const raw = await response.json();
	if (!Array.isArray(raw)) throw new Error('data.json must be a JSON array of day objects');

	const days = raw.map(normalizeDay).filter((d) => d.date);
	days.sort((a, b) => a.date.localeCompare(b.date));
	return days;
}

let chart;

function destroyChart() {
	if (!chart) return;
	chart.destroy();
	chart = undefined;
}

function registerZoomPlugin() {
	const ChartGlobal = globalThis.Chart;
	if (!ChartGlobal?.register) return;

	const candidates = [
		globalThis.ChartZoom,
		globalThis.zoomPlugin,
		globalThis.chartjsPluginZoom,
		globalThis['chartjs-plugin-zoom'],
	];

	for (const plugin of candidates) {
		const resolved = plugin?.default ?? plugin;
		if (resolved) {
			ChartGlobal.register(resolved);
			return;
		}
	}
}

function formatDisplayDate(isoDate) {
	return `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}`;
}

function renderChart(dayDates, datasets) {
	destroyChart();
	if (!(canvas instanceof HTMLCanvasElement)) {
		throw new Error('Missing chart canvas');
	}
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Unable to get chart context');

	registerZoomPlugin();

	// Limit tick labels when there are many days.
	const maxTicks = 14;
	const step = dayDates.length > maxTicks ? Math.ceil(dayDates.length / maxTicks) : 1;

	chart = new Chart(context, {
		type: 'line',
		data: {
			labels: dayDates,
			datasets,
		},
		options: {
			animation: false,
			maintainAspectRatio: false,
			interaction: { mode: 'nearest', intersect: false },
			plugins: {
				legend: { display: false },
				zoom: {
					pan: {
						enabled: true,
						mode: 'xy',
					},
					limits: {
						x: { min: 'original', max: 'original' },
						y: { min: 'original', max: 'original' },
					},
					zoom: {
						mode: 'y',
						wheel: {
							enabled: true,
						},
						pinch: {
							enabled: false,
						},
					},
				},
				tooltip: {
					callbacks: {
						title: (items) => {
							const raw = items?.[0]?.label ?? '';
							return safeText(raw);
						},
					},
				},
			},
			scales: {
				x: {
					ticks: {
						autoSkip: false,
						callback: (value, index) => {
							if (index % step !== 0) return '';
							const iso = dayDates[index];
							return iso ? formatDisplayDate(iso) : '';
						},
						maxRotation: 0,
					},
					grid: { display: false },
				},
				y: {
					reverse: true,
					title: { display: true, text: 'Rank (1 = best)' },
					ticks: { precision: 0 },
				},
			},
		},
	});
}

async function main() {
	try {
		const days = await loadData();
		if (days.length === 0) throw new Error('No days found in data.json');

		const { start, end, min, max } = clampRange(days);
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

			const { dayDates, datasets } = buildRankSeries(inRangeDays);
			daysBadge.textContent = `Days: ${dayDates.length}`;
			botsBadge.textContent = `Bots: ${datasets.length}`;
			renderChart(dayDates, datasets);
		};

		startDateInput.addEventListener('change', update);
		endDateInput.addEventListener('change', update);
		update();
	} catch (error) {
		showError(error instanceof Error ? error.message : String(error));
	}
}

main();
