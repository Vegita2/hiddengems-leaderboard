export interface Leaderboard {
	date: string;
	stage: string;
	seed: string;
	entries: LeaderboardEntry[];
}

export interface LeaderboardEntry {
	student: boolean;
	emoji: string;
	bot: string;
	score: number;
	gu: number;
	cf: number;
	fc: number;
	author: string;
	location: string;
	language: string;
	commit: string;
}
