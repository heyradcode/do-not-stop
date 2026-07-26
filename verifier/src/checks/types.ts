/** One check's outcome: which check, whether it passed, and detail on failure. */
export interface CheckResult {
    check: string;
    ok: boolean;
    detail?: string;
    /**
     * Which receipt this result is about, as its `battleId` (or its hash, when the receipt
     * was too malformed to have a readable id).
     *
     * Absent for checks that are about a *run* rather than a single receipt —
     * `chain-continuity` is the only one — which name the offending position in their
     * detail instead.
     */
    subject?: string;
}
