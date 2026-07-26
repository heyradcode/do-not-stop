/** One check's outcome: which check, whether it passed, and detail on failure. */
export interface CheckResult {
    check: string;
    ok: boolean;
    detail?: string;
}
