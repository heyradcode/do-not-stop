/**
 * Deterministic visual-trait derivation for pet NFT art
 * (docs/plan-future-features-roadmap.md §9). Pure integer math over the same
 * 16-digit DNA the combat sim reads, so a pet's art is reproducible from
 * (dna, rarity, speciesId) alone: nothing is stored, nothing is inferred.
 *
 * Digit-pair budget. The canonical layout lives in
 * contracts/ethereum/src/DnaLib.sol; `digitPair` below is re-implemented rather
 * than imported from @shared/core so this service stays deployable on its own,
 * with no monorepo package as a build dependency. It is two-digit slicing of a
 * decimal number, not combat math, so there is nothing here to drift.
 *
 *   pair 0     element gene  -> palette family (element = pair0 % 6)
 *   pairs 1-5  combat genes  -> proportions only (build, spark)
 *   pair 6     species pair  -> body archetype when speciesId is absent (v1/Solana)
 *   pair 7     cosmetic pair -> pattern / eyes / marking, decomposed 5 x 4 x 5 = 100
 *
 * Traits are plain indices; palette and geometry live elsewhere so this
 * derivation stays portable if Solidity or Rust ever needs the same trait
 * vector (roadmap §9's cross-chain parity note).
 */

/** Body archetypes, indexed to match the game's 8 passive skill archetypes
 *  (body = speciesId % 8), so a pet's silhouette reads as its skill. The pairing
 *  is checked against shared/src/utils/pets/skills.ts in traitAlignment.test.ts:
 *  a reorder on either side would otherwise draw a Phoenix with the Tank skill
 *  and fail nothing. */
export const BODY_NAMES = [
    'Bulwark',
    'Shelled',
    'Sleek',
    'Sly',
    'Brute',
    'Mystic',
    'Phoenix',
    'Fanged',
] as const;

export const PATTERN_NAMES = ['Solid', 'Spotted', 'Striped', 'Patched', 'Dappled'] as const;

export const EYE_NAMES = ['Round', 'Sharp', 'Sleepy', 'Blazing'] as const;

export const MARKING_NAMES = ['None', 'Mask', 'Blaze', 'Cheeks', 'Crown'] as const;

/** Element order matches DnaLib's element wheel, and is checked against the
 *  game's own list in traitAlignment.test.ts: the index decides both the palette
 *  and the Element trait, so the two must name element 1 the same thing. */
export const ELEMENT_NAMES = ['Fire', 'Water', 'Electric', 'Nature', 'Shadow', 'Cosmic'] as const;

export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;

export interface PetArtInput {
    dna: bigint;
    rarity: number;
    /** v2 EVM pets only; v1/Solana pets fall back to DNA pair 6. */
    speciesId?: number;
}

/** One pet's appearance, fully determined by its DNA plus stored rarity and
 *  species. Every field is a small non-negative index except build/spark (0-99). */
export interface PetVisualTraits {
    /** 0-5, palette family. */
    element: number;
    /** 0-7, silhouette (see BODY_NAMES). */
    body: number;
    /** 0-4, coat pattern. */
    pattern: number;
    /** 0-3, eye style. */
    eyes: number;
    /** 0-4, face marking. */
    marking: number;
    /** 0-4 (rarity - 1): frame and glow tier. */
    aura: number;
    /** 0-99 body girth, from the HP gene. */
    build: number;
    /** 0-99 eye and aura intensity, from the INT gene. */
    spark: number;
}

/** Two-digit value at pairIdx (0-indexed, LSB-first): (dna / 100^pairIdx) % 100.
 *  Mirrors DnaLib.digitPair. */
export const digitPair = (dna: bigint, pairIdx: number): bigint => (dna / 100n ** BigInt(pairIdx)) % 100n;

const mod = (value: number, m: number): number => ((Math.trunc(value) % m) + m) % m;

export const derivePetVisualTraits = ({ dna, rarity, speciesId }: PetArtInput): PetVisualTraits => {
    const cosmetic = Number(digitPair(dna, 7));

    return {
        element: Number(digitPair(dna, 0) % 6n),
        body: mod(speciesId ?? Number(digitPair(dna, 6)), BODY_NAMES.length),
        pattern: cosmetic % PATTERN_NAMES.length,
        eyes: Math.floor(cosmetic / 5) % EYE_NAMES.length,
        marking: Math.floor(cosmetic / 20) % MARKING_NAMES.length,
        aura: clampRarity(rarity) - 1,
        build: Number(digitPair(dna, 1)),
        spark: Number(digitPair(dna, 4)),
    };
};

/** Rarity as a 1-5 tier, tolerating the 0 an unset/legacy record can carry. */
export const clampRarity = (rarity: number): number => Math.min(5, Math.max(1, Math.trunc(rarity) || 1));

/** Human-readable trait labels, in the order ERC-721 metadata `attributes`
 *  lists them. */
export const describePetVisualTraits = (traits: PetVisualTraits): { trait: string; value: string }[] => [
    { trait: 'Element', value: ELEMENT_NAMES[traits.element]! },
    { trait: 'Body', value: BODY_NAMES[traits.body]! },
    { trait: 'Pattern', value: PATTERN_NAMES[traits.pattern]! },
    { trait: 'Eyes', value: EYE_NAMES[traits.eyes]! },
    { trait: 'Marking', value: MARKING_NAMES[traits.marking]! },
    { trait: 'Rarity', value: RARITY_NAMES[traits.aura]! },
];
