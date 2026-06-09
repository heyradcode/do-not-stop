import React, { useEffect, useRef, useState } from 'react';
import type { DialogueTurn } from '@shared/core';
import './battle-dialogue.css';

type BattleDialogueProps = {
    turns: DialogueTurn[];
    isLoading: boolean;
    attackerName: string;
    defenderName: string;
    /** Fires once after the last turn finishes animating. */
    onComplete?: () => void;
};

const CHAR_MS = 18; // per-character typing speed
const TURN_PAUSE_MS = 450; // pause between turns

/** Plays the battle conversation turn-by-turn with a typewriter effect. */
const BattleDialogue: React.FC<BattleDialogueProps> = ({
    turns,
    isLoading,
    attackerName,
    defenderName,
    onComplete,
}) => {
    const [shownTurns, setShownTurns] = useState(0);
    const [typed, setTyped] = useState('');

    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const completedRef = useRef(false);

    // Restart only when a *new* conversation begins — not when more turns stream
    // into the current one. The first line stays stable as later lines arrive, so
    // it identifies the conversation; appending more turns must not reset typing.
    const conversationKey = turns.length > 0 ? `${turns[0].speaker}:${turns[0].text}` : '';
    const keyRef = useRef(conversationKey);
    useEffect(() => {
        if (keyRef.current === conversationKey) return;
        keyRef.current = conversationKey;
        setShownTurns(0);
        setTyped('');
        completedRef.current = false;
    }, [conversationKey]);

    // Fire onComplete once, after every turn has finished animating AND the stream
    // has ended (!isLoading) — otherwise it could fire mid-stream when typing
    // briefly catches up to the turns received so far.
    useEffect(() => {
        if (!isLoading && turns.length > 0 && shownTurns >= turns.length && !completedRef.current) {
            completedRef.current = true;
            onCompleteRef.current?.();
        }
    }, [isLoading, turns, shownTurns]);

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
                <span className="thinking">The fighters are talking…</span>
            </div>
        );
    }

    if (turns.length === 0) return null;

    const nameFor = (speaker: DialogueTurn['speaker']) =>
        speaker === 'attacker' ? attackerName : defenderName;

    const renderLine = (turn: DialogueTurn, text: string, key: React.Key) => (
        <div key={key} className={`line is-${turn.speaker} is-${turn.phase}`}>
            <span className="speaker">{nameFor(turn.speaker)}</span>
            <span className="text">{text}</span>
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
