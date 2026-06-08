import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiClient } from '../contexts/ApiClientContext';
import { getStorageAdapter } from '../api';
import type { PetChain } from '../types/pet';
import type { DialoguePetInput, DialogueTurn } from './useBattleDialogue';

export interface GenerateTauntsVars {
    chain: PetChain;
    attacker: DialoguePetInput;
    defender: DialoguePetInput;
}

interface TauntsLine {
    turns?: DialogueTurn[];
}

const STREAM_PATH = '/api/battle-dialogue/taunts/stream';
const FALLBACK_PATH = '/api/battle-dialogue/taunts';

/**
 * Generate the AI pre-fight taunts for a matchup, streamed from
 * `POST /api/battle-dialogue/taunts/stream`. Called imperatively on "Start Battle"
 * so it runs in parallel with the wallet confirmation, updating `turns` as each
 * line lands. AI-only: there is no templated fallback, so a failure leaves `turns`
 * empty (the battle still proceeds).
 *
 * Transport: the streamed body is read incrementally where supported (browsers).
 * Where it isn't (React Native has no readable `response.body`), the same NDJSON
 * arrives in one shot and we use its final line. A non-OK response or network
 * error falls back once to the non-streaming endpoint.
 */
export function useBattleTaunts() {
    const apiClient = useApiClient();
    const [turns, setTurns] = useState<DialogueTurn[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const reset = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setTurns([]);
        setIsLoading(false);
    }, []);

    // Abort any in-flight stream on unmount.
    useEffect(() => () => abortRef.current?.abort(), []);

    const run = useCallback(
        async (vars: GenerateTauntsVars) => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            setTurns([]);
            setIsLoading(true);

            const apply = (line: string) => {
                const trimmed = line.trim();
                if (!trimmed) return;
                try {
                    const parsed = JSON.parse(trimmed) as TauntsLine;
                    if (parsed.turns && !controller.signal.aborted) setTurns(parsed.turns);
                } catch {
                    // Ignore a malformed/partial line; the next snapshot supersedes it.
                }
            };

            const fallback = async () => {
                const { data } = await apiClient.post<{ turns: DialogueTurn[] }>(
                    FALLBACK_PATH,
                    vars,
                    { signal: controller.signal },
                );
                if (!controller.signal.aborted) setTurns(data.turns ?? []);
            };

            try {
                const adapter = getStorageAdapter();
                const token = adapter ? await adapter.getToken() : null;
                const baseURL = apiClient.defaults.baseURL ?? '';

                const res = await fetch(`${baseURL}${STREAM_PATH}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify(vars),
                    signal: controller.signal,
                });

                if (!res.ok) {
                    await fallback();
                } else if (!res.body || typeof res.body.getReader !== 'function') {
                    // No incremental reader (React Native): take the final snapshot.
                    const text = await res.text();
                    const lines = text.split('\n').filter((l) => l.trim());
                    apply(lines[lines.length - 1] ?? '');
                } else {
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    for (;;) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() ?? '';
                        for (const line of lines) apply(line);
                    }
                    apply(buffer);
                }
            } catch (err) {
                if ((err as Error)?.name === 'AbortError') return;
                // Network/stream failure: try the non-streaming endpoint once.
                try {
                    await fallback();
                } catch {
                    // Leave turns empty — the battle proceeds without banter.
                }
            } finally {
                if (abortRef.current === controller) {
                    setIsLoading(false);
                    abortRef.current = null;
                }
            }
        },
        [apiClient],
    );

    // Fire-and-forget for callers (matches the old mutate() signature).
    const generate = useCallback((vars: GenerateTauntsVars) => void run(vars), [run]);

    return { generate, reset, turns, isLoading };
}
