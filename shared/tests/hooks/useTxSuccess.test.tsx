// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTxSuccess } from '../../src/hooks/useTxSuccess';
import type { TxLifecycle } from '../../src/hooks/adapters/types';

const makeLifecycle = (
    phase: TxLifecycle['phase'],
    reset = vi.fn(),
): TxLifecycle => ({
    phase,
    error: null,
    reset,
});

describe('useTxSuccess', () => {
    it('calls onSuccess and resets once when the lifecycle reaches success', () => {
        const onSuccess = vi.fn();
        const reset = vi.fn();

        renderHook(() => useTxSuccess(makeLifecycle('success', reset), onSuccess));

        expect(onSuccess).toHaveBeenCalledOnce();
        expect(reset).toHaveBeenCalledOnce();
    });

    it('does not fire again while success remains handled', () => {
        const onSuccess = vi.fn();
        const reset = vi.fn();
        const { rerender } = renderHook(
            ({ lifecycle }) => useTxSuccess(lifecycle, onSuccess),
            { initialProps: { lifecycle: makeLifecycle('success', reset) } },
        );

        rerender({ lifecycle: makeLifecycle('success', reset) });

        expect(onSuccess).toHaveBeenCalledOnce();
        expect(reset).toHaveBeenCalledOnce();
    });

    it('arms again after leaving success', () => {
        const onSuccess = vi.fn();
        const reset = vi.fn();
        const { rerender } = renderHook(
            ({ lifecycle }) => useTxSuccess(lifecycle, onSuccess),
            { initialProps: { lifecycle: makeLifecycle('success', reset) } },
        );

        rerender({ lifecycle: makeLifecycle('idle', reset) });
        rerender({ lifecycle: makeLifecycle('success', reset) });

        expect(onSuccess).toHaveBeenCalledTimes(2);
        expect(reset).toHaveBeenCalledTimes(2);
    });

    it('uses the latest callback when success arrives', () => {
        const first = vi.fn();
        const latest = vi.fn();
        const reset = vi.fn();
        const { rerender } = renderHook(
            ({ lifecycle, onSuccess }) => useTxSuccess(lifecycle, onSuccess),
            { initialProps: { lifecycle: makeLifecycle('idle', reset), onSuccess: first } },
        );

        rerender({ lifecycle: makeLifecycle('success', reset), onSuccess: latest });

        expect(first).not.toHaveBeenCalled();
        expect(latest).toHaveBeenCalledOnce();
    });
});
