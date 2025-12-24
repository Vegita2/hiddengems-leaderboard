import { safeText } from './utils.js';

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

export function initDateRangeSelectors({
	availableDates,
	startDateInput,
	endDateInput,
	stageSelect,
	stageKeySelect,
	onChange,
	defaultWindowDays = 7,
	defaultToLastStageKey = true,
	allStagesLabel = 'All stages',
	clearStageSelection = false,
	debounceMs = 300,
	includeAllStages = false,
}) {
	const minDate = availableDates[0]?.date ?? '';
	const maxDate = availableDates[availableDates.length - 1]?.date ?? '';

	const defaultStart = availableDates.length > defaultWindowDays
		? availableDates[availableDates.length - defaultWindowDays].date
		: minDate;
	const defaultEnd = maxDate;

	const { start, end, min, max } = clampRange(availableDates, defaultStart, defaultEnd);
	if (startDateInput instanceof HTMLInputElement) {
		startDateInput.min = min;
		startDateInput.max = max;
		startDateInput.value = start;
	}
	if (endDateInput instanceof HTMLInputElement) {
		endDateInput.min = min;
		endDateInput.max = max;
		endDateInput.value = end;
	}

	const stageRanges = buildRangeMap(availableDates, 'stage');
	const stageKeyRanges = buildRangeMap(availableDates, 'stageKey');
	const stageKeyMap = buildStageKeyMap(availableDates);
	stageRanges.options.sort((a, b) => a.localeCompare(b));
	fillSelectOptions(stageSelect, stageRanges.options, allStagesLabel, includeAllStages);
	if (clearStageSelection && stageSelect instanceof HTMLSelectElement) {
		stageSelect.selectedIndex = -1;
	}
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
	if (defaultToLastStageKey && lastStageKey) {
		if (stageSelect && lastStage) {
			stageSelect.value = lastStage;
		}
		updateStageKeyOptions(stageKeySelect, stageKeyMap, lastStage, lastStageKey);
		const range = stageKeyRanges.ranges.get(lastStageKey);
		if (range && startDateInput instanceof HTMLInputElement && endDateInput instanceof HTMLInputElement) {
			startDateInput.value = range.start;
			endDateInput.value = range.end;
		}
	}

	let updateTimeout;
	const notifyChange = () => {
		if (typeof onChange === 'function') {
			onChange();
		}
	};
	const debouncedChange = () => {
		clearTimeout(updateTimeout);
		updateTimeout = setTimeout(notifyChange, debounceMs);
	};

	startDateInput?.addEventListener('change', debouncedChange);
	endDateInput?.addEventListener('change', debouncedChange);
	stageSelect?.addEventListener('change', () => {
		if (stageKeySelect) {
			updateStageKeyOptions(stageKeySelect, stageKeyMap, stageSelect.value);
			stageKeySelect.value = '';
		}
		if (!startDateInput || !endDateInput) {
			return;
		}
		if (!stageSelect.value) {
			startDateInput.value = minDate;
			endDateInput.value = maxDate;
			debouncedChange();
			return;
		}
		const range = stageRanges.ranges.get(stageSelect.value);
		if (!range) {
			return;
		}
		startDateInput.value = range.start;
		endDateInput.value = range.end;
		debouncedChange();
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
		if (!startDateInput || !endDateInput) {
			return;
		}
		if (!selectedKey && !stageSelect?.value) {
			startDateInput.value = minDate;
			endDateInput.value = maxDate;
			debouncedChange();
			return;
		}
		const range = selectedKey
			? stageKeyRanges.ranges.get(selectedKey)
			: stageRanges.ranges.get(stageSelect?.value || '');
		if (!range) {
			return;
		}
		startDateInput.value = range.start;
		endDateInput.value = range.end;
		debouncedChange();
	});

	const getRange = () => {
		const startIso = parseIsoDate(startDateInput?.value);
		const endIso = parseIsoDate(endDateInput?.value);
		return { startIso, endIso };
	};

	return {
		getRange,
		getDatesInRange() {
			const { startIso, endIso } = getRange();
			return availableDates.filter((d) => inRange(d.date, startIso, endIso));
		},
	};
}
