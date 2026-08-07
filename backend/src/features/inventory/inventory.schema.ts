import { z } from 'zod';

import { SUPPORTED_CHAINS } from '@typings/chain';

/**
 * Request shapes for the inventory writes (roadmap §4).
 *
 * Ids that are uint256 on chain stay decimal strings rather than becoming numbers, since a
 * token id or pet id past 2^53 would silently lose precision on the way through JSON.
 */

const decimalId = z.string().regex(/^[0-9]+$/, 'must be a decimal id');

/** Most of one item a single grant may hand out. A sanity bound, not a balance rule. */
export const MAX_GRANT_QUANTITY = 1000;

/** Body of POST /api/inventory/use. */
export const UseItemSchema = z.object({
    chain: z.enum(SUPPORTED_CHAINS),
    petId: decimalId,
    itemType: decimalId,
});

/** Body of POST /api/inventory/entitlements/:id/claim — nothing but the path id. */
export const ClaimSchema = z.object({});

/**
 * Body of POST /api/inventory/admin/grant.
 *
 * The recipient is an argument here, unlike everywhere else in this feature, because
 * granting to yourself is not what the route is for. Authorization is the allowlist, not
 * the shape.
 */
export const GrantSchema = z.object({
    chain: z.enum(SUPPORTED_CHAINS),
    owner: z.string().min(1).max(128),
    itemType: decimalId,
    quantity: z.number().int().positive().max(MAX_GRANT_QUANTITY).default(1),
});
