/**
 * Gallery screen over a stubbed `usePetGallery`. The composite hook is where the
 * real wiring lives (chain adapter, API client, navigation), so the screen is
 * checked as what it is: a pure view over that hook's return value.
 *
 * `usePetCooldowns` is exercised directly further down, since its tick and label
 * logic is the part with actual behaviour.
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Pet } from '@shared/core';

// `@shared/core`'s barrel re-exports the Solana adapter, so importing anything from
// it drags @solana/web3.js and its transitive runtime into jest. The only thing
// needed here is the two cooldown utils, which are dependency-free, so they are
// pulled from their own module and the barrel is stubbed.
jest.mock('@shared/core', () => ({
    ...jest.requireActual('../../shared/src/utils/ethereum/petReadyTime'),
    // The real card helpers, not fakes: what the card must show is the same number the
    // web app shows, and both read these. A stub here would assert the stub, and the
    // whole point of the card carrying stats is that the two clients agree.
    ...jest.requireActual('../../shared/src/utils/ethereum/petCard'),
    ...jest.requireActual('../../shared/src/utils/pets/skills'),
    getRarityColor: (r: number) => (r === 2 ? '#C0C0C0' : '#8B4513'),
    getRarityName: (r: number) => (r === 2 ? 'Uncommon' : 'Common'),
}));

/** A marker rather than null, so the card can be asserted to draw art at all. */
jest.mock('../src/components/PetArt', () => {
    const { Text: RNText } = jest.requireActual('react-native');
    const React_ = jest.requireActual('react');
    return ({ pet }: { pet: { id: string } }) =>
        React_.createElement(RNText, null, `[art:${pet.id}]`);
});

import {
    getGeneration,
    getPetClass,
    getPetProperties,
    getXpNumbers,
} from '../../shared/src/utils/ethereum/petCard';
import { getPetSkill } from '../../shared/src/utils/pets/skills';

const mockGallery = jest.fn();
jest.mock('../src/hooks/pet-gallery/usePetGallery', () => ({
    usePetGallery: () => mockGallery(),
}));
jest.mock('../src/components/CreatePetModal', () => () => null);
// Both sheets reach for chain hooks this file's `@shared/core` stub does not
// carry, and both have their own suites. This one is about the gallery view.
jest.mock('../src/components/SendPetModal', () => () => null);

import GalleryScreen from '../src/screens/GalleryScreen';
import { usePetCooldowns } from '../src/hooks/usePetCooldowns';

const pet = (over: Partial<Pet> = {}): Pet => ({
    id: '1',
    chain: 'evm',
    name: 'Rex',
    dna: 0n,
    level: 3,
    rarity: 2,
    winCount: 4,
    lossCount: 1,
    readyAt: 0,
    ...over,
});

const readyStatus = {
    onCooldown: false,
    battleReady: true,
    battleOnCooldown: false,
    breedOnCooldown: false,
    trainOnCooldown: false,
    battleLabel: '',
    breedLabel: '',
    trainLabel: '',
};

const galleryValue = (over: Record<string, unknown> = {}) => ({
    pets: [] as Pet[],
    isLoading: false,
    error: null,
    totalWins: 0,
    statusFor: () => readyStatus,
    refreshing: false,
    onRefresh: jest.fn(),
    createPet: {},
    createModalOpen: false,
    onOpenCreateModal: jest.fn(),
    onCloseCreateModal: jest.fn(),
    onBattle: jest.fn(),
    onRename: jest.fn(),
    onDefend: jest.fn(),
    ...over,
});

const textOf = (tree: ReactTestRenderer.ReactTestRenderer): string =>
    tree.root
        .findAllByType(Text)
        .map((node) => {
            const walk = (c: unknown): string =>
                typeof c === 'string' || typeof c === 'number'
                    ? String(c)
                    : Array.isArray(c)
                      ? c.map(walk).join('')
                      : '';
            return walk(node.props.children);
        })
        .join(' | ');

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<GalleryScreen />);
    });
    return tree;
};

