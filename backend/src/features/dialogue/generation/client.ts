import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@config/env';
import type { Persona } from '../prompting/persona';
import {
    SYSTEM_PROMPT,
    TAUNT_SYSTEM_PROMPT,
    JSON_FORMAT_INSTRUCTION,
    TAUNT_JSON_FORMAT_INSTRUCTION,
    buildUserMessage,
    buildTauntUserMessage,
} from '../prompting/prompt';
import { ResponseSchema, MAX_TURNS, TAUNT_TURNS } from '../dialogue.schema';
import type { DialogueTurn, GenerateDialogueInput } from '../dialogue.types';

/** True when an HF token is configured (generation can run). */
export function isHuggingFaceConfigured(): boolean {
    return Boolean(env.hf.apiToken);
}

function hfModel() {
    // .chat() targets /v1/chat/completions — HF router uses chat completions, not the Responses API
    return createOpenAI({ apiKey: env.hf.apiToken ?? '', baseURL: env.hf.baseUrl }).chat(env.hf.model);
}

async function generate(system: string, user: string): Promise<DialogueTurn[]> {
    // output: 'no-schema' makes the OpenAI provider send response_format
    // { type: 'json_object' } — JSON mode without a grammar. The HF router rejects
    // the json_schema grammar, but json_object still constrains the decoder to emit
    // syntactically valid JSON, so we get back a parseable object every time. We
    // validate the shape ourselves with ResponseSchema.
    const { object } = await generateObject({
        model: hfModel(),
        output: 'no-schema',
        maxOutputTokens: 1024,
        temperature: 0.8,
        maxRetries: 1,
        system,
        prompt: user,
    });
    const result = ResponseSchema.parse(object);
    // Clamp over-produced turns instead of failing the parse. The settled path
    // caps here; the taunt path trims further to TAUNT_TURNS in its caller.
    return result.turns.slice(0, MAX_TURNS) as DialogueTurn[];
}

export async function generateDialogueViaHf(
    input: GenerateDialogueInput,
    attacker: Persona,
    defender: Persona,
    rivalry?: string,
    banter?: string,
): Promise<DialogueTurn[]> {
    if (!isHuggingFaceConfigured()) {
        throw new Error('HF inference is not configured (HF_API_TOKEN unset)');
    }
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
    if (!isHuggingFaceConfigured()) {
        throw new Error('HF inference is not configured (HF_API_TOKEN unset)');
    }
    const turns = await generate(
        `${TAUNT_SYSTEM_PROMPT}\n\n${TAUNT_JSON_FORMAT_INSTRUCTION}`,
        buildTauntUserMessage(attackerName, defenderName, attacker, defender, rivalry, banter),
    );
    // Pre-fight: drop any result-phase line the model emitted anyway (never
    // relabel result text as a taunt — that leaks the outcome), then cap to a
    // tight 4-message back-and-forth even if the model over-produced.
    return turns.filter((t) => t.phase !== 'result').slice(0, TAUNT_TURNS);
}
