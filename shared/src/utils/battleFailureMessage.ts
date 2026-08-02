/**
 * Turns a battle submit/accept rejection into something a player can act on.
 *
 * The backend already answers with a precise reason (`no-authorization`,
 * `attacker-level-below-band`, …) and the right status code. Without this the whole
 * payload is buried inside an Axios error, every failure looks identical on screen,
 * and the only way to tell "this opponent has not allowed challenges" from "your pet
 * is on cooldown" is to read the server's database.
 *
 * Reasons come from `intent.controller.ts` and `accept.controller.ts`. An unmapped
 * code falls through to its own text rather than a generic message, so a reason added
 * server-side degrades to something still diagnosable instead of disappearing.
 */

const MESSAGES: Record<string, string> = {
    // Submitting the intent.
    'malformed-intent': 'That battle request was malformed. Try again.',
    'wrong-deployment': 'This app is pointed at a different deployment than the server. Reload the page.',
    'wallet-mismatch': 'The signing wallet does not match the one you are signed in with.',
    'wrong-signature-format': 'That signature format was not recognised.',
    'bad-signature': 'The signature could not be verified. Try again.',
    'unknown-pet': 'One of those pets is not on record yet.',
    'not-pet-owner': 'You can only attack with a pet you own.',
    'self-battle': 'A pet cannot battle itself.',
    'nonce-already-used': 'That battle request was already used. Try again.',
    'duplicate-intent': 'That battle request was already submitted.',

    // Accepting it.
    'intent-already-consumed': 'That battle has already started.',
    'attacker-not-ready': 'Your pet is still on cooldown.',
    'defender-not-ready': 'That opponent is still on cooldown.',
    'not-yet-valid': 'This opponent is not accepting challenges yet.',
    expired: 'That battle request expired. Try again.',
    'no-authorization': "This opponent's owner has not allowed challenges yet.",
    'pet-not-covered': "That pet is not covered by its owner's challenge settings.",
    'attacker-level-below-band': 'Your pet is too low level for this opponent.',
    'attacker-level-above-band': 'Your pet is too high level for this opponent.',
    'ruleset-mismatch': "This opponent's consent was signed under older rules. They need to re-allow challenges.",
    revoked: 'This opponent has withdrawn consent to be challenged.',
    'daily-cap-reached': 'This opponent has hit their battle limit for today.',
};

/** Shape of the error body both battle controllers return. */
interface RejectionBody {
    error?: unknown;
    detail?: unknown;
}

function rejectionCode(err: unknown): string | null {
    if (typeof err !== 'object' || err === null) return null;
    const response = (err as { response?: { data?: RejectionBody } }).response;
    const code = response?.data?.error;
    return typeof code === 'string' && code.length > 0 ? code : null;
}

/**
 * A refusal the server explained, as opposed to a chain or network failure.
 *
 * Tagged rather than a bare Error because the EVM adapter's `parseError` rewrites any
 * message it does not recognise into a generic "Transaction failed", which would throw
 * away the reason. UIs test for this and show `message` directly.
 */
export class BattleRejectionError extends Error {
    readonly isBattleRejection = true as const;
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'BattleRejectionError';
        this.code = code;
    }
}

/** Structural guard — survives duplicate module instances, unlike `instanceof`. */
export function isBattleRejection(err: unknown): err is BattleRejectionError {
    return (
        typeof err === 'object' &&
        err !== null &&
        (err as { isBattleRejection?: unknown }).isBattleRejection === true
    );
}

/**
 * Converts a failed battle request into an explained rejection, or `null` when the
 * failure is not a server refusal (a dropped connection, a wallet the user closed)
 * and the caller's own fallback is the better text.
 */
export function toBattleRejection(err: unknown): BattleRejectionError | null {
    const code = rejectionCode(err);
    if (!code) return null;
    return new BattleRejectionError(code, MESSAGES[code] ?? `Battle refused: ${code}`);
}

/** True when the failure is one the defender's owner fixes by granting consent. */
export function isConsentFailure(err: unknown): boolean {
    const code = isBattleRejection(err) ? err.code : rejectionCode(err);
    return code === 'no-authorization' || code === 'pet-not-covered' || code === 'revoked';
}
