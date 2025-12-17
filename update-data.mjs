import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIMS_URL = "https://hiddengems.gymnasiumsteglitz.de/scrims";

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(value) {
	const named = {
		amp: "&",
		lt: "<",
		gt: ">",
		quot: '"',
		apos: "'",
		nbsp: " ",
		ndash: "–",
		mdash: "—",
	};

	return value.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (full, entity) => {
		if (entity.startsWith("#x")) {
			const codePoint = Number.parseInt(entity.slice(2), 16);
			return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full;
		}

		if (entity.startsWith("#")) {
			const codePoint = Number.parseInt(entity.slice(1), 10);
			return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full;
		}

		return named[entity] ?? full;
	});
}

function getTextContent(htmlFragment) {
	const withoutTags = htmlFragment
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]*>/g, "");

	return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

function parseNumber(value, { allowPercent = false } = {}) {
	const trimmed = value.trim();
	if (trimmed === "" || trimmed === "&ndash;" || trimmed === "&mdash;" || trimmed === "–" || trimmed === "—" || trimmed === "-") {
		return 0;
	}
	const cleaned = allowPercent ? trimmed.replace(/%/g, "") : trimmed;
	const numeric = cleaned.replace(/[^\d.\-+]/g, "");
	if (numeric === "" || numeric === "-" || numeric === "+" || numeric === "–" || numeric === "—") {
		return 0;
	}
	const parsed = Number.parseFloat(numeric);

	if (!Number.isFinite(parsed)) {
		throw new Error(`Unable to parse number from "${value}"`);
	}

	return parsed;
}

