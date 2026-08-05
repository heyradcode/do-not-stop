/**
 * Covers the toast provider and the three app-local hooks bound to it. The point of
 * the RN provider is that `useNotifyError` / `usePetErrorToast` / `useTxErrorToast`
 * port over from frontend unchanged, so these assert the wiring rather than the
 * error parsing: `usePetError` and `useTxError` live in `@shared/core` and are
 * mocked here, since reaching the real ones means booting the chain adapter.
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

// The viewport measures a bottom inset, which needs a SafeAreaProvider and a real
// frame. Neither is what these tests are about.
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUsePetError = jest.fn();
const mockUseTxError = jest.fn();
jest.mock('@shared/core', () => ({
    usePetError: (...args: unknown[]) => mockUsePetError(...args),
    useTxError: (...args: unknown[]) => mockUseTxError(...args),
}));

import { ToastProvider, useToast } from '../src/components/ui/toast';
import { useNotifyError } from '../src/hooks/useNotifyError';
import { usePetErrorToast } from '../src/hooks/usePetErrorToast';
import { useTxErrorToast } from '../src/hooks/useTxErrorToast';

/** Every string rendered in the tree, so assertions do not depend on layout. */
const textOf = (tree: ReactTestRenderer.ReactTestRenderer): string => {
    const walk = (node: unknown): string => {
        if (typeof node === 'string') return node;
        if (Array.isArray(node)) return node.map(walk).join(' ');
        if (node && typeof node === 'object' && 'children' in node) {
            return walk((node as { children: unknown }).children);
        }
        return '';
    };
    return walk(tree.toJSON());
};

const renderInProvider = async (Component: React.FC) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <ToastProvider>
                <Component />
            </ToastProvider>,
        );
    });
    return tree;
};

beforeEach(() => {
    // Fake timers throughout: the 5200ms auto-dismiss otherwise outlives the test
    // that started it and fires a setState into a later one, which surfaces as an
    // act() warning and a failure in whichever test happens to be running.
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockUsePetError.mockReset();
    mockUseTxError.mockReset();
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('ToastProvider', () => {
    it('throws when useToast is called outside it', () => {
        const Orphan = () => {
            useToast();
            return null;
        };
        expect(() =>
            ReactTestRenderer.act(() => {
                ReactTestRenderer.create(<Orphan />);
            }),
        ).toThrow('useToast must be used within ToastProvider');
    });

    it('renders a toast for each tone', async () => {
        const Fixture = () => {
            const toast = useToast();
            return (
                <Text
                    onPress={() => {
                        toast.error('went wrong');
                        toast.info('heads up');
                        toast.success('all good');
                    }}
                >
                    go
                </Text>
            );
        };
        const tree = await renderInProvider(Fixture);
        expect(textOf(tree)).not.toContain('went wrong');

        await ReactTestRenderer.act(() => {
            tree.root.findByType(Text).props.onPress();
        });

        const rendered = textOf(tree);
        expect(rendered).toContain('went wrong');
        expect(rendered).toContain('heads up');
        expect(rendered).toContain('all good');
    });

    it('auto-dismisses', async () => {
        const Fixture = () => {
            const toast = useToast();
            return <Text onPress={() => toast.error('temporary')}>go</Text>;
        };
        const tree = await renderInProvider(Fixture);
        await ReactTestRenderer.act(() => {
            tree.root.findByType(Text).props.onPress();
        });
        expect(textOf(tree)).toContain('temporary');

        await ReactTestRenderer.act(() => {
            jest.advanceTimersByTime(5200);
        });
        expect(textOf(tree)).not.toContain('temporary');
    });
});

describe('useNotifyError', () => {
    it('shows the message and logs the raw error', async () => {
        const raw = new Error('revert 0x123');
        const Fixture = () => {
            const notify = useNotifyError();
            return <Text onPress={() => notify('Could not level up', raw, 'level-up')}>go</Text>;
        };
        const tree = await renderInProvider(Fixture);
        await ReactTestRenderer.act(() => {
            tree.root.findByType(Text).props.onPress();
        });

        expect(textOf(tree)).toContain('Could not level up');
        expect(console.error).toHaveBeenCalledWith('[level-up]', raw);
    });
});

describe('usePetErrorToast', () => {
    it('fires a toast when a pet action fails', async () => {
        mockUsePetError.mockReturnValue({
            message: 'Not enough ETH',
            isUserRejection: false,
            isContractError: true,
        });
        const Fixture = () => {
            usePetErrorToast(new Error('insufficient funds'), null, null, 'fallback');
            return null;
        };
        const tree = await renderInProvider(Fixture);
        expect(textOf(tree)).toContain('Not enough ETH');
    });

    it('stays quiet when there is no error', async () => {
        mockUsePetError.mockReturnValue({
            message: null,
            isUserRejection: false,
            isContractError: false,
        });
        const Fixture = () => {
            usePetErrorToast(null, null, null, 'fallback');
            return null;
        };
        const tree = await renderInProvider(Fixture);
        expect(textOf(tree)).toBe('');
    });
});

describe('useTxErrorToast', () => {
    it('fires a toast when a write fails', async () => {
        mockUseTxError.mockReturnValue({ message: 'Transaction failed', isUserRejection: false });
        const Fixture = () => {
            useTxErrorToast(new Error('reverted'));
            return null;
        };
        const tree = await renderInProvider(Fixture);
        expect(textOf(tree)).toContain('Transaction failed');
    });

    it('routes a user rejection to info rather than error', async () => {
        // Tone is what separates "you cancelled" from "something broke"; a rejection
        // shown in the error tone reads as a fault the player has to act on.
        mockUseTxError.mockReturnValue({ message: 'You rejected the request', isUserRejection: true });
        const Fixture = () => {
            useTxErrorToast(new Error('User rejected'));
            return null;
        };
        const tree = await renderInProvider(Fixture);
        expect(textOf(tree)).toContain('You rejected the request');
        expect(console.error).toHaveBeenCalled();
    });
});
