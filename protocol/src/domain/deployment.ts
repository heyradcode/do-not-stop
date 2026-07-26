import type { CanonicalWriter } from '../encoding/writer';

import { assertChainId, type ChainId } from './chainId';
import { assertSupportedSchemaVersion, currentSchemaVersion, type SchemaKind } from './schemaVersions';

/**
 * Which chain, and which deployment on it, an object belongs to.
 *
 * Both halves are needed. `chainId` alone would let a staging signature be
 * replayed against production, since both sit on the same testnet: same chain,
 * different contracts. `deploymentId` alone would let one environment's
 * signature cross chains. Every signed object in this protocol carries the pair
 * inside its hashed bytes, so a signature is only ever valid where it was meant.
 */
export interface ProtocolDomain {
    chainId: ChainId;
    /**
     * Identifies one deployed contract set plus its environment, e.g.
     * `base-sepolia-live` or `local-dev`. Opaque to the protocol: it only has to
     * be stable for a deployment's life and never reused across environments.
     */
    deploymentId: string;
}

const DEPLOYMENT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Validates an untrusted domain.
 *
 * `deploymentId` is charset-restricted so it cannot smuggle whitespace, case
 * variants, or unicode look-alikes. Two spellings of one environment would
 * produce two digests for the same battle, which is the confusion this field
 * exists to prevent.
 */
export function assertProtocolDomain(domain: ProtocolDomain): ProtocolDomain {
    const chainId = assertChainId(domain.chainId);
    if (!DEPLOYMENT_ID_PATTERN.test(domain.deploymentId)) {
        throw new Error(
            `invalid deploymentId ${JSON.stringify(domain.deploymentId)}: expected 1-64 chars of [a-z0-9._-] starting alphanumeric`,
        );
    }
    return { chainId, deploymentId: domain.deploymentId };
}

/** True when two objects belong to the same chain and deployment. */
export function sameDomain(a: ProtocolDomain, b: ProtocolDomain): boolean {
    return a.chainId === b.chainId && a.deploymentId === b.deploymentId;
}

/**
 * Throws unless `actual` matches `expected`. The message names both sides,
 * because the useful question during an incident is which environment a
 * signature actually came from.
 */
export function assertSameDomain(expected: ProtocolDomain, actual: ProtocolDomain): void {
    if (!sameDomain(expected, actual)) {
        throw new Error(
            `domain mismatch: expected ${expected.chainId}/${expected.deploymentId}, got ${actual.chainId}/${actual.deploymentId}`,
        );
    }
}

/**
 * Writes the header every hashed object starts with: schema version, then chain
 * id, then deployment id, immediately after the domain tag.
 *
 * One helper rather than each object encoder writing its own three fields. The
 * header is the part that must be laid out identically everywhere, and a
 * copy-pasted prefix is how one object ends up with the fields in a different
 * order. Note this normalizes the field order in the architecture document,
 * where the receipt lists `battleId` ahead of `chainId`: header first, body
 * after, for every object.
 */
export function writeHeader(writer: CanonicalWriter, kind: SchemaKind, domain: ProtocolDomain): void {
    const version = currentSchemaVersion(kind);
    assertSupportedSchemaVersion(kind, version);
    const checked = assertProtocolDomain(domain);
    writer.u16(version).text(checked.chainId).text(checked.deploymentId);
}
