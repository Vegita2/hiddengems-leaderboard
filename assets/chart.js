const daysBadge = document.querySelector('#daysBadge');
const botsBadge = document.querySelector('#botsBadge');
const loadError = document.querySelector('#loadError');
const serveHint = document.querySelector('#serveHint');
const canvas = document.querySelector('#rankChart');
const highlightSelect = document.querySelector('#highlightBots');
const botSearchInput = document.querySelector('#botSearch');
const xPointsInput = document.querySelector('#xPoints');
const botLimitInput = document.querySelector('#botLimit');
const yMetricInput = document.querySelector('#yMetric');
const rankLimitInput = document.querySelector('#rankLimit');

const highlightedKeys = new Set();

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

function colorForKeyWithAlpha(key, alpha) {
	const hash = hashString(key);
	const hue = hash % 360;
	const sat = 70;
	const light = 55;
	return `hsl(${hue}deg ${sat}% ${light}% / ${alpha})`;
}

const labelCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function stripLeadingEmoji(label) {
	const text = safeText(label).trim();
	if (!text) return '';

	const first = text[0];
	if (/[\p{L}\p{N}]/u.test(first)) return text;

	const spaceIndex = text.indexOf(' ');
	if (spaceIndex === -1) return text;
	return text.slice(spaceIndex + 1).trim();
}

