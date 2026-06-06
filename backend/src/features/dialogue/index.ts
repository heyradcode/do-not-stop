/**
 * Public surface of the dialogue feature. External code imports from
 * `@features/dialogue` so the internal layout (prompting/, generation/) can
 * change without touching call sites.
 */
export type {
    DialogueTurn,
    DialogueSpeaker,
    DialoguePhase,
    PetPersonaInput,
    GenerateDialogueInput,
    GenerateTauntsInput,
    TauntsResult,
    DialogueResult,
} from './dialogue.types';

export { postBattleDialogue, postBattleTaunts } from './dialogue.controller';
