import { useState } from 'react';
import BattleOverlay from '@components/pet/interactions/panels/battle/parts/battle-overlay';

/** SCRATCH — temporary visual verification page for the dialogue-rail/mechanical-log
 *  layout change. Not wired into app-routes; delete after verifying. */
const scenarios = ['fighting', 'result-victory', 'result-defeat'] as const;
type Scenario = (typeof scenarios)[number];

const BattleOverlayPreview = () => {
    const [scenario, setScenario] = useState<Scenario>('fighting');

    const liveLog = [
        { text: 'Round 1 — Rex strikes Blaze for 14 dmg', isFighter: true },
        { text: 'Round 1 — Blaze casts on Rex for 9 dmg (Element adv.)', isFighter: false },
        { text: 'Round 2 — Rex strikes Blaze for 22 dmg (Crit!)', isFighter: true },
        { text: 'Round 2 — Blaze casts on Rex for 11 dmg', isFighter: false },
        { text: 'Round 3 — Rex strikes Blaze for 18 dmg (Fury!)', isFighter: true },
    ];

    const tauntsTurns = [
        { speaker: 'attacker' as const, phase: 'taunt' as const, text: "You're going down, Blaze!" },
        { speaker: 'defender' as const, phase: 'taunt' as const, text: 'Big talk for a lizard.' },
    ];
    const resultTurns = [
        { speaker: 'attacker' as const, phase: 'result' as const, text: 'GG, that was close!' },
        { speaker: 'defender' as const, phase: 'result' as const, text: 'Rematch... oh wait.' },
    ];

    const common = {
        fighter: {
            id: '1', chain: 'evm', name: 'Rex', dna: 12345n, level: 8, rarity: 3,
            winCount: 2, lossCount: 1, readyAt: 0, speciesId: 2,
        } as never,
        opponent: {
            name: 'Blaze', level: 5, rarity: 2, dna: 1n, winCount: 3, lossCount: 2, speciesId: 4,
        } as never,
        resultAttackerName: 'Rex',
        resultDefenderName: 'Blaze',
        onResultComplete: () => {},
        resultDialogueDone: true,
        onDone: () => alert('onDone'),
        onBack: () => alert('onBack'),
        tauntsLoading: false,
        onTauntsComplete: () => {},
        fighterName: 'Rex',
        opponentName: 'Blaze',
        liveHp1Percent: 55,
        liveHp2Percent: 30,
        liveFlourish: 'Your pet lands a physical strike — critical hit! (Fury!)',
        liveLog,
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
            <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 999, display: 'flex', gap: 8 }}>
                {scenarios.map((s) => (
                    <button key={s} onClick={() => setScenario(s)} style={{ padding: '6px 10px' }}>
                        {s}
                    </button>
                ))}
            </div>
            {scenario === 'fighting' && (
                <BattleOverlay
                    {...common}
                    open
                    showResult={false}
                    battleOutcome={null}
                    resultTurns={[]}
                    dialogueLoading={false}
                    preResultTitle="The battle is underway…"
                    preResultStatus="Result in — playing out the fight…"
                    tauntsTurns={tauntsTurns}
                />
            )}
            {scenario === 'result-victory' && (
                <BattleOverlay
                    {...common}
                    open
                    showResult
                    battleOutcome={{ result: 'victory', leveledUp: true }}
                    resultTurns={resultTurns}
                    dialogueLoading={false}
                    preResultTitle=""
                    preResultStatus={null}
                    tauntsTurns={[]}
                />
            )}
            {scenario === 'result-defeat' && (
                <BattleOverlay
                    {...common}
                    open
                    showResult
                    battleOutcome={{ result: 'defeat', leveledUp: false }}
                    resultTurns={resultTurns}
                    dialogueLoading={false}
                    preResultTitle=""
                    preResultStatus={null}
                    tauntsTurns={[]}
                />
            )}
        </div>
    );
};

export default BattleOverlayPreview;
