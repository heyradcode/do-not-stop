import type { SimOutcome, StrikeLogEntry } from './sim';

/** JSON-safe encoding of `StrikeLogEntry` — `bigint` fields as decimal strings. */
export interface StrikeLogEntryWire {
    round: number;
    attacker: 1 | 2;
    isMagic: boolean;
    crit: boolean;
    damage: string;
    heal: string;
    elementMult: number;
    furyTriggered: boolean;
    rebirthTriggered: boolean;
    hp1After: string;
    hp2After: string;
}

/** JSON-safe encoding of `SimOutcome`, for pushing a computed battle sim over the wire
 *  (e.g. backend settle keeper -> frontend WebSocket). `bigint` fields become decimal
 *  strings since `JSON.stringify` can't serialize `bigint` directly. */
export interface SimOutcomeWire {
    result: { firstWins: boolean; rounds: number; winnerHpRemaining: number };
    log: StrikeLogEntryWire[];
    startHp1: string;
    startHp2: string;
}

export const encodeSimOutcome = (outcome: SimOutcome): SimOutcomeWire => ({
    result: outcome.result,
    log: outcome.log.map((entry) => encodeStrikeLogEntry(entry)),
    startHp1: outcome.startHp1.toString(),
    startHp2: outcome.startHp2.toString(),
});

export const decodeSimOutcome = (wire: SimOutcomeWire): SimOutcome => ({
    result: wire.result,
    log: wire.log.map((entry) => decodeStrikeLogEntry(entry)),
    startHp1: BigInt(wire.startHp1),
    startHp2: BigInt(wire.startHp2),
});

const encodeStrikeLogEntry = (entry: StrikeLogEntry): StrikeLogEntryWire => ({
    ...entry,
    damage: entry.damage.toString(),
    heal: entry.heal.toString(),
    hp1After: entry.hp1After.toString(),
    hp2After: entry.hp2After.toString(),
});

const decodeStrikeLogEntry = (wire: StrikeLogEntryWire): StrikeLogEntry => ({
    ...wire,
    damage: BigInt(wire.damage),
    heal: BigInt(wire.heal),
    hp1After: BigInt(wire.hp1After),
    hp2After: BigInt(wire.hp2After),
});
