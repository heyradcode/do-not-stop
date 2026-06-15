import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastProvider, useToast } from '@components/ui/toast';

/** Exposes the toast API as buttons so tests can trigger toasts via the UI. */
const Trigger = () => {
    const toast = useToast();
    return (
        <div>
            <button onClick={() => toast.error('err msg')}>error</button>
            <button onClick={() => toast.info('info msg')}>info</button>
            <button onClick={() => toast.success('ok msg')}>success</button>
            <button onClick={() => toast.show({ message: 'shown' })}>show</button>
        </div>
    );
};

const renderWithProvider = () =>
    render(
        <ToastProvider>
            <Trigger />
        </ToastProvider>,
    );

describe('ToastProvider / useToast', () => {
    it('throws when used outside a provider', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => render(<Trigger />)).toThrow(/useToast must be used within ToastProvider/);
        spy.mockRestore();
    });

    it('shows an error toast with the right role and tone class', async () => {
        renderWithProvider();

        await userEvent.click(screen.getByText('error'));

        const toast = screen.getByRole('status');
        expect(toast).toHaveClass('toast', 'toast-error');
        expect(toast).toHaveTextContent('err msg');
    });

    it('renders info and success tones', async () => {
        renderWithProvider();

        await userEvent.click(screen.getByText('info'));
        await userEvent.click(screen.getByText('success'));

        expect(screen.getByText('info msg').closest('.toast')).toHaveClass('toast-info');
        expect(screen.getByText('ok msg').closest('.toast')).toHaveClass('toast-success');
    });

    it('defaults show() to the error tone', async () => {
        renderWithProvider();

        await userEvent.click(screen.getByText('show'));

        expect(screen.getByText('shown').closest('.toast')).toHaveClass('toast-error');
    });

    it('dismisses a toast when its close button is clicked', async () => {
        renderWithProvider();
        await userEvent.click(screen.getByText('error'));
        expect(screen.getByText('err msg')).toBeInTheDocument();

        await userEvent.click(screen.getByLabelText('Dismiss notification'));

        expect(screen.queryByText('err msg')).not.toBeInTheDocument();
    });

    describe('auto-dismiss', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        it('removes a toast after the auto-dismiss timeout', () => {
            renderWithProvider();

            fireEvent.click(screen.getByText('error'));
            expect(screen.getByText('err msg')).toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(5200);
            });

            expect(screen.queryByText('err msg')).not.toBeInTheDocument();
        });
    });
});
