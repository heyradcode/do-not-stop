/**
 * Pet-name limits, measured the way the chains measure them.
 *
 * Both chains cap a name at 32 **bytes** of UTF-8: Solana's `PetAccount::set_name` checks
 * `name.as_bytes().len() <= MAX_NAME_LEN`, and EVM's `_requireValidName` checks
 * `bytes(name_).length` against `GameConfig.maxNameLength`, which is 32. An HTML
 * `maxLength` counts UTF-16 code units instead, so a form capped at 20 happily accepts 20
 * CJK characters (60 bytes) or 10 emoji (40 bytes) and the transaction then reverts in the
 * player's wallet, after they have approved it, with `NameTooLong` or "Invalid name
 * length". The input cap is the wrong unit, not the wrong number.
 *
 * Counted by hand rather than through `TextEncoder`: this package is consumed by React
 * Native as well as the web app, and its lint boundary forbids platform-only modules.
 */

/** UTF-8 bytes a pet name may occupy on either chain. */
export const PET_NAME_MAX_BYTES = 32;

/** Shortest name either chain accepts. EVM requires `len > 0`; Solana does not check. */
export const PET_NAME_MIN_BYTES = 1;

/**
 * UTF-8 byte length of `name`.
 *
 * Iterating the string yields whole code points, so a surrogate pair is counted once as
 * four bytes rather than twice as three.
 */
export const petNameByteLength = (name: string): number => {
    let bytes = 0;
    for (const char of name) {
        const cp = char.codePointAt(0) ?? 0;
        if (cp < 0x80) bytes += 1;
        else if (cp < 0x800) bytes += 2;
        else if (cp < 0x10000) bytes += 3;
        else bytes += 4;
    }
    return bytes;
};

/** True when `name` will be accepted on chain. Trims first, as every caller submits trimmed. */
export const isPetNameWithinChainLimit = (name: string): boolean => {
    const bytes = petNameByteLength(name.trim());
    return bytes >= PET_NAME_MIN_BYTES && bytes <= PET_NAME_MAX_BYTES;
};

/**
 * `name` cut to the longest prefix that still fits on chain, never splitting a character
 * in half. Returns the input untouched when it already fits.
 */
export const truncatePetNameToChainLimit = (name: string): string => {
    if (petNameByteLength(name) <= PET_NAME_MAX_BYTES) return name;

    let bytes = 0;
    let out = '';
    for (const char of name) {
        const size = petNameByteLength(char);
        if (bytes + size > PET_NAME_MAX_BYTES) break;
        bytes += size;
        out += char;
    }
    return out;
};
