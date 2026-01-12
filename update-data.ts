import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { API } from './types/api.d.ts';
import type { Bot, Leaderboard, LeaderboardEntry, Round } from './types/types.d.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

function nsToMs(ns: number | undefined): number {
	if (ns === undefined) {
		return 0;
	}
	return Math.round(ns / 100000) / 10;
}

function getDateString(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

async function fetchScrimData(date: string): Promise<API.Scrim> {
	const url = `https://hiddengems.gymnasiumsteglitz.de/dl/stats/${date}.json.gz`;
	console.log(`Fetching ${url}`);
	
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
	}
	
	return response.json();
}

function decodeHtmlEntities(input: string): string {
	return input
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, '\'')
		.replace(/&ndash;/g, '–')
		.replace(/&mdash;/g, '—');
}

function stripHtml(input: string): string {
	return input.replace(/<[^>]*>/g, '');
}

function normalizeText(input: string): string {
	const cleaned = input
		.replace(/\u00a0/g, ' ')
		.replace(/[–—]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
	if (cleaned === '-' || cleaned === '–' || cleaned === '—') {
		return '';
	}
	return cleaned;
}

interface ScrimRow {
	name: string;
	author: string;
	location: string;
	score: number;
	git: string;
}

function extractScrimRows(html: string): ScrimRow[] {
	const rows: ScrimRow[] = [];
	const commitHeader = '<th>Commit</th>';
	const commitIndex = html.indexOf(commitHeader);
	let scanHtml = html;
	
	if (commitIndex !== -1) {
		const tableStart = html.lastIndexOf('<table', commitIndex);
		const tableEnd = html.indexOf('</table>', commitIndex);
		if (tableStart !== -1 && tableEnd !== -1) {
			scanHtml = html.slice(tableStart, tableEnd + '</table>'.length);
		}
	}
	
	let headerCells: string[] = [];
	const theadMatch = /<thead[^>]*>[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i.exec(scanHtml);
	if (theadMatch) {
		const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
		let thMatch: RegExpExecArray | null;
		while ((thMatch = thRegex.exec(theadMatch[1])) !== null) {
			headerCells.push(normalizeText(decodeHtmlEntities(stripHtml(thMatch[1]))));
		}
	}
	
	const headerIndex = {
		bot: headerCells.findIndex((cell) => cell === 'bot'),
		score: headerCells.findIndex((cell) => cell === 'score'),
		author: headerCells.findIndex((cell) => cell.includes('autor') && cell.includes('team')),
		location: headerCells.findIndex((cell) => cell === 'ort'),
		commit: headerCells.findIndex((cell) => cell === 'commit'),
	};
	
	const defaultIndex = {
		bot: 2,
		score: 3,
		author: 7,
		location: 8,
		commit: 10,
	};
	
	const resolvedIndex = {
		bot: headerIndex.bot >= 0 ? headerIndex.bot : defaultIndex.bot,
		score: headerIndex.score >= 0 ? headerIndex.score : defaultIndex.score,
		author: headerIndex.author >= 0 ? headerIndex.author : defaultIndex.author,
		location: headerIndex.location >= 0 ? headerIndex.location : defaultIndex.location,
		commit: headerIndex.commit >= 0 ? headerIndex.commit : defaultIndex.commit,
	};
	
	const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(scanHtml);
	const bodyHtml = tbodyMatch ? tbodyMatch[1] : scanHtml;
	const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
	const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
	let rowMatch: RegExpExecArray | null;
	
	while ((rowMatch = rowRegex.exec(bodyHtml)) !== null) {
		const rowHtml = rowMatch[1];
		const cells: string[] = [];
		let cellMatch: RegExpExecArray | null;
		while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
			cells.push(cellMatch[1]);
		}
		if (cells.length <= resolvedIndex.commit) {
			continue;
		}
		
		const name = decodeHtmlEntities(stripHtml(cells[resolvedIndex.bot])).trim();
		const scoreText = decodeHtmlEntities(stripHtml(cells[resolvedIndex.score]));
		const scoreValue = parseInt(scoreText.replace(/[^\d]/g, ''), 10);
		const author = decodeHtmlEntities(stripHtml(cells[resolvedIndex.author])).trim();
		const location = decodeHtmlEntities(stripHtml(cells[resolvedIndex.location])).trim();
		const git = decodeHtmlEntities(stripHtml(cells[resolvedIndex.commit])).trim();
		
		if (!name || Number.isNaN(scoreValue) || !git) {
			continue;
		}
		
		rows.push({
			name,
			author,
			location,
			score: scoreValue,
			git,
		});
	}
	
	return rows;
}

async function fetchScrimRows(): Promise<ScrimRow[]> {
	const url = 'https://hiddengems.gymnasiumsteglitz.de/scrims';
	console.log(`Fetching ${url}`);
	
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
	}
	
	const html = await response.text();
	return extractScrimRows(html);
}

