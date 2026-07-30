/**
 * Checks the trait name tables against the game's own lists.
 *
 * Two claims in traits.ts are about *agreement with something else*, and nothing
 * verified either:
 *
 * - `BODY_NAMES` is indexed to match the eight passive skill archetypes, so a
 *   pet's silhouette reads as its skill. Both are keyed by `speciesId % 8`, so if
 *   the archetype list is ever reordered, a pet drawn as a Phoenix would have the
 *   Tank skill. Nothing would fail; the art would just quietly stop meaning
 *   anything.
 * - `ELEMENT_NAMES` is in the element wheel's order, which is what decides a
 *   pet's palette and the `Element` trait in its metadata.
 *
 * The service keeps its own copies so it stays standalone, which is exactly why
 * they need checking against the originals rather than against themselves.
 *
 * Skipped when the monorepo is absent. Test-time reads, not build dependencies.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BODY_NAMES, ELEMENT_NAMES } from './traits.js';

const SKILLS = join('..', 'shared', 'src', 'utils', 'pets', 'skills.ts');
const PET_CARD = join('..', 'shared', 'src', 'utils', 'ethereum', 'petCard.ts');

const describeIf = (...paths: string[]) => (paths.every(existsSync) ? describe : describe.skip);

/**
 * The intended pairing, written down so a reorder on either side fails loudly
 * instead of silently mismatching art to skill. Index is `speciesId % 8` for both.
 */
const BODY_FOR_SKILL: readonly [skill: string, body: string][] = [
    ['Tank', 'Bulwark'],
    ['Shell', 'Shelled'],
    ['Swift', 'Sleek'],
    ['Cunning', 'Sly'],
    ['Fury', 'Brute'],
    ['Sage', 'Mystic'],
    ['Rebirth', 'Phoenix'],
    ['Bloodlust', 'Fanged'],
];

describeIf(SKILLS)('body silhouettes vs the skill archetypes', () => {
    const source = readFileSync(SKILLS, 'utf8');
    const skills = [...source.matchAll(/name:\s*'([A-Za-z]+)'/g)].map((m) => m[1]!);

    it('found the archetype list', () => {
        expect(skills.length).toBeGreaterThan(4);
    });

    it('has one silhouette per archetype', () => {
        expect(BODY_NAMES).toHaveLength(skills.length);
    });

    // Both are indexed by speciesId % 8, so position is the whole contract.
    it('pairs each silhouette with the archetype at the same index', () => {
        expect(skills).toEqual(BODY_FOR_SKILL.map(([skill]) => skill));
        expect([...BODY_NAMES]).toEqual(BODY_FOR_SKILL.map(([, body]) => body));
    });
});

describeIf(PET_CARD)('element names vs the game element wheel', () => {
    const source = readFileSync(PET_CARD, 'utf8');
    const match = /const elements = \[([^\]]+)\]/.exec(source);

    it('found the element list', () => {
        expect(match).not.toBeNull();
    });

    // Order is the palette: element 1 must mean the same thing in both places, or
    // a pet's metadata would name one element while the app names another.
    it('is the same list in the same order', () => {
        const theirs = match![1]!.split(',').map((s) => s.trim().replace(/'/g, ''));
        const capitalised = theirs.map((name) => name[0]!.toUpperCase() + name.slice(1));

        expect([...ELEMENT_NAMES]).toEqual(capitalised);
    });
});