describe('GalleryScreen', () => {
    it('shows the pet and win totals', async () => {
        mockGallery.mockReturnValue(
            galleryValue({ pets: [pet(), pet({ id: '2', winCount: 6 })], totalWins: 10 }),
        );
        const rendered = textOf(await render());
        expect(rendered).toContain('Pets');
        expect(rendered).toContain('10');
    });

    it('renders a card per pet with its rarity and record', async () => {
        mockGallery.mockReturnValue(galleryValue({ pets: [pet()], totalWins: 4 }));
        const rendered = textOf(await render());
        expect(rendered).toContain('Rex');
        expect(rendered).toContain('Uncommon');
        expect(rendered).toContain('ID #1');
        expect(rendered).toContain('Level 3');
    });

    /**
     * What the card draws, checked against the shared helpers rather than against
     * literals.
     *
     * The card knew all of this and drew none of it: art, stats, skill and class were
     * one render away the whole time. Asserting against `getPetProperties` and friends
     * rather than hardcoded numbers is what makes this a parity test — if the card ever
     * reads the wrong field, the expectation moves with the helper and the test still
     * catches it.
     */
    it('shows the DNA stat tiles, from the same helper the web app uses', async () => {
        const subject = pet();
        mockGallery.mockReturnValue(galleryValue({ pets: [subject] }));
        const rendered = textOf(await render());

        const props = getPetProperties(subject);
        for (const [label, value] of [
            ['STR', props.attack],
            ['INT', props.intelligence],
            ['DEF', props.defense],
            ['VIT', props.life],
        ] as const) {
            expect(rendered).toContain(label);
            expect(rendered).toContain(String(value));
        }
        // AGI is deliberately absent: nothing in the data model backs it.
        expect(rendered).not.toContain('AGI');
    });

    it('names the species skill and the pet class', async () => {
        const subject = pet({ speciesId: 3 });
        mockGallery.mockReturnValue(galleryValue({ pets: [subject] }));
        const rendered = textOf(await render());

        expect(rendered).toContain(getPetSkill(3)!.name);
        expect(rendered).toContain(getPetClass(subject.dna));
        expect(rendered).toContain(`Gen ${subject.generation ?? getGeneration(subject.dna)}`);
    });

    it('omits the skill block for a pet with no species, rather than showing an empty one', async () => {
        // Solana pets and older EVM rows carry no speciesId, and `getPetSkill` returns
        // null for them. A bordered empty block would read as a missing value.
        const subject = pet();
        expect(subject.speciesId).toBeUndefined();
        mockGallery.mockReturnValue(galleryValue({ pets: [subject] }));

        const rendered = textOf(await render());
        expect(rendered).toContain('Rex');
        expect(rendered).not.toContain(getPetSkill(0)!.name);
    });

    it('shows XP as current over max rather than a bare number', async () => {
        const subject = pet();
        mockGallery.mockReturnValue(galleryValue({ pets: [subject] }));
        const rendered = textOf(await render());

        const xp = getXpNumbers(subject);
        expect(rendered).toContain(`${xp.xpCurrent}/${xp.xpMax}`);
    });

    it('shows a win rate only once the pet has fought', async () => {
        mockGallery.mockReturnValue(galleryValue({ pets: [pet({ winCount: 3, lossCount: 1 })] }));
        expect(textOf(await render())).toContain('75% win rate');

        mockGallery.mockReturnValue(galleryValue({ pets: [pet({ winCount: 0, lossCount: 0 })] }));
        // 0% would read as a losing record rather than as no record at all.
        expect(textOf(await render())).not.toContain('win rate');
    });

    it('draws the pet art, which the card omitted entirely until now', async () => {
        mockGallery.mockReturnValue(galleryValue({ pets: [pet({ id: '7' })] }));
        expect(textOf(await render())).toContain('[art:7]');
    });

    it('surfaces the empty state rather than an empty list', async () => {
        mockGallery.mockReturnValue(galleryValue());
        expect(textOf(await render())).toContain('No pets yet');
    });

    it('shows a load failure instead of pretending the roster is empty', async () => {
        mockGallery.mockReturnValue(galleryValue({ error: new Error('rpc down') }));
        const rendered = textOf(await render());
        expect(rendered).toContain('Could not load pets');
        expect(rendered).toContain('rpc down');
    });

    it('renders cooldown countdowns when a pet is not ready', async () => {
        mockGallery.mockReturnValue(
            galleryValue({
                pets: [pet()],
                statusFor: () => ({
                    ...readyStatus,
                    onCooldown: true,
                    battleReady: false,
                    battleOnCooldown: true,
                    battleLabel: '2h 5m',
                }),
            }),
        );
        expect(textOf(await render())).toContain('Battle ready in 2h 5m');
    });
});

describe('usePetCooldowns', () => {
    const Probe = ({ pets, onStatus }: { pets: Pet[]; onStatus: (s: unknown) => void }) => {
        const { anyCooldown, statusFor } = usePetCooldowns(pets);
        onStatus({ anyCooldown, status: pets[0] ? statusFor(pets[0]) : null });
        return null;
    };

    const probe = async (pets: Pet[]) => {
        const seen: { anyCooldown: boolean; status: { onCooldown: boolean } | null }[] = [];
        let tree!: ReactTestRenderer.ReactTestRenderer;
        await ReactTestRenderer.act(() => {
            tree = ReactTestRenderer.create(
                <Probe pets={pets} onStatus={(s) => seen.push(s as never)} />,
            );
        });
        // A pet on cooldown starts a 1s interval. Without unmounting, the hook's
        // cleanup never runs and jest hangs after the assertions pass.
        await ReactTestRenderer.act(() => {
            tree.unmount();
        });
        return seen[seen.length - 1];
    };

    it('reports a ready pet as off cooldown', async () => {
        const result = await probe([pet({ readyAt: 0 })]);
        expect(result.anyCooldown).toBe(false);
        expect(result.status?.onCooldown).toBe(false);
    });

    it('reports a future readyAt as on cooldown', async () => {
        const future = Math.floor(Date.now() / 1000) + 3600;
        const result = await probe([pet({ readyAt: future })]);
        expect(result.anyCooldown).toBe(true);
        expect(result.status?.onCooldown).toBe(true);
    });

    it('treats an absent breed/train cooldown as ready, not as zero', async () => {
        // breedReadyAt/trainReadyAt are optional on Pet; a missing one must not read
        // as epoch 0 and it must not read as blocked either.
        const result = await probe([pet({ readyAt: 0, breedReadyAt: undefined })]);
        expect(result.status?.onCooldown).toBe(false);
    });
});
