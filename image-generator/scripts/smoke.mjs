#!/usr/bin/env node
/**
 * Full-stack smoke test of the built server, with fake upstreams.
 *
 * The unit and integration suites drive modules directly, which leaves the parts
 * that only run in a real process untested: env parsing, buildDeps, reader and
 * store construction, and main.js itself. Those are exactly the pieces that decide
 * whether a deploy comes up at all, and a mistake there passes every test and
 * fails at boot.
 *
 * This starts a fake Cloudflare Workers AI endpoint and a fake EVM RPC, launches
 * `node dist/main.js` against them with a real filesystem store, and walks the
 * routes a client actually uses. Everything is real except the two upstreams and
 * the model weights.
 *
 *   pnpm build && pnpm smoke
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeFunctionResult } from 'viem';
import { PET_CORE_ABI } from '../dist/chain.js';

/** Smallest valid PNG: a 1x1 transparent pixel. Real bytes, so anything that
 *  inspects the output sees an actual image. */
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
);

/** A distinct pet per id. Returning one pet for every id would give them all the
 *  same art key, and "three pets generated" would silently mean one image. */
const petFor = (id) => ({
    name: `Smokey ${id}`,
    dna: 7934056188134207n + id * 1_000_000n,
    level: 4, readyTime: 0, winCount: 3, lossCount: 1,
    rarity: 3, xp: 0, generation: 1, breedCount: 0, breedReadyAt: 0, trainReadyAt: 0,
    speciesId: 6, parent1Id: 0n, parent2Id: 0n, lastOpponentId: 0n, sameOpponentStreak: 0,
});

const listen = (server) => new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const shut = (server) => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
});

let failures = 0;
const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
};

