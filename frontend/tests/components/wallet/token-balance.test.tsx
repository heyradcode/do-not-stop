import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const formatTokenBalance = vi.fn(() => '12.34567');
vi.mock('@constants/tokens', () => ({ formatTokenBalance: (...a: unknown[]) => formatTokenBalance(...a) }));

import TokenBalance from '@components/wallet/token-balance';

beforeEach(() => vi.clearAllMocks());

describe('TokenBalance', () => {
    it('renders nothing when the balance is missing', () => {
        const { container } = render(
            <TokenBalance symbol="PET" decimals={18} name="Pet Token" balance={null} />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing for a zero bigint or number balance', () => {
        const { container: a } = render(
            <TokenBalance symbol="PET" decimals={18} name="Pet Token" balance={0n} />,
        );
        const { container: b } = render(
            <TokenBalance symbol="PET" decimals={18} name="Pet Token" balance={0} />,
        );
        expect(a).toBeEmptyDOMElement();
        expect(b).toBeEmptyDOMElement();
    });

    it('formats a positive balance to four decimals with symbol and name', () => {
        render(<TokenBalance symbol="PET" decimals={18} name="Pet Token" balance={1500n} />);

        expect(formatTokenBalance).toHaveBeenCalledWith(1500n, 18);
        expect(screen.getByText('Pet Token')).toBeInTheDocument();
        expect(screen.getByText('12.3457')).toBeInTheDocument();
        // Symbol appears in both the info and amount rows.
        expect(screen.getAllByText('PET')).toHaveLength(2);
    });
});
