import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PROTOCOL_PACKAGE } from '../src/index';

/**
 * Licensing guard, not a smoke test. §H of the battle architecture only works if
 * outsiders can run the verifier, and the verifier depends on this package. Two
 * things therefore have to stay true, and both are easy to break by accident:
 * this package stays MIT, and it never pulls in a PolyForm-licensed dependency.
 */
describe('package licensing', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

    it('is MIT so third parties can run the receipt verifier', () => {
        expect(pkg.license).toBe('MIT');
    });

    it('depends on no PolyForm-licensed workspace package', () => {
        const polyform = ['@shared/core', 'backend', 'frontend', 'mobile', 'website'];
        const declared = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.devDependencies });
        expect(declared.filter((name) => polyform.includes(name))).toEqual([]);
    });

    it('exports its identity', () => {
        expect(PROTOCOL_PACKAGE).toBe(pkg.name);
    });
});
