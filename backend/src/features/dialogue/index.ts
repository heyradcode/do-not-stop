/**
 * Public surface of the dialogue feature. External code imports from
 * `@features/dialogue` so the internal layout (llm/, taunt/, result/, shared/)
 * can change without touching call sites.
 */
export type {
    DialogueTurn,
    DialogueSpeaker,
    DialoguePhase,
    PetPersonaInput,
    GenerateDialogueInput,
    GenerateTauntsInput,
    DialogueResult,
} from './dialogue.types';

export { resolveBattleDialogue, streamBattleTaunts } from './dialogue.controller';
