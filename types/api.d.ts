export namespace API {
	export interface Scrim {
		scrim_seed: string;
		// Format: YYYY-MM-DD
		date: string;
		bots: { [key: string]: Bot };
	}
	
	export type Bot = DeterministicBot | NonDeterministicBot;
	
	interface DeterministicBot {
		deterministic: true;
		profile: Profile;
	}
	
	interface NonDeterministicBot {
		deterministic: false;
	}
	
	export interface Profile {
		timestamp: number;
		stage_key: string;
		stage_title: string;
		git_hash: string;
		seed: string;
		name: string;
		emoji: string;
		total_score: number;
		gem_utilization_mean: number;
		gem_utilization_cv: number;
		floor_coverage_mean: number;
		rounds: Round[];
	}
	
	export interface Round {
		seed: string;
		score: number;
		gem_utilization: number;
		floor_coverage: number;
		ticks_to_first_capture?: number;
		disqualified_for: null;
		response_time_stats: ResponseTimeStats;
	}
	
	export interface ResponseTimeStats {
		first: number;
		min: number;
		median: number;
		max: number;
	}
	
	export type Response = Scrim;
	
}
