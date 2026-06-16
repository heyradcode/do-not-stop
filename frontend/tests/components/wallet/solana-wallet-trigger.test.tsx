import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@solana/wallet-adapter-react-ui', () => ({
    WalletMultiButton: () => <button className="wallet-adapter-button">connect</button>,
}));

import SolanaWalletTrigger from '@components/wallet/solana-wallet-trigger';

afterEach(() => vi.restoreAllMocks());

describe('SolanaWalletTrigger', () => {
    it('clicks the underlying wallet button on a solana-connect event', () => {
        render(<SolanaWalletTrigger />);

        const btn = document.querySelector('.wallet-adapter-button') as HTMLElement;
        const clickSpy = vi.spyOn(btn, 'click');

        window.dispatchEvent(new Event('solana-connect'));

        expect(clickSpy).toHaveBeenCalledOnce();
    });

    it('removes its listener on unmount', () => {
        const removeSpy = vi.spyOn(window, 'removeEventListener');
        const { unmount } = render(<SolanaWalletTrigger />);

        unmount();

        expect(removeSpy).toHaveBeenCalledWith('solana-connect', expect.any(Function));
    });
});
