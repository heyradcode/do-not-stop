import { BN } from '@coral-xyz/anchor';

/** Coerce Anchor-decoded numeric account fields (often `BN`) to a JS `number` for u32-sized values. */
export const toU32 = (n: unknown): number  => {
    if (BN.isBN(n)) {
        return (n as BN).toNumber();
    }
    return Number(n);
}
