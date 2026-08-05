import { assertChainId, assertProtocolDomain, type ChainId, type ProtocolDomain } from '@cryptopets/protocol';

import { env } from '@config/env';

/**
 * Which chain and deployment this backend serves.
 *
 * Every signed object binds `chainId` and `deploymentId` (§D), and that binding is only
 * worth anything if the server refuses payloads naming a different one. Otherwise a
 * signature captured from staging is a valid production signature, which is exactly the
 * replay the fields exist to stop.
 *
 * Configured rather than inferred: a deployment id has no on-chain source, and guessing it
 * from the database would make it whatever the data happened to say.
 */

/** The deployment this process serves, e.g. `base-sepolia-live`. */
export function servedDeploymentId(): string {
    return env.battle.deploymentId;
}

/** Chain ids this process accepts intents for. */
export function servedChainIds(): ChainId[] {
    return env.battle.chainIds.map((chainId) => assertChainId(chainId));
}

/** The domain for one chain, as this process serves it. */
export function servedDomain(chainId: ChainId): ProtocolDomain {
    return assertProtocolDomain({ chainId, deploymentId: servedDeploymentId() });
}

/**
 * Throws unless `domain` is one this process serves.
 *
 * The message names both sides, because during an incident the useful question is which
 * environment a signature actually came from.
 */
export function assertServedDomain(domain: ProtocolDomain): ProtocolDomain {
    const checked = assertProtocolDomain(domain);
    const deploymentId = servedDeploymentId();
    if (checked.deploymentId !== deploymentId) {
        throw new Error(`this deployment is ${deploymentId}, got ${checked.deploymentId}`);
    }
    const allowed = servedChainIds();
    if (!allowed.includes(checked.chainId)) {
        throw new Error(`chain ${checked.chainId} is not served here (serving ${allowed.join(', ')})`);
    }
    return checked;
}
