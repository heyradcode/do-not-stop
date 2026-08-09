import { describe, expect, it } from 'vitest';

import { findItem, ITEM_CATALOG, RARITY_NAMES } from './items.js';

/**
 * The drift guard for `items.ts`.
 *
 * This package cannot import from `backend/` at build or run time — it is not a workspace
 * member, has its own lockfile, and installs with `--ignore-workspace` — so the catalog is
 * necessarily duplicated. The import below works anyway *at test time*, from a repo checkout,
 * because `catalog.data.ts`'s only import is type-only and erases: Vitest transforms the file
 * standalone with no backend dependencies resolved.
 *
 * So the copy exists, but shipping a stale one fails this suite rather than silently serving
 * a marketplace the wrong name, the wrong stats, or a 404 for an item that now exists.
 *
 * If this file ever cannot reach the backend source (a published tarball, a sparse checkout),
 * fix the path or drop the test deliberately — do not weaken the assertion to make it pass.
 */
/**
 * Imported through a computed URL rather than a literal specifier, deliberately.
 *
 * A static import would make `tsc` follow catalog.data.ts into the backend's `catalog.ts`,
 * on into `@shared/core/node`, and fail this package's `typecheck` on shared's extensionless
 * relative imports — which are fine under the workspace's resolution and not under this
 * package's `node16`. Only the *values* are wanted here, and only at test time, so the
 * specifier is hidden from the type checker while Vitest still resolves it at runtime.
 */
const backendCatalogUrl = new URL(
    '../../../backend/src/features/inventory/catalog.data.ts',
    import.meta.url,
).href;

interface SeedLike {
    itemType: string;
    key: string;
    [field: string]: unknown;
}

const backendCatalog = await import(/* @vite-ignore */ backendCatalogUrl).then(
    (m: { ITEM_CATALOG: readonly SeedLike[] }) => m.ITEM_CATALOG,
);

describe('the item catalog copy', () => {
    it('covers exactly the items the backend ships', () => {
        expect(ITEM_CATALOG.map((i) => i.itemType).sort()).toEqual(
            backendCatalog.map((i) => i.itemType).sort(),
        );
    });

    // Field by field rather than a whole-object compare: the backend seed carries fields this
    // service has no use for, and a mismatch should name the item and the field.
    it.each(['key', 'category', 'slot', 'rarity', 'name', 'description', 'effect'])(
        'matches the backend on %s',
        (field) => {
            for (const source of backendCatalog) {
                const local = findItem(source.itemType);
                expect(local, `item ${source.itemType} missing from items.ts`).toBeDefined();
                expect(
                    (local as unknown as SeedLike)[field],
                    `item ${source.itemType} (${source.key}) differs on ${field}`,
                ).toEqual(source[field]);
            }
        },
    );
});

describe('lookups', () => {
    it('finds an item by token id', () => {
        expect(findItem('1')?.key).toBe('iron_fang');
    });

    it('returns undefined for a type nobody defined, which the route turns into a 404', () => {
        expect(findItem('99999')).toBeUndefined();
    });

    it('names every rarity the catalog actually uses', () => {
        for (const item of ITEM_CATALOG) {
            expect(RARITY_NAMES[item.rarity], `rarity ${item.rarity} has no name`).toBeTruthy();
        }
    });
});