const main = async () => {
    let generations = 0;

    const ai = createServer((req, res) => {
        generations++;
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            // Fail if the service sends something Cloudflare would reject outright.
            const parsed = JSON.parse(body);
            if (!parsed.prompt) { res.writeHead(400); res.end('no prompt'); return; }
            res.writeHead(200, { 'content-type': 'image/png' });
            res.end(PNG);
        });
    });

    const rpc = createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            const { method, params } = JSON.parse(body);
            let result = '0x1';
            if (method === 'eth_call') {
                const data = params[0].data;
                const isTotal = data.length <= 10;
                // getPet(uint256): the id is the 32-byte argument after the selector.
                const id = isTotal ? 0n : BigInt('0x' + data.slice(10));
                result = isTotal
                    ? encodeFunctionResult({ abi: PET_CORE_ABI, functionName: 'totalPets', result: 10n })
                    : encodeFunctionResult({ abi: PET_CORE_ABI, functionName: 'getPet', result: petFor(id) });
            }
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
        });
    });

    const aiPort = await listen(ai);
    const rpcPort = await listen(rpc);
    const artRoot = await mkdtemp(join(tmpdir(), 'smoke-art-'));
    const port = 8931;

    // The client builds https://api.cloudflare.com/... from accountId, so the
    // fake endpoint is injected by overriding the base the same way a proxy would.
    const childEnv = {
            ...process.env,
            PORT: String(port),
            PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
            IMAGE_STORE: 'filesystem',
            IMAGE_STORE_ROOT: artRoot,
            CF_ACCOUNT_ID: 'smoke',
            CF_API_TOKEN: 'smoke-token',
            CF_API_BASE: `http://127.0.0.1:${aiPort}/client/v4/accounts`,
            EVM_RPC_URL: `http://127.0.0.1:${rpcPort}`,
            PETCORE_ADDRESS: '0x0BB0e03259Cf9DA7B0A3e258e2D17d68D7be9d33',
    };

    const server = spawn(process.execPath, ['dist/main.js'], {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    const logs = [];
    server.stdout.on('data', (d) => logs.push(String(d)));
    server.stderr.on('data', (d) => logs.push(String(d)));

    const base = `http://127.0.0.1:${port}`;
    const up = async () => {
        for (let i = 0; i < 60; i++) {
            try {
                await fetch(`${base}/health`);
                return true;
            } catch {
                await new Promise((r) => setTimeout(r, 100));
            }
        }
        return false;
    };

    try {
        if (!await up()) {
            console.log('server never came up. output:\n' + logs.join(''));
            process.exitCode = 1;
            return;
        }

        console.log('smoke: built server, fake Cloudflare, fake RPC, filesystem store\n');

        const health = await fetch(`${base}/health`);
        check('GET /health', health.status, 200);

        const ready = await fetch(`${base}/ready`);
        check('GET /ready reaches store and chain', ready.status, 200);

        const metadata = await (await fetch(`${base}/metadata/evm/1`)).json();
        check('metadata name from the chain', metadata.name, 'Smokey 1');
        check('metadata did not generate', generations, 0);

        const first = await fetch(`${base}/image/evm/1.png`);
        const bytes = Buffer.from(await first.arrayBuffer());
        check('GET image status', first.status, 200);
        check('image is the PNG the model returned', bytes.equals(PNG), true);
        check('served as a cache miss', first.headers.get('x-art-cache'), 'miss');
        check('one generation billed', generations, 1);

        const second = await fetch(`${base}/image/evm/1.png`);
        check('second request is a cache hit', second.headers.get('x-art-cache'), 'hit');
        check('still one generation billed', generations, 1);

        const written = await readdir(join(artRoot, 'art', 'v1'));
        check('image and manifest persisted', written.length, 2);

        check('unminted pet is 404', (await fetch(`${base}/image/evm/99.png`)).status, 404);

        // A probe for art that exists reports ready; one for art that does not
        // must not start a generation.
        const headKnown = await fetch(`${base}/image/evm/1.png`, { method: 'HEAD' });
        check('HEAD on existing art is 200', headKnown.status, 200);
        check('HEAD billed nothing', generations, 1);

        // The warm CLI is an operational tool aimed at live collections, and its
        // full wiring only runs in a real process. Exercise it here rather than
        // discovering a problem mid-batch against a real account.
        console.log('\nwarm:');
        const warm = (args) => new Promise((resolve) => {
            const child = spawn(process.execPath, ['dist/warmCli.js', ...args], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
            let out = '';
            child.stdout.on('data', (d) => { out += d; });
            child.stderr.on('data', (d) => { out += d; });
            child.on('close', (code) => resolve({ out, code }));
        });

        const before = generations;
        const dry = await warm(['--from=2', '--to=4', '--dry-run']);
        check('dry run exits 0', dry.code, 0);
        check('dry run reports what it would do', /would gen\s+3/.test(dry.out), true);
        check('dry run generated nothing', generations, before);

        const real = await warm(['--from=2', '--to=4']);
        check('warm exits 0', real.code, 0);
        check('warm generated the three pets', generations - before, 3);
        check('warm reports them generated', /generated\s+3/.test(real.out), true);

        const again = await warm(['--from=2', '--to=4']);
        check('re-run bills nothing', generations - before, 3);
        check('re-run reports them cached', /already art\s+3/.test(again.out), true);

        const past = await warm(['--from=20', '--to=22']);
        check('past the supply is not an error', past.code, 0);
        check('past the supply counts as unminted', /not minted\s+3/.test(past.out), true);

        // Solana pets are not numbered, so an id range names nothing. Refusing
        // beats reporting a tidy "not minted" summary and exiting 0.
        const solana = await warm(['--chain=solana', '--from=1', '--to=3']);
        check('warming solana by id range fails', solana.code, 1);
        check('and says why', /not addressed by number/.test(solana.out), true);
    } finally {
        server.kill();
        await Promise.all([shut(ai), shut(rpc)]);
        await rm(artRoot, { recursive: true, force: true });
    }

    console.log(failures === 0 ? '\nsmoke passed' : `\nsmoke FAILED (${failures})`);
    if (failures > 0) process.exitCode = 1;
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
