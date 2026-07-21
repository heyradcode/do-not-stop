import fs from 'node:fs';
import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { env } from '@config/env';

/**
 * Shared loader for the GameDataService client constructor (proto/cryptopets.proto
 * at the repo root — the contract indexer-go serves). Loaded once per process.
 */

export type GameDataClientCtor = new (
    addr: string,
    creds: grpc.ChannelCredentials,
) => grpc.Client;

let cached: GameDataClientCtor | null = null;

/** Resolve cryptopets.proto whether cwd is the monorepo root (Render) or backend/. */
export function resolveProtoPath(): string {
    if (env.indexerGrpc.protoPath) {
        return env.indexerGrpc.protoPath;
    }

    const candidates = [
        // Render / `node backend/dist/...` from monorepo root
        path.resolve(process.cwd(), 'proto', 'cryptopets.proto'),
        // Local `pnpm --prefix backend` / nodemon with cwd=backend
        path.resolve(process.cwd(), '..', 'proto', 'cryptopets.proto'),
        // Compiled: backend/dist/src/grpc → repo root
        path.resolve(__dirname, '../../../../proto/cryptopets.proto'),
        // tsx/dev: backend/src/grpc → repo root
        path.resolve(__dirname, '../../../proto/cryptopets.proto'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(
        `cryptopets.proto not found (set INDEXER_PROTO_PATH). Tried:\n  ${candidates.join('\n  ')}`,
    );
}

export function loadGameDataService(): GameDataClientCtor {
    if (cached) return cached;

    const protoPath = resolveProtoPath();
    const definition = protoLoader.loadSync(protoPath, {
        keepCase: false,
        longs: String,
        defaults: true,
        oneofs: true,
    });
    const loaded = grpc.loadPackageDefinition(definition) as unknown as {
        cryptopets: { GameDataService: GameDataClientCtor };
    };
    cached = loaded.cryptopets.GameDataService;
    return cached;
}
