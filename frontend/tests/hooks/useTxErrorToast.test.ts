import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const toast = { error: vi.fn(), info: vi.fn(), success: vi.fn() };
const useTxError = vi.fn();

vi.mock('@components/ui/toast', () => ({ useToast: () => toast }));
vi.mock('@shared/core', () => ({ useTxError: (...args: unknown[]) => useTxError(...args) }));

import { useTxErrorToast } from '@hooks/useTxErrorToast';

describe('useTxErrorToast', () => {
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it('does nothing when there is no parsed error', () => {
        useTxError.mockReturnValue(null);

        renderHook(() => useTxErrorToast(undefined));

        expect(toast.error).not.toHaveBeenCalled();
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('shows an error toast and logs for a hard failure', () => {
        useTxError.mockReturnValue({ message: 'Tx failed', isUserRejection: false });
        const writeError = new Error('reverted');

        renderHook(() => useTxErrorToast(writeError));

        expect(toast.error).toHaveBeenCalledWith('Tx failed');
        expect(consoleError).toHaveBeenCalledWith('[contract-write]', writeError);
    });

    it('shows an info toast for a user rejection', () => {
        useTxError.mockReturnValue({ message: 'Cancelled', isUserRejection: true });

        renderHook(() => useTxErrorToast(new Error('User rejected')));

        expect(toast.info).toHaveBeenCalledWith('Cancelled');
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('does not re-toast the same error on re-render', () => {
        useTxError.mockReturnValue({ message: 'Tx failed', isUserRejection: false });
        const writeError = new Error('reverted');

        const { rerender } = renderHook(() => useTxErrorToast(writeError));
        rerender();
        rerender();

        expect(toast.error).toHaveBeenCalledTimes(1);
    });
});
