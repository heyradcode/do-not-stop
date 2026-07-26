import { useCallback, useEffect, useState } from 'react';
import type { StrikeLogEntry } from '@shared/core';

/** Time each strike stays on screen before the next one plays. */
const STRIKE_INTERVAL_MS = 700;

export interface LiveBattleAnimationState {
    /** Fighter (pet1) HP as a 0-100 percentage; 100 until the first strike plays. */
    hp1Percent: number;
    hp2Percent: number;
    /** One-line flavor text for the most recent strike, or null before anything has played. */
    flourish: string | null;
    /** True once every log entry has played, or immediately true when there's nothing to
     *  animate (Solana, or an EVM deployment with no GameConfig wired up). */
    done: boolean;
    /** Every strike played so far, oldest first — the persistent mechanical-log feed
     *  (as opposed to `flourish`, which is only the latest strike). */
    history: StrikeLogEntry[];
    /** Restarts the same log from the first strike — for a "Watch Again" action on the
     *  result screen. A no-op when there's nothing to animate. */
    replay: () => void;
}

/**
 * Plays a combat-sim log (@cryptopets/protocol's combat engine, via useEvmBattleFlow's
 * `liveReplay`) one strike at a time, exposing HP percentages and a flavor
 * line for the fighting scene. Presentation only — see useBattlePanel.ts for
 * the gate that keeps the result card off this animation and the
 * reconciliation check against the authoritative on-chain result.
 */
export function useLiveBattleAnimation(
    log: StrikeLogEntry[] | null,
    startHp1: bigint | null,
    startHp2: bigint | null,
    active: boolean,
): LiveBattleAnimationState {
    const [index, setIndex] = useState(0);
    const replay = useCallback(() => setIndex(0), []);

    // A new battle's log arrives as a new array reference — restart from the top.
    useEffect(() => {
        setIndex(0);
    }, [log]);

    useEffect(() => {
        if (!active || !log || index >= log.length) return;
        const timer = setTimeout(() => setIndex((i) => i + 1), STRIKE_INTERVAL_MS);
        return () => clearTimeout(timer);
    }, [active, log, index]);

    if (!log || log.length === 0 || startHp1 == null || startHp2 == null) {
        return { hp1Percent: 100, hp2Percent: 100, flourish: null, done: true, history: [], replay };
    }

    const current = index > 0 ? log[index - 1] : null;
    return {
        hp1Percent: current ? percentOf(current.hp1After, startHp1) : 100,
        hp2Percent: current ? percentOf(current.hp2After, startHp2) : 100,
        flourish: current ? describeStrike(current) : null,
        done: index >= log.length,
        history: log.slice(0, index),
        replay,
    };
}

function percentOf(hp: bigint, startHp: bigint): number {
    if (startHp <= 0n) return 0;
    const pct = (hp * 100n) / startHp;
    return Number(pct > 100n ? 100n : pct);
}

/** Persistent mechanical-log line for one strike — round number, named attacker/defender,
 *  and damage, as opposed to `describeStrike`'s punchier unnamed one-off flourish text. */
export function describeMechanicalLogEntry(
    entry: StrikeLogEntry,
    fighterName: string,
    opponentName: string,
): string {
    const attacker = entry.attacker === 1 ? fighterName : opponentName;
    const defender = entry.attacker === 1 ? opponentName : fighterName;
    const verb = entry.isMagic ? 'casts on' : 'strikes';
    const damage = entry.damage > 0n ? `${entry.damage} dmg` : 'no damage';
    const tags: string[] = [];
    if (entry.crit) tags.push('Crit!');
    if (entry.elementMult === 115) tags.push('Element adv.');
    if (entry.elementMult === 85) tags.push('Element disadv.');
    if (entry.furyTriggered) tags.push('Fury!');
    if (entry.rebirthTriggered) tags.push('Rebirth!');
    if (entry.heal > 0n) tags.push(`+${entry.heal} HP leeched`);
    const base = `Round ${entry.round} — ${attacker} ${verb} ${defender} for ${damage}`;
    return tags.length ? `${base} (${tags.join(', ')})` : base;
}

function describeStrike(entry: StrikeLogEntry): string {
    const who = entry.attacker === 1 ? 'Your pet' : 'The opponent';
    const parts = [`${who} lands ${entry.isMagic ? 'a magic strike' : 'a physical strike'}`];
    if (entry.crit) parts.push('— critical hit!');
    if (entry.elementMult === 115) parts.push('(element advantage)');
    if (entry.elementMult === 85) parts.push('(element disadvantage)');
    if (entry.furyTriggered) parts.push('(Fury!)');
    if (entry.rebirthTriggered) parts.push('— Rebirth saved a killing blow!');
    return parts.join(' ');
}
