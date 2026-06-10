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

export function loadGameDataService(): GameDataClientCtor {
    if (cached) return cached;

    const protoPath =
        env.indexerGrpc.protoPath ?? path.resolve(process.cwd(), '..', 'proto', 'cryptopets.proto');
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
