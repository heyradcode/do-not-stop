import 'dotenv/config';

import { env } from '@config/env';
import {
    activeSigningKey,
    configureSigner,
    listSigningKeys,
    signerBackendError,
} from '@features/battle/signer';

/**
 * Why this deployment cannot sign, printed rather than inferred.
 *
 * `configureSigner` records its failure and returns, so a deployment that cannot sign
 * anything still boots clean and only says so when a player has already fought a battle.
 * This runs the same configuration against the same environment and prints what it decided,
 * including the reason the running process kept to itself.
 *
 * Read-only: no database, no KMS writes, no state. Safe to run against any environment.
 * Never prints key material — only whether a value is present and how long it is.
 */

function shape(value: string | undefined): string {
    if (value === undefined) return 'unset';
    if (value.length === 0) return 'empty';
    return `set (${value.length} chars)`;
}

async function main(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    console.log('--- environment ---');
    console.log(`NODE_ENV                        ${process.env.NODE_ENV ?? 'unset (so not production)'}`);
    console.log(`BATTLE_BACKEND_MODE_ENABLED     ${env.battle.enabled}`);
    console.log(`BATTLE_CHAIN_IDS                ${env.battle.chainIds.join(', ') || '(none)'}`);
    console.log(`BATTLE_SIGNER_KEY_ID            ${env.battleSigner.keyId || '(none)'}`);
    console.log(`BATTLE_SIGNER_PRIVATE_KEY       ${shape(env.battleSigner.privateKey)}`);
    console.log(`BATTLE_SIGNER_KMS_PROVIDER      ${env.battleSigner.kmsProvider || '(none)'}`);

    // The families this deployment serves, which is what the key set has to cover. Two
    // families means each needs its own key id (§G), and that is the configuration most
    // likely to be missing after an upgrade.
    const families = [...new Set(env.battle.chainIds.map((id) => (id.startsWith('eip155:') ? 'evm' : 'solana')))];
    console.log(`\ndomains to sign for             ${families.join(', ') || '(none)'}`);
    for (const domain of ['evm', 'solana'] as const) {
        const specific = env.battleSigner.domains[domain];
        console.log(
            `  ${domain.padEnd(7)} keyId=${specific.keyId || '(inherits shared)'} ` +
                `privateKey=${shape(specific.privateKey)} kmsKeyId=${specific.kmsKeyId || '(none)'}`,
        );
    }

    console.log('\n--- configuring ---');
    await configureSigner(now);

    const failure = signerBackendError();
    if (failure) {
        console.log(`REFUSED: ${failure}`);
    } else {
        console.log('configured without error');
    }

    console.log('\n--- what each served chain resolves to ---');
    for (const chainId of env.battle.chainIds) {
        const key = activeSigningKey(chainId);
        console.log(`  ${chainId.padEnd(24)} ${key ? `${key.keyId} (${key.address})` : 'NO ACTIVE KEY'}`);
    }

    const published = listSigningKeys();
    console.log(`\npublished keys                  ${published.length}`);
    for (const key of published) {
        console.log(`  ${key.keyId} ${key.address} notBefore=${key.notBefore} notAfter=${key.notAfter ?? 'open'}`);
    }
}

void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