function loadBots(): Bot[] {
	const botsPath = join(__dirname, 'json', 'bots.json');
	return JSON.parse(readFileSync(botsPath, 'utf-8'));
}

function loadExistingGitHashes(outputPath: string, bots: Bot[]): Map<string, string> | undefined {
	if (!existsSync(outputPath)) {
		return undefined;
	}
	try {
		const existing = JSON.parse(readFileSync(outputPath, 'utf-8')) as Leaderboard;
		const gitMap = new Map<string, string>();
		for (const entry of existing.entries ?? []) {
			const bot = bots[entry.id];
			if (!bot || !entry.git) {
				continue;
			}
			gitMap.set(bot.id, entry.git);
		}
		return gitMap.size > 0 ? gitMap : undefined;
	} catch (err) {
		console.warn(`Failed to read existing data from ${outputPath}`);
		console.warn(err);
		return undefined;
	}
}

interface MissingBot {
	id: string;
	data: API.Bot;
}

interface TransformResult {
	leaderboard: Leaderboard;
	missingBots: MissingBot[];
}

function transformToLeaderboard(
	scrim: API.Scrim,
	bots: Bot[],
	gitHashByBotId?: Map<string, string>,
): TransformResult {
	const entries: LeaderboardEntry[] = [];
	const missingBots: MissingBot[] = [];
	let stage = '';
	let stageKey = '';
	const roundSeeds: string[] = [];
	
	const botIndexMap = new Map<string, number>();
	for (let i = 0; i < bots.length; i++) {
		botIndexMap.set(bots[i].id, i);
	}
	
	// First pass: get stage info and round seeds from a deterministic bot
	for (const botData of Object.values(scrim.bots)) {
		if (!botData.deterministic || !botData.profile) {
			continue;
		}
		const profile = botData.profile;
		stage = profile.stage_title;
		stageKey = profile.stage_key;
		for (const round of profile.rounds) {
			roundSeeds.push(round.seed);
		}
		break;
	}
	
	// Second pass: process all bots
	for (const [botId, botData] of Object.entries(scrim.bots)) {
		const botIndex = botIndexMap.get(botId);
		if (botIndex === undefined) {
			if (botData.deterministic) {
				missingBots.push({ id: botId, data: botData });
			}
			continue;
		}
		const gitHash = gitHashByBotId?.get(botId);
		
		if (!botData.deterministic) {
			const rounds: Round[] = roundSeeds.map(() => ({
				s: 0,
				gu: 0,
				fc: 0,
				disqualified: 'non deterministic',
				t: [0, 0],
			}));
			
			entries.push({
				id: botIndex,
				score: 0,
				gu: 0,
				fc: 0,
				git: gitHash ?? '',
				rounds,
			});
			continue;
		}
		
		const profile = botData.profile;
		if (!profile) {
			continue;
		}
		const rounds: Round[] = profile.rounds.map((r) => ({
			s: r.score,
			gu: r.gem_utilization,
			fc: r.floor_coverage,
			disqualified: r.disqualified_for ?? undefined,
			t: [nsToMs(r.response_time_stats?.median), nsToMs(r.response_time_stats?.max)],
		}));
		
		entries.push({
			id: botIndex,
			score: profile.total_score,
			gu: profile.gem_utilization_mean,
			fc: profile.floor_coverage_mean,
			git: gitHash ?? '',
			rounds,
		});
	}
	
	// Sort by score descending
	entries.sort((a, b) => b.score - a.score);
	
	return {
		leaderboard: {
			date: scrim.date,
			stage,
			stageKey,
			seed: scrim.scrim_seed,
			roundSeeds,
			entries,
		},
		missingBots,
	};
}

