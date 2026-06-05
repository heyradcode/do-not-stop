import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@config/env';
import type { Persona } from './dialogue.persona';
import {
    SYSTEM_PROMPT,
    TAUNT_SYSTEM_PROMPT,
    JSON_FORMAT_INSTRUCTION,
    buildUserMessage,
    buildTauntUserMessage,
} from './dialogue.prompt';
import { ResponseSchema } from './dialogue.schema';
import type { DialoguePhase, DialogueTurn, GenerateDialogueInput } from './dialogue.types';

function hfModel() {
    return createOpenAI({ apiKey: env.hf.apiToken ?? '', baseURL: env.hf.baseUrl })(env.hf.model);
}

async function generate(system: string, user: string): Promise<DialogueTurn[]> {
    const { object } = await generateObject({
        model: hfModel(),
        schema: ResponseSchema,
        maxOutputTokens: 512,
        temperature: 0.8,
        maxRetries: 1,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
    });
    return object.turns as DialogueTurn[];
}

export async function generateDialogueViaHf(
    input: GenerateDialogueInput,
    attacker: Persona,
    defender: Persona,
    rivalry?: string,
    banter?: string,
): Promise<DialogueTurn[]> {
    if (!env.hf.apiToken) throw new Error('HF_API_TOKEN not set');
    return generate(
        `${SYSTEM_PROMPT}\n\n${JSON_FORMAT_INSTRUCTION}`,
        buildUserMessage(input, attacker, defender, rivalry, banter),
    );
}

export async function generateTauntsViaHf(
    attackerName: string,
    defenderName: string,
    attacker: Persona,
    defender: Persona,
    rivalry?: string,
    banter?: string,
): Promise<DialogueTurn[]> {
    if (!env.hf.apiToken) throw new Error('HF_API_TOKEN not set');
    const turns = await generate(
        `${TAUNT_SYSTEM_PROMPT}\n\n${JSON_FORMAT_INSTRUCTION}`,
        buildTauntUserMessage(attackerName, defenderName, attacker, defender, rivalry, banter),
    );
    return turns.map((t) => ({ ...t, phase: 'taunt' as DialoguePhase }));
}
