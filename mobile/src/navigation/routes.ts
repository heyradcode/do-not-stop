/**
 * Route table, mirroring `frontend/src/constants/interactionRoutes.ts` and the
 * sidebar's `NAV_ITEMS`. Same destinations, different shape: frontend renders all
 * seven as sidebar entries, mobile splits them between a tab bar and the stack.
 *
 * Inventory is routed now, on the stack rather than the tab bar. Shard Forge is
 * still absent rather than shown disabled: a tab bar has no room to advertise what
 * does not work yet.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
    Gallery: undefined;
    /**
     * `roomId` mirrors frontend's optional `/battle/:roomId?` segment, set once
     * Start Battle mints a room. `petId` is the pet a Gallery action came in with,
     * which frontend passes as router state rather than in the path.
     */
    Battle: { roomId?: string; petId?: string } | undefined;
    Breed: undefined;
    LevelUp: undefined;
    Train: undefined;
};

/** Screens pushed over the tab shell. `undefined` = takes no params. */
export type RootStackParamList = {
    Landing: undefined;
    /** `NavigatorScreenParams` is what makes `navigate('Main', { screen, params })` type-check. */
    Main: NavigatorScreenParams<MainTabParamList> | undefined;
    Marriage: undefined;
    Rename: { petId?: string } | undefined;
    Defense: { petId?: string } | undefined;
    /**
     * Read-only, and reached from the account sheet rather than the tab bar. Frontend
     * routes it as a seventh sidebar entry, which a five-slot bottom bar has no room
     * for without truncating every label to fit a screen nobody opens mid-battle.
     */
    Leaderboard: undefined;
    /** The bag, reached from the account sheet. Acts on no single pet. */
    Inventory: undefined;
    /** Gear one pet. Per-pet, so it arrives from a gallery action like Rename. */
    Equip: { petId?: string } | undefined;
    /**
     * Private chat with the players you are married to. One screen holding both the
     * thread list and a conversation: a phone has no room for frontend's side-by-side
     * layout, and a thread is not a route of its own because access is rechecked per
     * request rather than being a property of the URL.
     */
    Chat: undefined;
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
    Leaderboard: 'Leaderboard',
    Inventory: 'Inventory',
    Equip: 'Equip',
    Chat: 'Messages',
};

/**
 * The drawer, in the order it lists them. Labels come from `STACK_TITLES`, so a screen is
 * named the same in the menu and in the header it pushes.
 *
 * These five are the account-level destinations: none of them acts on a pet you picked. That
 * is why `Rename` and `Equip` are absent — both arrive from a tapped pet card carrying its
 * id, and a menu has no pet to offer. They used to be rows in `AccountSheet`, which made the
 * wallet control double as the app's navigation.
 *
 * `RootNavigator` derives its no-transition set from this array rather than repeating it, so
 * a route added here cannot end up in the menu without the transition fix that goes with it.
 */
export const DRAWER_ITEMS: readonly (keyof typeof STACK_TITLES)[] = [
    'Defense',
    'Marriage',
    'Leaderboard',
    'Chat',
    'Inventory',
];
