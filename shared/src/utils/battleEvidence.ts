/**
 * Local persistence for the player's own commit-before-reveal evidence (§E, §J).
 *
 * The signed commitment is handed over exactly once, in the response to
 * `POST /api/battle/intents/:intentHash/accept`, and it is the player's proof that the
 * drand round was chosen *before* the randomness existed. `GET /api/battle/:battleId/commitment`
 * will re-serve it, but that is us serving it — the whole point of holding a copy is that the
 * player's evidence does not depend on us continuing to hand it over. So it is written to
 * local storage the moment it arrives, and survives a reload.
 *
 * Deliberately not in React state or a query cache: both are lost on refresh, which is exactly
 * when a player would want the receipt of what they were promised.
 */

/** The subset of the Web Storage API this module needs. */
export interface EvidenceStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

/** One battle's evidence, exactly as the accept response delivered it. */
export interface BattleEvidence {
    battleId: string;
    commitmentHash: string;
    signature: string;
    signingKeyId: string;
    /** The canonical commitment object, as signed. Kept verbatim so it can be re-hashed. */
    commitment: unknown;
    /** Unix milliseconds this client stored it. Local bookkeeping, never protocol input. */
    storedAt: number;
}

const KEY_PREFIX = 'cryptopets.battle-evidence.';
const INDEX_KEY = 'cryptopets.battle-evidence.index';

/**
 * Falls back to a no-op store when Web Storage is unavailable.
 *
 * React Native has no `localStorage`, and a browser in private mode can have one that throws
 * on write. Neither should take down a battle: losing the local copy costs the player a
 * convenience, while an exception here would cost them the fight.
 */
function defaultStore(): EvidenceStore {
    try {
        const candidate = (globalThis as { localStorage?: EvidenceStore }).localStorage;
        if (candidate) {
            // Touching it is what actually proves it works — Safari in private mode exposes
            // the object and throws only on write.
            const probe = `${KEY_PREFIX}probe`;
            candidate.setItem(probe, '1');
            candidate.removeItem(probe);
            return candidate;
        }
    } catch {
        // Fall through to the no-op store.
    }
    return NO_OP_STORE;
}

const NO_OP_STORE: EvidenceStore = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
};

let activeStore: EvidenceStore | null = null;

/** Overrides the store. Mobile passes its own; tests pass an in-memory one. */
export function setEvidenceStore(store: EvidenceStore | null): void {
    activeStore = store;
}

function store(): EvidenceStore {
    return activeStore ?? defaultStore();
}

/** Persists one battle's evidence, replacing any earlier copy for the same battle. */
export function saveBattleEvidence(evidence: BattleEvidence): void {
    try {
        store().setItem(`${KEY_PREFIX}${evidence.battleId}`, JSON.stringify(evidence));
        const index = new Set(listBattleEvidenceIds());
        index.add(evidence.battleId);
        store().setItem(INDEX_KEY, JSON.stringify([...index]));
    } catch {
        // A full or unavailable store must not break the battle it is trying to record.
    }
}

/** Reads one battle's evidence, or null when it was never stored or is unreadable. */
export function readBattleEvidence(battleId: string): BattleEvidence | null {
    try {
        const raw = store().getItem(`${KEY_PREFIX}${battleId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as BattleEvidence;
        // A stored blob that lost its identifying fields is not evidence of anything.
        return typeof parsed?.battleId === 'string' && typeof parsed.commitmentHash === 'string' ? parsed : null;
    } catch {
        return null;
    }
}

/** Every battle id this client holds evidence for, newest last. */
export function listBattleEvidenceIds(): string[] {
    try {
        const raw = store().getItem(INDEX_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

/** Drops one battle's evidence and its index entry. */
export function forgetBattleEvidence(battleId: string): void {
    try {
        store().removeItem(`${KEY_PREFIX}${battleId}`);
        store().setItem(INDEX_KEY, JSON.stringify(listBattleEvidenceIds().filter((id) => id !== battleId)));
    } catch {
        // Nothing to do: the copy is either already gone or unreachable.
    }
}
