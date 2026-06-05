import { z } from 'zod';
import { env } from '@config/env';
import type { Persona } from './dialogue.persona';
import {
    SYSTEM_PROMPT,
    TAUNT_SYSTEM_PROMPT,
    JSON_FORMAT_INSTRUCTION,
    buildUserMessage,
    buildTauntUserMessage,
    MAX_TURNS,
    MAX_TURN_CHARS,
} from './dialogue.prompt';
import type {
    DialoguePhase,
    DialogueTurn,
    GenerateDialogueInput,
} from './dialogue.types';

const DEFENDER_ALIASES = ['defender', 'fighter_b', 'b', 'opponent'] as const;

const TurnSchema = z.object({
    speaker: z
        .string()
        .transform((v) => (DEFENDER_ALIASES.includes(v.toLowerCase().trim() as typeof DEFENDER_ALIASES[number]) ? 'defender' : 'attacker')),
    phase: z
        .string()
        .transform((v) => (v === 'result' ? 'result' : 'taunt')),
    text: z
        .string()
        .min(1)
        .transform((v) => v.trim().slice(0, MAX_TURN_CHARS)),
});

const ResponseSchema = z.object({
    turns: z.array(TurnSchema).min(1).max(MAX_TURNS),
});

/**
 * Generate battle dialogue via the Hugging Face OpenAI-compatible chat router,
 * called with plain `fetch` (no SDK). Output is requested as a strict JSON object
 * and parsed defensively; on failure the caller (service) falls back to templated
 * lines. Throws on unrecoverable failure so the service can degrade gracefully.
 */

interface ChatCompletionResponse {
    choices?: { message?: { content?: string } }[];
}

const MAX_OUTPUT_TOKENS = 512;
const TEMPERATURE = 0.8;
const ATTEMPTS = 2; // small models occasionally wrap or malform JSON

/** Parse and validate the model's JSON response with Zod, tolerating fences/extra prose. */
function extractTurns(content: string): DialogueTurn[] {
    const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        throw new Error('no JSON object in model response');
    }

    const raw = JSON.parse(cleaned.slice(start, end + 1));
    const { turns } = ResponseSchema.parse(raw);
    return turns as DialogueTurn[];
}

async function callOnce(system: string, user: string): Promise<DialogueTurn[]> {
    const res = await fetch(env.hf.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.hf.apiToken}`,
        },
        body: JSON.stringify({
            model: env.hf.model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            max_tokens: MAX_OUTPUT_TOKENS,
            temperature: TEMPERATURE,
        }),
    });

    if (!res.ok) {
        throw new Error(`HF inference failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('HF response had no content');
    }
    return extractTurns(content);
}

async function generateWithRetry(system: string, user: string): Promise<DialogueTurn[]> {
    let lastError: unknown;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        try {
            const turns = await callOnce(system, user);
            if (turns.length > 0) return turns;
            lastError = new Error('model returned an empty conversation');
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError ?? new Error('HF dialogue generation failed');
}

export async function generateDialogueViaHf(
    input: GenerateDialogueInput,
    attacker: Persona,
    defender: Persona,
    rivalry?: string,
    banter?: string,
): Promise<DialogueTurn[]> {
    if (!env.hf.apiToken) {
        throw new Error('HF_API_TOKEN not set');
    }

    const system = `${SYSTEM_PROMPT}\n\n${JSON_FORMAT_INSTRUCTION}`;
    const user = buildUserMessage(input, attacker, defender, rivalry, banter);
    return generateWithRetry(system, user);
}

/**
 * Generate PRE-FIGHT taunts only (no outcome). Every returned turn is forced to
 * `phase: 'taunt'` so a stray `result` from the model can't leak the winner.
 */
export async function generateTauntsViaHf(
    attackerName: string,
    defenderName: string,
    attacker: Persona,
    defender: Persona,
    rivalry?: string,
    banter?: string,
): Promise<DialogueTurn[]> {
    if (!env.hf.apiToken) {
        throw new Error('HF_API_TOKEN not set');
    }

    const system = `${TAUNT_SYSTEM_PROMPT}\n\n${JSON_FORMAT_INSTRUCTION}`;
    const user = buildTauntUserMessage(attackerName, defenderName, attacker, defender, rivalry, banter);
    const turns = await generateWithRetry(system, user);
    return turns.map((t) => ({ ...t, phase: 'taunt' as DialoguePhase }));
}
