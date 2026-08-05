/**
 * Route table, mirroring `frontend/src/constants/interactionRoutes.ts` and the
 * sidebar's `NAV_ITEMS`. Same destinations, different shape: frontend renders all
 * seven as sidebar entries, mobile splits them between a tab bar and the stack.
 *
 * Inventory and Shard Forge are deferred in frontend and absent here too, rather
 * than shown disabled: a tab bar has no room to advertise what does not work yet.
 */

/** Screens pushed over the tab shell. `undefined` = takes no params. */
export type RootStackParamList = {
    Landing: undefined;
    Main: undefined;
    Marriage: undefined;
    Rename: { petId?: string } | undefined;
    Defense: { petId?: string } | undefined;
};

export type MainTabParamList = {
    Gallery: undefined;
    Battle: { roomId?: string } | undefined;
    Breed: undefined;
    LevelUp: undefined;
    Train: undefined;
};

export type TabItem = {
    name: keyof MainTabParamList;
    label: string;
    /** Stands in for frontend's per-item SVG; RN has no icon set wired up yet. */
    glyph: string;
};

/**
 * The tab bar, in `NAV_ITEMS` order.
 *
 * Five, not the seven routed sidebar entries: past five a bottom tab bar truncates
 * labels to the point of being unreadable. Marriage and Rename move to the stack
 * because both act on one chosen pet, which is the same reason `defense` is a
 * per-pet action rather than a tab. Moving one back is an edit to this array plus
 * its `RootStackParamList` entry.
 */
export const TAB_ITEMS: readonly TabItem[] = [
    { name: 'Gallery', label: 'Gallery', glyph: '◈' },
    { name: 'Battle', label: 'Battle', glyph: '⚔' },
    { name: 'Breed', label: 'Breed', glyph: '❋' },
    { name: 'LevelUp', label: 'Level Up', glyph: '▲' },
    { name: 'Train', label: 'Train', glyph: '◉' },
];

/** Titles for the stack screens, matching `STANDALONE_INTERACTION_HEADERS`. */
export const STACK_TITLES: Record<Exclude<keyof RootStackParamList, 'Landing' | 'Main'>, string> = {
    Marriage: 'Marriage',
    Rename: 'Rename Pet',
    Defense: 'Allow Challenges',
};