function parseGermanDateToIso(dateText) {
	const trimmed = dateText.trim();
	const numericMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
	if (numericMatch) {
		const [, day, month, year] = numericMatch;
		return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
	}

	const match = trimmed.match(/^(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(\d{4})$/);
	if (!match) return null;

	const [, dayRaw, monthRaw, year] = match;
	const monthKey = monthRaw.toLowerCase();

	const months = new Map([
		["januar", 1],
		["februar", 2],
		["märz", 3],
		["maerz", 3],
		["april", 4],
		["mai", 5],
		["juni", 6],
		["juli", 7],
		["august", 8],
		["september", 9],
		["oktober", 10],
		["november", 11],
		["dezember", 12],
	]);

	const monthNumber = months.get(monthKey);
	if (!monthNumber) return null;

	const day = dayRaw.padStart(2, "0");
	const month = String(monthNumber).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function extractBoxValue(html, label) {
	const re = new RegExp(
		`<h3>\\s*${escapeRegExp(label)}\\s*<\\/h3>[\\s\\S]*?<p>([\\s\\S]*?)<\\/p>`,
		"i",
	);
	const match = html.match(re);
	if (!match) throw new Error(`Unable to find "${label}" box on scrims page`);
	return getTextContent(match[1]);
}

function extractStage(html) {
	const match = html.match(
		/<h3>\s*Stage\s*#(\d+)\s*<\/h3>[\s\S]*?<p>([\s\S]*?)<\/p>/i,
	);
	if (!match) throw new Error("Unable to find Stage box on scrims page");
	const [, stageNumber, stageNameHtml] = match;
	return {
		stageNumber,
		stageName: getTextContent(stageNameHtml),
	};
}

function extractSeed(html) {
	const match = html.match(/<h3>\s*Seed\s*<\/h3>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
	if (!match) throw new Error("Unable to find Seed box on scrims page");
	const pHtml = match[1];
	const seedMatch = pHtml.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
	return seedMatch ? getTextContent(seedMatch[1]) : getTextContent(pHtml);
}

function extractBestenlisteTable(html) {
	const h2Match = html.match(/<h2[^>]*>\s*Bestenliste\s*<\/h2>/i);
	if (!h2Match || typeof h2Match.index !== "number") {
		throw new Error('Unable to find "Bestenliste" heading on scrims page');
	}

	const afterHeading = html.slice(h2Match.index + h2Match[0].length);
	const tableMatch = afterHeading.match(/<table\b[\s\S]*?<\/table>/i);
	if (!tableMatch) throw new Error("Unable to find leaderboard table on scrims page");
	return tableMatch[0];
}

function parseLanguage(cellHtml) {
	const srcMatch = cellHtml.match(/src=['"]([^'"]+)['"]/i);
	if (!srcMatch) return getTextContent(cellHtml);
	const src = srcMatch[1];
	const filename = src.split("/").pop()?.split("?")[0] ?? "";
	return filename.replace(/-logo.*$/i, "").replace(/\..*$/i, "");
}

function parseEntries(html) {
	const tableHtml = extractBestenlisteTable(html);
	const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
	const tbodyHtml = tbodyMatch ? tbodyMatch[1] : tableHtml;

	const entries = [];
	const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
	for (const match of tbodyHtml.matchAll(rowRe)) {
		const attrs = match[1] ?? "";
		const rowHtml = match[2] ?? "";

		if (/class=['"][^'"]*\bspacer\b/i.test(attrs)) continue;

		const isBaseline = /class=['"][^'"]*\bbaseline\b/i.test(attrs);

		const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
			(cellMatch) => cellMatch[1] ?? "",
		);

		if (cells.length < 11) continue;

		const emoji = getTextContent(cells[1]);
		const bot = getTextContent(cells[2]);
		const score = parseNumber(getTextContent(cells[3]));
		const gu = parseNumber(getTextContent(cells[4]), { allowPercent: true });
		const cf = parseNumber(getTextContent(cells[5]), { allowPercent: true });
		const fc = parseNumber(getTextContent(cells[6]), { allowPercent: true });
		const author = getTextContent(cells[7]);
		const location = getTextContent(cells[8]);
		const language = parseLanguage(cells[9]);
		const commit = getTextContent(cells[10]);

		entries.push({
			student: !isBaseline,
			emoji,
			bot,
			score,
			gu,
			cf,
			fc,
			author,
			location,
			language,
			commit,
		});
	}

	if (entries.length === 0) {
		throw new Error("No leaderboard entries parsed from scrims page");
	}

	return entries;
}

async function readLeaderboardArray(filePath) {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			throw new Error("data.json is not a JSON array");
		}
		return parsed;
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

async function fetchScrimsHtml() {
	const response = await fetch(SCRIMS_URL, {
		headers: {
			"user-agent": "hidden-gems-stats-bot/1.0 (+https://github.com)",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch scrims page: ${response.status} ${response.statusText}`);
	}

	return await response.text();
}

async function main() {
	const scriptDir = path.dirname(fileURLToPath(import.meta.url));
	const dataPath = path.join(scriptDir, "data.json");

	const html = await fetchScrimsHtml();

	const dateText = extractBoxValue(html, "Datum");
	const date = parseGermanDateToIso(dateText) ?? dateText;

	const stageInfo = extractStage(html);
	const stage = stageInfo.stageName
		? `Stage #${stageInfo.stageNumber}: ${stageInfo.stageName}`
		: `Stage #${stageInfo.stageNumber}`;

	const seed = extractSeed(html);
	const entries = parseEntries(html);

	const newLeaderboard = { date, stage, seed, entries };

	const existing = await readLeaderboardArray(dataPath);
	const key = `${newLeaderboard.date}__${newLeaderboard.stage}__${newLeaderboard.seed}`;

	const existingIndex = existing.findIndex((leaderboard) => {
		if (!leaderboard || typeof leaderboard !== "object") return false;
		return (
			`${leaderboard.date}__${leaderboard.stage}__${leaderboard.seed}` === key
		);
	});

	if (existingIndex >= 0) {
		existing[existingIndex] = newLeaderboard;
	} else {
		existing.push(newLeaderboard);
	}

	existing.sort((a, b) => String(a.date).localeCompare(String(b.date)));

	await fs.writeFile(dataPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");

	console.log(
		`Updated ${path.relative(process.cwd(), dataPath)} with ${entries.length} entries (${date}, ${stage}, seed ${seed})`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
