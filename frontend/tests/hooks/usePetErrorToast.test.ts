import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const toast = { error: vi.fn(), info: vi.fn(), success: vi.fn() };
const usePetError = vi.fn();

vi.mock('@components/ui/toast', () => ({ useToast: () => toast }));
vi.mock('@shared/core', () => ({ usePetError: (...args: unknown[]) => usePetError(...args) }));

import { usePetErrorToast } from '@hooks/usePetErrorToast';

describe('usePetErrorToast', () => {
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it('does nothing when there is no display message', () => {
        usePetError.mockReturnValue({ message: '', isUserRejection: false });

        renderHook(() => usePetErrorToast(null, null, null, 'fallback'));

        expect(toast.error).not.toHaveBeenCalled();
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('shows an error toast and logs the receipt error first', () => {
        usePetError.mockReturnValue({ message: 'Feeding failed', isUserRejection: false });
        const receiptError = new Error('receipt boom');

        renderHook(() => usePetErrorToast(null, receiptError, null, 'fallback'));

        expect(toast.error).toHaveBeenCalledWith('Feeding failed');
        expect(consoleError).toHaveBeenCalledWith('[pet-action] receipt error:', receiptError);
    });

    it('logs the mutation error when there is no receipt error', () => {
        usePetError.mockReturnValue({ message: 'Mint failed', isUserRejection: false });
        const mutationError = new Error('mutation boom');

        renderHook(() => usePetErrorToast(mutationError, null, null, 'fallback'));

        expect(consoleError).toHaveBeenCalledWith('[pet-action] mutation error:', mutationError);
    });

    it('shows an info toast for a user rejection', () => {
        usePetError.mockReturnValue({ message: 'Cancelled', isUserRejection: true });

        renderHook(() => usePetErrorToast(null, null, 'bad input', 'fallback'));

        expect(toast.info).toHaveBeenCalledWith('Cancelled');
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('does not re-toast the same error on re-render', () => {
        usePetError.mockReturnValue({ message: 'Feeding failed', isUserRejection: false });
        const receiptError = new Error('receipt boom');

        const { rerender } = renderHook(() =>
            usePetErrorToast(null, receiptError, null, 'fallback'),
        );
        rerender();

        expect(toast.error).toHaveBeenCalledTimes(1);
    });
});
