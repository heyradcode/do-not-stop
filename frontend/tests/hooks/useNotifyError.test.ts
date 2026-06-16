import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const toast = { error: vi.fn(), info: vi.fn(), success: vi.fn() };
vi.mock('@components/ui/toast', () => ({ useToast: () => toast }));

import { useNotifyError } from '@hooks/useNotifyError';

describe('useNotifyError', () => {
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it('shows an error toast and logs the raw error under the context tag', () => {
        const { result } = renderHook(() => useNotifyError());
        const raw = new Error('boom');

        result.current('Something broke', raw, 'mint');

        expect(toast.error).toHaveBeenCalledWith('Something broke');
        expect(consoleError).toHaveBeenCalledWith('[mint]', raw);
    });

    it('logs the message itself when no raw error is given', () => {
        const { result } = renderHook(() => useNotifyError());

        result.current('Plain message');

        expect(consoleError).toHaveBeenCalledWith('[action]', 'Plain message');
        expect(toast.error).toHaveBeenCalledWith('Plain message');
    });
});

