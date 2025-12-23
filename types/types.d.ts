export interface Leaderboard {
	date: string;
	stage: string;
	stageKey: string;
	seed: string;
	roundSeeds: string[];
	entries: LeaderboardEntry[];
}

export interface LeaderboardEntry {
	// array index in bots.json of the bot
	id: number;
	score: number;
	gu: number;
	fc: number;
	git: string;
	
	rounds: Round[];
}

export interface Round {
	// score
	s: number;
	gu: number;
	fc: number;
	disqualified?: string;
	
	// timings: mean/max
	t: [number, number];
}

export interface Bot {
	id: string;
	student: boolean;
	emoji: string;
	name: string;
	author: string;
	location: string;
	language: string;
}