function buildRankSeries(daysInRange, botLimit, metric, rankLimit) {
	const dayDates = daysInRange.map((d) => d.date);

	let allowedKeys;
	if (typeof botLimit === 'number' && Number.isFinite(botLimit) && botLimit > 0 && daysInRange.length > 0) {
		const limit = Math.max(1, Math.round(botLimit));
		allowedKeys = new Set();
		for (const day of daysInRange) {
			const entries = Array.isArray(day?.entries) ? day.entries : [];
			for (const entry of entries.slice(0, limit)) {
				allowedKeys.add(botKey(entry));
			}
		}
	}

	const rankByDay = new Map(); // date -> Map(botKey -> rank)
	const scoreByDay = new Map(); // date -> Map(botKey -> score)
	for (const day of daysInRange) {
		const perBot = new Map();
		const perBotScore = new Map();
		for (let index = 0; index < day.entries.length; index += 1) {
			const entry = day.entries[index];
			const key = botKey(entry);
			perBot.set(key, index + 1);
			const score = Number(entry?.score);
			perBotScore.set(key, Number.isFinite(score) ? score : null);
		}
		rankByDay.set(day.date, perBot);
		scoreByDay.set(day.date, perBotScore);
	}

	const botMeta = new Map(); // botKey -> label
	for (const day of daysInRange) {
		for (const entry of day.entries) {
			const key = botKey(entry);
			if (allowedKeys && !allowedKeys.has(key)) continue;
			if (!botMeta.has(key)) botMeta.set(key, botLabel(entry));
		}
	}

	const datasets = [];
	for (const [key, label] of botMeta.entries()) {
		const color = colorForKey(key);
		const data = dayDates.map((date, index) => {
			const rank = rankByDay.get(date)?.get(key);
			if (typeof rankLimit === 'number' && Number.isFinite(rankLimit)) {
				if (typeof rank !== 'number' || !Number.isFinite(rank) || rank > rankLimit) {
					return { x: index, y: null };
				}
			}

			const value = metric === 'score' ? scoreByDay.get(date)?.get(key) : rank;
			return { x: index, y: typeof value === 'number' && Number.isFinite(value) ? value : null };
		});
		if (data.some((point) => typeof point?.y === 'number' && Number.isFinite(point.y))) {
			datasets.push({
			_key: key,
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
	}

	datasets.sort((a, b) => a.label.localeCompare(b.label));
	return { dayDates, datasets };
}

function applyHighlights(datasets) {
	const selected = highlightedKeys;
	if (selected.size === 0) {
		for (const dataset of datasets) {
			const key = dataset?._key;
			if (!key) continue;
			dataset.borderColor = colorForKey(key);
			dataset.backgroundColor = colorForKey(key);
			dataset.borderWidth = 1;
			dataset.pointRadius = 0;
		}
		return;
	}

	for (const dataset of datasets) {
		const key = dataset?._key;
		if (!key) continue;
		const isHighlighted = selected.has(key);
		dataset.borderColor = isHighlighted ? colorForKey(key) : colorForKeyWithAlpha(key, 0.4);
		dataset.backgroundColor = dataset.borderColor;
		dataset.borderWidth = isHighlighted ? 2.5 : 1;
		dataset.pointRadius = isHighlighted ? 1.5 : 0;
	}
}

function populateBotSelect(datasets) {
	if (!(highlightSelect instanceof HTMLSelectElement)) return;
	const query = botSearchInput instanceof HTMLInputElement ? botSearchInput.value.trim().toLowerCase() : '';

	const allowed = new Set();
	for (const dataset of datasets) {
		if (dataset?._key) allowed.add(dataset._key);
	}
	for (const key of [...highlightedKeys]) {
		if (!allowed.has(key)) highlightedKeys.delete(key);
	}

	highlightSelect.innerHTML = '';
	const options = [];
	for (const dataset of datasets) {
		const key = dataset?._key;
		const label = safeText(dataset?.label);
		if (!key) continue;
		if (query && !label.toLowerCase().includes(query)) continue;
		options.push({ key, label });
	}

	options.sort((a, b) => labelCollator.compare(stripLeadingEmoji(a.label), stripLeadingEmoji(b.label)));

	for (const entry of options) {
		const option = document.createElement('option');
		option.value = entry.key;
		option.textContent = entry.label;
		option.selected = highlightedKeys.has(entry.key);
		highlightSelect.append(option);
	}
}

function syncHighlightedKeysFromSelect() {
	if (!(highlightSelect instanceof HTMLSelectElement)) return;
	for (const option of highlightSelect.options) {
		if (option.selected) highlightedKeys.add(option.value);
		else highlightedKeys.delete(option.value);
	}
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
let currentRangeKey = '';
let lastDayDates = [];
let xWindowPoints = 5;
let forceXWindow = true;
let botLimit;
let yMetric = 'rank';
let resetZoomOnNextUpdate = false;
let rankLimit;

function formatMetricValue(metric, value) {
	if (typeof value !== 'number' || !Number.isFinite(value)) return '';
	if (metric === 'rank') return String(Math.round(value));
	if (Number.isInteger(value)) return String(value);
	return value.toFixed(2);
}

function applyYMetricToChart(metric) {
	if (!chart) return;
	chart.options.scales ||= {};
	chart.options.scales.y ||= {};
	chart.options.scales.y.reverse = metric === 'rank';
	chart.options.scales.y.title ||= {};
	chart.options.scales.y.title.display = true;
	chart.options.scales.y.title.text = metric === 'rank' ? 'Rank (1 = best)' : 'Score';
	chart.options.scales.y.ticks ||= {};
	if (metric === 'rank') {
		chart.options.scales.y.ticks.precision = 0;
	} else {
		chart.options.scales.y.ticks.precision = undefined;
	}
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

function registerDataLabelsPlugin() {
	const ChartGlobal = globalThis.Chart;
	if (!ChartGlobal?.register) throw new Error('Chart.js is not available (globalThis.Chart missing)');

	const plugin = globalThis.ChartDataLabels;
	if (!plugin) {
		throw new Error(
			'chartjs-plugin-datalabels is not available (globalThis.ChartDataLabels missing). Check that it is loaded before assets/chart.js.',
		);
	}

	ChartGlobal.register(plugin?.default ?? plugin);
}

function formatDisplayDate(isoDate) {
	return `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}`;
}

function updateXAxisTicks(dayDates) {
	if (!chart) return;
	const maxTicks = xWindowPoints;
	const scale = chart.scales?.x;
	const visibleCount =
		typeof scale?.min === 'number' && typeof scale?.max === 'number'
			? Math.max(1, Math.round(scale.max) - Math.round(scale.min) + 1)
			: dayDates.length;
	const step = visibleCount > maxTicks ? Math.ceil(visibleCount / maxTicks) : 1;
	chart.options.scales ||= {};
	chart.options.scales.x ||= {};
	chart.options.scales.x.type = 'linear';
	chart.options.scales.x.ticks ||= {};
	chart.options.scales.x.ticks.autoSkip = false;
	chart.options.scales.x.ticks.stepSize = 1;
	chart.options.scales.x.ticks.precision = 0;
	chart.options.scales.x.ticks.callback = (value) => {
		const numeric = typeof value === 'string' ? Number(value) : value;
		if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return '';

		const index = Math.round(numeric);
		if (Math.abs(numeric - index) > 1e-6) return '';
		const base = typeof scale?.min === 'number' && Number.isFinite(scale.min) ? Math.round(scale.min) : 0;
		if ((index - base) % step !== 0) return '';

		const iso = dayDates[index];
		return iso ? formatDisplayDate(iso) : '';
	};
	chart.options.scales.x.ticks.maxRotation = 0;
}

function clampInteger(value, min, max) {
	if (typeof value !== 'number' || !Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, Math.round(value)));
}

function ensureXWindow(dayDates, points) {
	if (!chart) return;
	if (dayDates.length === 0) return;
	if (typeof points !== 'number' || !Number.isFinite(points)) return;

	const boundedPoints = Math.min(dayDates.length, Math.max(2, Math.round(points)));

	const maxIndex = dayDates.length - 1;
	const currentMaxRaw = chart.scales?.x?.max ?? chart.options?.scales?.x?.max ?? maxIndex;
	const max = clampInteger(currentMaxRaw, 0, maxIndex);
	const min = Math.max(0, max - (boundedPoints - 1));

	chart.options.scales ||= {};
	chart.options.scales.x ||= {};
	chart.options.scales.x.min = min;
	chart.options.scales.x.max = max;
}

function ensureChart(dayDates, datasets) {
	if (!(canvas instanceof HTMLCanvasElement)) {
		throw new Error('Missing chart canvas');
	}
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Unable to get chart context');

	registerZoomPlugin();
	registerDataLabelsPlugin();
	if (chart) return;

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
						// x: { min: 'original', max: 'original' },
						// y: { min: 'original', max: 'original' },
					},
					zoom: {
						mode: 'y',
						wheel: {
							enabled: true,
						},
						pinch: {
							enabled: true,
						},
					},
				},
				datalabels: {
					display: (context) => {
						const key = safeText(context?.dataset?._key);
						if (!key || !highlightedKeys.has(key)) return false;
						const point = context?.dataset?.data?.[context.dataIndex];
						const y = point && typeof point === 'object' ? point.y : point;
						return typeof y === 'number' && Number.isFinite(y);
					},
					formatter: (value) => {
						const y = value && typeof value === 'object' ? value.y : value;
						return formatMetricValue(yMetric, y);
					},
					color: (context) => safeText(context?.dataset?.borderColor) || 'rgba(255, 255, 255, 0.9)',
					align: 'top',
					anchor: 'end',
					offset: 4,
					clip: true,
					font: {
						size: 16,
					}
				},
				tooltip: {
					callbacks: {
						title: (items) => {
							const first = items?.[0];
							const x = first?.parsed?.x;
							const index = typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : -1;
							const labels = Array.isArray(first?.chart?.data?.labels) ? first.chart.data.labels : [];
							const iso = index >= 0 ? labels[index] : '';
							return safeText(iso);
						},
					},
				},
			},
			scales: {
				x: {
					type: 'linear',
					grid: {
						display: true,
						color: 'rgba(255, 255, 255, 0.12)',
					},
				},
				y: {
					reverse: true,
					title: { display: true, text: 'Rank (1 = best)' },
					ticks: { precision: 0 },
					grid: {
						color: 'rgba(255, 255, 255, 0.12)',
					},
				},
			},
		},
	});

	applyYMetricToChart(yMetric);
	updateXAxisTicks(dayDates);
	ensureXWindow(dayDates, xWindowPoints);
}

