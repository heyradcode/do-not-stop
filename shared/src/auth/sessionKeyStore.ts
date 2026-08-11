import { Wallet } from 'ethers';

/**
 * The client-held key that signs battle intents, and where it lives (§D).
 *
 * The key is generated here and never leaves the browser. That is the entire reason a
 * delegation is acceptable where a JWT was not: a JWT is minted by the operator, so
 * accepting one as battle authorization would let the operator fight as any player, while
 * a key it has never seen cannot be forged by it.
 *
 * **`sessionStorage`, not `localStorage`.** The key is a bearer credential for starting
 * battles, so how long a stolen copy stays useful is the thing worth minimizing.
 * `sessionStorage` is per-tab and cleared when the tab closes, which bounds it to one
 * browsing session; `localStorage` would survive browser restarts and turn a single XSS
 * into weeks of authority. The stored record also carries its own expiry and is treated as
 * absent once past it, so a tab left open overnight re-prompts rather than drifting past
 * the window the owner actually agreed to.
 *
 * What a stolen key can do is bounded by the delegation, not by this file: battle intents
 * for the delegating wallet, nothing else. It cannot transfer, breed, equip, spend items,
 * or grant defence consent — the first four because the chain checks `msg.sender` and this
 * key is not an account the chain knows, and the last because the scope excludes it.
 */

const STORAGE_KEY = 'cryptopets.battleSession.v1';

export interface StoredSessionKey {
    /** Hex private key. Never leaves this origin. */
    privateKey: string;
    /** Address derived from it, which is what the delegation names. */
    address: string;
    /** Wallet this key was delegated by. A different wallet must not reuse it. */
    owner: string;
    /** Protocol chain id the delegation was signed against. */
    chainId: string;
    /** Unix seconds. Past this the record is treated as absent. */
    expiresAt: number;
}

/**
 * Generates a fresh key. Not stored until a delegation for it has actually been signed,
 * so a refused or abandoned wallet prompt leaves nothing behind to be reused later.
 */
export function createSessionKey(): { privateKey: string; address: string } {
    const wallet = Wallet.createRandom();
    return { privateKey: wallet.privateKey, address: wallet.address.toLowerCase() };
}

/**
 * The usable key for this wallet and chain, or null.
 *
 * Null covers every reason a caller cares about equally: none stored, expired, or stored
 * for a different wallet or chain. All of them mean the same thing to a caller — prompt for
 * a delegation — and distinguishing them would invite branching on a difference that does
 * not change what happens next.
 */
export function loadSessionKey(owner: string, chainId: string, nowSeconds: number): StoredSessionKey | null {
    const raw = readStorage();
    if (!raw) {
        return null;
    }
    let stored: StoredSessionKey;
    try {
        stored = JSON.parse(raw) as StoredSessionKey;
    } catch {
        // Unreadable is the same as absent, and clearing it stops a corrupt record from
        // being re-parsed on every render for the life of the tab.
        clearSessionKey();
        return null;
    }

    const matches =
        stored.owner === owner.toLowerCase() &&
        stored.chainId === chainId &&
        typeof stored.privateKey === 'string' &&
        typeof stored.address === 'string';
    if (!matches || stored.expiresAt <= nowSeconds) {
        return null;
    }
    return stored;
}

export function saveSessionKey(key: StoredSessionKey): void {
    writeStorage(JSON.stringify({ ...key, owner: key.owner.toLowerCase(), address: key.address.toLowerCase() }));
}

export function clearSessionKey(): void {
    try {
        globalThis.sessionStorage?.removeItem(STORAGE_KEY);
    } catch {
        // Storage can throw in private modes and sandboxed frames. Losing the key costs a
        // wallet prompt, which is the failure this whole mechanism is willing to accept.
    }
}

function readStorage(): string | null {
    try {
        return globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? null;
    } catch {
        return null;
    }
}

function writeStorage(value: string): void {
    try {
        globalThis.sessionStorage?.setItem(STORAGE_KEY, value);
    } catch {
        // Same reasoning as `clearSessionKey`: a session that cannot be persisted simply
        // prompts per battle, which is where this started.
    }
}
