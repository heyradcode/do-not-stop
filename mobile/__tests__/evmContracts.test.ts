/**
 * Contract addresses are keyed by chain because the app is playable on more than
 * one deployment. The failure this guards against is silent: a single shared set
 * sends reads for the chain the wallet is on to the *other* chain's proxy, which
 * returns an empty `0x` that reads like a decode bug rather than a wrong address.
 * That is exactly how the frontend ended up querying Sepolia addresses on Base
 * Sepolia.
 */

import { baseSepolia, sepolia } from 'wagmi/chains';

import {
    evmContractsFor,
    hasEvmDeployment,
    resolveEvmDeployment,
} from '../src/chains/ethereum/contracts';

describe('resolveEvmDeployment', () => {
    it('knows the Sepolia proxies', () => {
        const d = resolveEvmDeployment(sepolia.id);
        expect(d.petCore).toMatch(/^0x[0-9a-fA-F]{40}$/);
        expect(d.gameLogic).toMatch(/^0x[0-9a-fA-F]{40}$/);
        expect(d.gameLogic).not.toBe(d.petCore);
    });

    it('returns nothing for a chain with no deployment', () => {
        expect(resolveEvmDeployment(1)).toEqual({});
    });

    it('does not borrow another chain’s addresses', () => {
        // The whole point of the map. If Base Sepolia ever silently answers with
        // Sepolia's proxies, pet reads there hit a contract that does not exist.
        const base = resolveEvmDeployment(baseSepolia.id);
        const eth = resolveEvmDeployment(sepolia.id);
        if (base.petCore) {
            expect(base.petCore).not.toBe(eth.petCore);
            expect(base.gameLogic).not.toBe(eth.gameLogic);
        }
    });
});

describe('hasEvmDeployment', () => {
    it('is true only where both required proxies are known', () => {
        expect(hasEvmDeployment(sepolia.id)).toBe(true);
        expect(hasEvmDeployment(1)).toBe(false);
    });

    it('tracks whatever the map says for Base Sepolia', () => {
        // Base Sepolia's proxies were never created: the 2026-08-06 deploy stalled
        // after the implementations. This asserts the map and the predicate agree,
        // rather than pinning a value that changes the day the deploy completes.
        const d = resolveEvmDeployment(baseSepolia.id);
        expect(hasEvmDeployment(baseSepolia.id)).toBe(Boolean(d.petCore && d.gameLogic));
    });

    it('ignores GameConfig, which only degrades fee display', () => {
        const d = resolveEvmDeployment(sepolia.id);
        expect(Boolean(d.petCore && d.gameLogic)).toBe(true);
        expect(hasEvmDeployment(sepolia.id)).toBe(true);
    });
});

describe('evmContractsFor', () => {
    it('carries the same ABIs to every chain', () => {
        // Proxies differ per chain; the interface does not.
        const a = evmContractsFor(sepolia.id);
        const b = evmContractsFor(baseSepolia.id);
        expect(a.petCore.abi).toBe(b.petCore.abi);
        expect(a.gameLogic.abi).toBe(b.gameLogic.abi);
    });

    it('leaves the address undefined where there is no deployment', () => {
        // `PetsEvmConfig.address` is optional and read hooks stay disabled without
        // it, so an unknown chain degrades instead of pointing somewhere wrong.
        const c = evmContractsFor(1);
        expect(c.petCore.address).toBeUndefined();
        expect(c.gameLogic.address).toBeUndefined();
        expect(c.petCore.abi).toBeDefined();
    });

    it('exposes a real PetCore read surface', () => {
        const names = (evmContractsFor(sepolia.id).petCore.abi as unknown as { name?: string }[])
            .map((e) => e.name)
            .filter(Boolean);
        expect(names).toEqual(expect.arrayContaining(['ownerOf', 'balanceOf', 'getPet']));
    });
});
