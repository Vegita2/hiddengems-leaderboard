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

function loadBots(): Bot[] {
	const botsPath = join(__dirname, 'json', 'bots.json');
	return JSON.parse(readFileSync(botsPath, 'utf-8'));
}

interface MissingBot {
	id: string;
	data: API.Bot;
}

interface TransformResult {
	leaderboard: Leaderboard;
	missingBots: MissingBot[];
}

function transformToLeaderboard(scrim: API.Scrim, bots: Bot[]): TransformResult {
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
				git: '',
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
			git: profile.git_hash,
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
	
	const scrim = await fetchScrimData(date);
	console.log(`Fetched scrim data with ${Object.keys(scrim.bots).length} bots`);
	
	const { leaderboard, missingBots } = transformToLeaderboard(scrim, bots);
	console.log(`Transformed to leaderboard with ${leaderboard.entries.length} entries`);
	
	const outputDir = join(__dirname, 'json');
	mkdirSync(outputDir, { recursive: true });
	
	const outputPath = join(outputDir, `data-${date}.json`);
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
