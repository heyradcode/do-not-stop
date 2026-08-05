/**
 * Dev tool: grant a standing DefenseAuthorization (§D) from a raw private key.
 *
 * The client half of standing consent does not exist yet, so a defender has no way to
 * authorize anyone from the app, and every /accept fails with `no-authorization`. This
 * signs the same EIP-712 payload the UI will eventually sign and posts it, so backend
 * battles can be exercised end to end in the meantime.
 *
 * Not a substitute for the real flow: it needs the defender's raw key, which a player
 * never hands over. Delete this once `useDefenseAuthorization` lands.
 *
 * Usage (from backend/):
 *   DEFENDER_PRIVATE_KEY=0x... pnpm tsx scripts/grant-defense-authorization.ts --pets 1
 *   DEFENDER_PRIVATE_KEY=0x... pnpm tsx scripts/grant-defense-authorization.ts --all-pets
 *
 * Options:
 *   --pets 1,2          pet ids to authorize (omit with --all-pets)
 *   --all-pets          authorize every pet the wallet owns
 *   --days 30           validity window, default 30
 *   --max-per-day 50    daily battle cap, default 50
 *   --min-level 1       lowest attacker level accepted, default 1
 *   --max-level 100     highest attacker level accepted, default 100
 *   --api http://...    backend base URL, default http://localhost:3001
 */
import { defenseAuthorizationTypedData } from '@cryptopets/protocol';
import { Wallet } from 'ethers';

interface Options {
    petIds: string[];
    allPets: boolean;
    days: number;
    maxPerDay: number;
    minLevel: number;
    maxLevel: number;
    api: string;
}

function parseArgs(argv: string[]): Options {
    const get = (flag: string): string | undefined => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    const allPets = argv.includes('--all-pets');
    const petsArg = get('--pets');
    if (!allPets && !petsArg) {
        throw new Error('pass --pets <ids> or --all-pets');
    }
    return {
        petIds: petsArg ? petsArg.split(',').map((s) => s.trim()).filter(Boolean) : [],
        allPets,
        days: Number(get('--days') ?? '30'),
        maxPerDay: Number(get('--max-per-day') ?? '50'),
        minLevel: Number(get('--min-level') ?? '1'),
        maxLevel: Number(get('--max-level') ?? '100'),
        api: get('--api') ?? 'http://localhost:3001',
    };
}

async function json<T>(res: Response, what: string): Promise<T> {
    const body = await res.text();
    if (!res.ok) throw new Error(`${what} failed (${res.status}): ${body}`);
    return JSON.parse(body) as T;
}

/** Nonce, wallet signature, JWT — the same handshake the browser does. */
async function authenticate(api: string, wallet: Wallet): Promise<string> {
    const nonceRes = await fetch(`${api}/api/auth/nonce`);
    const { nonce } = await json<{ nonce: string }>(nonceRes, 'GET /api/auth/nonce');

    const signature = await wallet.signMessage(`Sign this message to authenticate: ${nonce}`);

    const verifyRes = await fetch(`${api}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address, signature, nonce }),
    });
    const { token } = await json<{ token: string }>(verifyRes, 'POST /api/auth/verify');
    return token;
}

async function main(): Promise<void> {
    const opts = parseArgs(process.argv.slice(2));

    const key = process.env.DEFENDER_PRIVATE_KEY?.trim();
    if (!key) throw new Error('DEFENDER_PRIVATE_KEY is required');
    const wallet = new Wallet(key);

    // The ruleset hash and deployment must match what the server serves, or the
    // authorization is rejected as wrong-deployment / never covers anything.
    const configRes = await fetch(`${opts.api}/api/battle/config`);
    const config = await json<{
        chainIds: string[];
        deploymentId: string;
        ruleset: { hash: string };
    }>(configRes, 'GET /api/battle/config');

    const chainId = config.chainIds.find((id) => id.startsWith('eip155:'));
    if (!chainId) throw new Error(`no EVM chain in served config: ${config.chainIds.join(', ')}`);

    const now = Math.floor(Date.now() / 1000);
    const authorization = {
        chainId,
        deploymentId: config.deploymentId,
        defenderOwner: wallet.address,
        allPets: opts.allPets,
        petIds: opts.allPets ? [] : opts.petIds,
        rulesetHash: config.ruleset.hash,
        minLevel: opts.minLevel,
        maxLevel: opts.maxLevel,
        maxBattlesPerDay: opts.maxPerDay,
        notBefore: now,
        expiresAt: now + opts.days * 86400,
        revocationNonce: 0,
    };

    const typed = defenseAuthorizationTypedData({
        domain: { chainId, deploymentId: config.deploymentId },
        defenderOwner: wallet.address,
        scope: opts.allPets
            ? { kind: 'allPets' }
            : { kind: 'pets', petIds: opts.petIds.map((id) => BigInt(id)) },
        rulesetHash: config.ruleset.hash as `0x${string}`,
        minLevel: opts.minLevel,
        maxLevel: opts.maxLevel,
        maxBattlesPerDay: opts.maxPerDay,
        notBefore: authorization.notBefore,
        expiresAt: authorization.expiresAt,
        revocationNonce: 0,
    });
    const signature = await wallet.signTypedData(typed.domain, typed.types, typed.message);

    const token = await authenticate(opts.api, wallet);
    const res = await fetch(`${opts.api}/api/battle/authorizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ authorization, signature, signatureFormat: 'eip712' }),
    });
    const { authorizationHash } = await json<{ authorizationHash: string }>(
        res,
        'POST /api/battle/authorizations',
    );

    console.log(`granted by ${wallet.address}`);
    console.log(`  scope       ${opts.allPets ? 'all pets' : `pets ${opts.petIds.join(', ')}`}`);
    console.log(`  levels      ${opts.minLevel}-${opts.maxLevel}, max ${opts.maxPerDay}/day`);
    console.log(`  valid       ${opts.days} days (until ${new Date(authorization.expiresAt * 1000).toISOString()})`);
    console.log(`  ruleset     ${config.ruleset.hash}`);
    console.log(`  hash        ${authorizationHash}`);
}

main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