function updateChart(dayDates, datasets) {
	ensureChart(dayDates, datasets);
	if (!chart) return;

	populateBotSelect(datasets);
	applyHighlights(datasets);

	if (resetZoomOnNextUpdate) {
		resetZoomOnNextUpdate = false;
		if (typeof chart.resetZoom === 'function') {
			chart.resetZoom();
		} else {
			chart.options.scales ||= {};
			chart.options.scales.x ||= {};
			chart.options.scales.y ||= {};
			chart.options.scales.x.min = undefined;
			chart.options.scales.x.max = undefined;
			chart.options.scales.y.min = undefined;
			chart.options.scales.y.max = undefined;
		}
		forceXWindow = true;
	}

	applyYMetricToChart(yMetric);
	chart.data.labels = dayDates;
	chart.data.datasets = datasets;
	lastDayDates = dayDates;

	const nextRangeKey = `${dayDates[0] ?? ''}..${dayDates[dayDates.length - 1] ?? ''}`;
	if (forceXWindow || nextRangeKey !== currentRangeKey) {
		currentRangeKey = nextRangeKey;
		forceXWindow = false;
		ensureXWindow(dayDates, xWindowPoints);
	}

	updateXAxisTicks(dayDates);
	chart.update('none');
}

async function main() {
	try {
		const days = await loadData();
		if (days.length === 0) throw new Error('No days found in data.json');

		if (xPointsInput instanceof HTMLInputElement) {
			const parsed = Number.parseInt(xPointsInput.value, 10);
			if (Number.isFinite(parsed) && parsed >= 2) xWindowPoints = parsed;
			else xPointsInput.value = String(xWindowPoints);

			xPointsInput.addEventListener('input', () => {
				const next = Number.parseInt(xPointsInput.value, 10);
				if (!Number.isFinite(next) || next < 2) return;
				xWindowPoints = next;
				forceXWindow = true;
				if (!chart) return;
				ensureXWindow(lastDayDates, xWindowPoints);
				updateXAxisTicks(lastDayDates);
				chart.update('none');
			});
		}

		if (botLimitInput instanceof HTMLInputElement) {
			const parsed = Number.parseInt(botLimitInput.value, 10);
			if (Number.isFinite(parsed) && parsed >= 1) botLimit = parsed;
			else botLimitInput.value = '';

			botLimitInput.addEventListener('input', () => {
				const next = Number.parseInt(botLimitInput.value, 10);
				botLimit = Number.isFinite(next) && next >= 1 ? next : undefined;
				update();
			});
		}

		if (rankLimitInput instanceof HTMLInputElement) {
			const parsed = Number.parseInt(rankLimitInput.value, 10);
			if (Number.isFinite(parsed) && parsed >= 1) rankLimit = parsed;
			else rankLimitInput.value = '';

			rankLimitInput.addEventListener('input', () => {
				const next = Number.parseInt(rankLimitInput.value, 10);
				rankLimit = Number.isFinite(next) && next >= 1 ? next : undefined;
				update();
			});
		}

		if (yMetricInput instanceof HTMLSelectElement) {
			yMetric = yMetricInput.value === 'score' ? 'score' : 'rank';
			yMetricInput.addEventListener('change', () => {
				yMetric = yMetricInput.value === 'score' ? 'score' : 'rank';
				resetZoomOnNextUpdate = true;
				update();
			});
		}

		const update = () => {
			const { dayDates, datasets } = buildRankSeries(days, botLimit, yMetric, rankLimit);
			daysBadge.textContent = `Days: ${dayDates.length}`;
			botsBadge.textContent = `Bots: ${datasets.length}`;
			updateChart(dayDates, datasets);
		};

		if (highlightSelect instanceof HTMLSelectElement) {
			highlightSelect.addEventListener('change', () => {
				if (!chart) return;
				syncHighlightedKeysFromSelect();
				applyHighlights(chart.data.datasets);
				chart.update('none');
			});
		}

		if (botSearchInput instanceof HTMLInputElement) {
			botSearchInput.addEventListener('input', () => {
				if (!chart) return;
				populateBotSelect(chart.data.datasets);
			});
		}

		update();
	} catch (error) {
		// Keep the error visible in DevTools for debugging.
		console.error(error);
		showError(error instanceof Error ? error.message : String(error));
	}
}

main();
