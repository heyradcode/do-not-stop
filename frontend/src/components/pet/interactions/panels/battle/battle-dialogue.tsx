import React, { useEffect, useState } from 'react';
import type { DialogueTurn } from '@shared/core';
import './battle-dialogue.css';

type BattleDialogueProps = {
    turns: DialogueTurn[];
    isLoading: boolean;
    attackerName: string;
    defenderName: string;
};

const CHAR_MS = 18; // per-character typing speed
const TURN_PAUSE_MS = 450; // pause between turns

/** Plays the battle conversation turn-by-turn with a typewriter effect. */
const BattleDialogue: React.FC<BattleDialogueProps> = ({
    turns,
    isLoading,
    attackerName,
    defenderName,
}) => {
    const [shownTurns, setShownTurns] = useState(0);
    const [typed, setTyped] = useState('');

    // Restart the animation whenever a new conversation arrives.
    useEffect(() => {
        setShownTurns(0);
        setTyped('');
    }, [turns]);

    useEffect(() => {
        const current = turns[shownTurns];
        if (!current) return;

        if (typed.length < current.text.length) {
            const id = window.setTimeout(
                () => setTyped(current.text.slice(0, typed.length + 1)),
                CHAR_MS,
            );
            return () => window.clearTimeout(id);
        }

        const id = window.setTimeout(() => {
            setShownTurns((c) => c + 1);
            setTyped('');
        }, TURN_PAUSE_MS);
        return () => window.clearTimeout(id);
    }, [turns, shownTurns, typed]);

    if (isLoading && turns.length === 0) {
        return (
            <div className="battle-dialogue is-loading" aria-live="polite">
                <span className="battle-dialogue-thinking">The fighters are talking…</span>
            </div>
        );
    }

    if (turns.length === 0) return null;

    const nameFor = (speaker: DialogueTurn['speaker']) =>
        speaker === 'attacker' ? attackerName : defenderName;

    const renderLine = (turn: DialogueTurn, text: string, key: React.Key) => (
        <div key={key} className={`battle-dialogue-line is-${turn.speaker} is-${turn.phase}`}>
            <span className="battle-dialogue-speaker">{nameFor(turn.speaker)}</span>
            <span className="battle-dialogue-text">{text}</span>
        </div>
    );

    const inProgress = turns[shownTurns];

    return (
        <div className="battle-dialogue" aria-live="polite">
            {turns.slice(0, shownTurns).map((turn, i) => renderLine(turn, turn.text, i))}
            {inProgress ? renderLine(inProgress, typed, 'typing') : null}
        </div>
    );
};

export default BattleDialogue;
