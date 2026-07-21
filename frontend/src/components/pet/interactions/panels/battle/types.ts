export type BattleOutcome = { result: 'victory' | 'defeat'; leveledUp: boolean } | null;

/** One formatted line in the mechanical (round-by-round) battle log. */
export type MechanicalLogLine = { text: string; isFighter: boolean };
