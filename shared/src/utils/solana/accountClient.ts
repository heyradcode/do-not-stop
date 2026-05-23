import type { Idl, Program } from '@coral-xyz/anchor';

export type AnchorAccountClient = {
    fetch: (key: unknown) => Promise<unknown>;
    fetchNullable: (key: unknown) => Promise<unknown>;
    all: (filters?: unknown) => Promise<{ publicKey: unknown; account: Record<string, unknown> }[]>;
};

/**
 * Resolve an Anchor account-namespace client by IDL account name. Anchor 0.31+ exposes
 * camelCase keys (`globalState`); older IDLs used PascalCase (`GlobalState`) — we try both.
 */
export function getAccountClient(program: Program<Idl>, name: string): AnchorAccountClient {
    const acc = program.account as Record<string, Partial<AnchorAccountClient> | undefined>;
    const pascal = name.charAt(0).toUpperCase() + name.slice(1);
    const client = acc[name] ?? acc[pascal];
    if (!client) {
        throw new Error(`IDL has no account client for "${name}"`);
    }
    return client as AnchorAccountClient;
}
