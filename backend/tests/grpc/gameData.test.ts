import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env', () => ({
    env: { indexerGrpc: { addr: '', protoPath: undefined } },
}));

import { resolveProtoPath } from '../../src/grpc/gameData';

describe('resolveProtoPath', () => {
    it('finds proto/cryptopets.proto from the monorepo root cwd', () => {
        const repoRoot = path.resolve(__dirname, '../../..');
        const prev = process.cwd();
        process.chdir(repoRoot);
        try {
            expect(resolveProtoPath()).toBe(path.join(repoRoot, 'proto', 'cryptopets.proto'));
        } finally {
            process.chdir(prev);
        }
    });

    it('finds ../proto/cryptopets.proto when cwd is backend/', () => {
        const backendRoot = path.resolve(__dirname, '../..');
        const prev = process.cwd();
        process.chdir(backendRoot);
        try {
            expect(resolveProtoPath()).toBe(
                path.resolve(backendRoot, '..', 'proto', 'cryptopets.proto'),
            );
        } finally {
            process.chdir(prev);
        }
    });
});