async function main() {
	const date = process.argv[2] || getDateString();
	console.log(`Processing data for ${date}`);
	
	const bots = loadBots();
	console.log(`Loaded ${bots.length} bots`);
	const botIndexMap = new Map<string, number>();
	for (let i = 0; i < bots.length; i++) {
		botIndexMap.set(bots[i].id, i);
	}
	
	const outputDir = join(__dirname, 'json', 'data');
	const outputPath = join(outputDir, `data-${date}.json`);
	const existingGitHashByBotId = loadExistingGitHashes(outputPath, bots);
	if (existingGitHashByBotId) {
		console.log(`Loaded ${existingGitHashByBotId.size} existing commit hashes`);
	}
	
	const scrim = await fetchScrimData(date);
	console.log(`Fetched scrim data with ${Object.keys(scrim.bots).length} bots`);
	
	let gitHashByBotId: Map<string, string> | undefined;
	if (date === getDateString()) {
		try {
			const rows = await fetchScrimRows();
			const matchMap = new Map<string, string[]>();
			const scoreMap = new Map<number, string[]>();
			for (const [botId, botData] of Object.entries(scrim.bots)) {
				const profile = botData.profile;
				if (!profile) {
					continue;
				}
				const botIndex = botIndexMap.get(botId);
				const bot = botIndex !== undefined ? bots[botIndex] : undefined;
				const name = profile.name || bot?.name || '';
				const author = bot?.author || '';
				const location = bot?.location || '';
				const key = `${profile.total_score}|${normalizeText(name)}|${normalizeText(author)}|${normalizeText(location)}`;
				const existing = matchMap.get(key);
				if (existing) {
					existing.push(botId);
				} else {
					matchMap.set(key, [botId]);
				}
				const scoreExisting = scoreMap.get(profile.total_score);
				if (scoreExisting) {
					scoreExisting.push(botId);
				} else {
					scoreMap.set(profile.total_score, [botId]);
				}
			}
			
			gitHashByBotId = new Map<string, string>();
			const usedBotIds = new Set<string>();
			let unmatched = 0;
			for (const row of rows) {
				const scoreCandidates = scoreMap.get(row.score) ?? [];
				const availableScoreCandidates = scoreCandidates.filter((id) => !usedBotIds.has(id));
				let botId: string | undefined;
				
				if (availableScoreCandidates.length === 1) {
					botId = availableScoreCandidates[0];
				} else {
					const key = `${row.score}|${normalizeText(row.name)}|${normalizeText(row.author)}|${normalizeText(row.location)}`;
					const candidates = matchMap.get(key);
					if (candidates && candidates.length > 0) {
						while (candidates.length > 0) {
							const candidate = candidates.shift();
							if (candidate && !usedBotIds.has(candidate)) {
								botId = candidate;
								break;
							}
						}
					}
				}
				
				if (botId) {
					usedBotIds.add(botId);
					gitHashByBotId.set(botId, row.git);
				} else {
					unmatched += 1;
				}
			}
			
			if (unmatched > 0) {
				console.warn(`Scrim page rows unmatched: ${unmatched}`);
			}
		} catch (err) {
			console.warn('Failed to fetch scrim page git hashes, using API hashes instead.');
			console.warn(err);
		}
	}
	
	if (existingGitHashByBotId) {
		if (!gitHashByBotId) {
			gitHashByBotId = existingGitHashByBotId;
		} else {
			for (const [botId, git] of existingGitHashByBotId) {
				if (!gitHashByBotId.has(botId)) {
					gitHashByBotId.set(botId, git);
				}
			}
		}
	}
	
	const { leaderboard, missingBots } = transformToLeaderboard(scrim, bots, gitHashByBotId);
	console.log(`Transformed to leaderboard with ${leaderboard.entries.length} entries`);
	
	mkdirSync(outputDir, { recursive: true });
	writeFileSync(outputPath, JSON.stringify(leaderboard));
	console.log(`Wrote ${outputPath}`);
	
	if (missingBots.length > 0) {
		const missingPath = join(__dirname, 'missing_bots.json');
		let existing: MissingBot[] = [];
		if (existsSync(missingPath)) {
			existing = JSON.parse(readFileSync(missingPath, 'utf-8'));
		}
		const existingIds = new Set(existing.map((b) => b.id));
		const newBots = missingBots.filter((b) => !existingIds.has(b.id));
		if (newBots.length > 0) {
			const combined = [...existing, ...newBots];
			writeFileSync(missingPath, JSON.stringify(combined, null, '\t'));
			console.log(`Found ${newBots.length} new missing bots, wrote ${missingPath}`);
		}
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
