/** Internal action id (`interactions/:action`; `rename` segment → changename). */
export type InteractionAction = 'breed' | 'battle' | 'levelup' | 'changename';

/** Standalone page titles for `/breed` … `/rename` (dashboard hub uses its own header). */
export const STANDALONE_INTERACTION_HEADERS: Record<InteractionAction, { title: string; sub: string }> = {
  breed: { title: '🥚 Breeding Lab', sub: 'Breed two pets to create a new one' },
  battle: { title: '⚔️ Battle Arena', sub: 'Pick two pets to fight' },
  levelup: { title: '⬆️ Level Up', sub: 'Pay a small fee to level up your pet' },
  changename: { title: '✏️ Rename Pet', sub: "Change your pet's name" },
};

/** Dashboard home (hub + gallery). */
export const DASHBOARD_HOME = '/dashboard';

/** Top-level interaction routes (e.g. /breed) — no gallery; interaction UI only. */
export const BREED_PATH = '/breed';
export const BATTLE_PATH = '/battle';
export const LEVELUP_PATH = '/levelup';
export const RENAME_PATH = '/rename';

/** Routes where the layout shows only the interaction flow (gallery hidden). */
export const INTERACTION_ROUTES: readonly string[] = [
  BREED_PATH,
  BATTLE_PATH,
  LEVELUP_PATH,
  RENAME_PATH,
];

/** Nested interactions under dashboard (legacy / bookmarked URLs). */
export const DASHBOARD_INTERACTIONS = '/dashboard/interactions';

export type InteractionSlug = 'breed' | 'battle' | 'levelup' | 'rename';

export function isInteractionRoute(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  if (INTERACTION_ROUTES.includes(path)) return true;
  // Also hide the gallery for legacy /dashboard/interactions/* pages
  // (so PetInteractions and PetGallery don't fight for the same space).
  return path === DASHBOARD_INTERACTIONS || path.startsWith(`${DASHBOARD_INTERACTIONS}/`);
}

export function interactionPath(slug: InteractionSlug): string {
  return `${DASHBOARD_INTERACTIONS}/${slug}`;
}
