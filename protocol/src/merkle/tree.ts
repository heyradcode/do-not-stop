import { currentSchemaVersion } from '../domain/schemaVersions';
import { bytesToHex, concatBytes, type Hex, toBytes, uintToBytes, utf8ToBytes } from '../encoding/bytes';
import { DOMAIN_TAGS } from '../encoding/domain';
import { keccak256Hex } from '../encoding/hash';

/**
 * Merkle trees over receipts (§I).
 *
 * One anchored root stands for thousands of battles, so a season's rewards cost one
 * transaction instead of one per fight. A claimant later shows that their receipt was in
 * the pile.
 *
 * The layout here is chosen to be cheap for a Solidity verifier, since the root registry
 * and claim contract have to agree with it byte for byte (Step 37):
 *
 * - Every hashed element is a fixed 32 bytes, so concatenation is unambiguous and no
 *   length prefixes are needed. This is the one place the canonical writer is not used;
 *   `abi.encodePacked(bytes32, bytes32, bytes32)` in a contract has to produce identical
 *   bytes, and framing it would mean reimplementing the writer in Solidity.
 * - Pairs are sorted before hashing, so a proof is a list of siblings with no direction
 *   flags. Same convention as OpenZeppelin's `MerkleProof`.
 * - Leaves and internal nodes are domain-separated, which OpenZeppelin does not do. Without
 *   it, an internal node can be presented as a leaf, and someone proves membership of
 *   something that was never in the set.
 */

/** `keccak256("CRYPTOPETS_MERKLE_LEAF_V1")`, the leaf domain separator. */
export const MERKLE_LEAF_DOMAIN: Hex = keccak256Hex(utf8ToBytes(DOMAIN_TAGS.MERKLE_LEAF));
/** `keccak256("CRYPTOPETS_MERKLE_NODE_V1")`, the internal-node domain separator. */
export const MERKLE_NODE_DOMAIN: Hex = keccak256Hex(utf8ToBytes(DOMAIN_TAGS.MERKLE_NODE));

/**
 * Leaf for one receipt: `keccak256(LEAF_DOMAIN || schemaVersion || receiptHash)`.
 *
 * The receipt hash already binds every field of the battle, so nothing else needs to be in
 * the leaf. Reward-bearing leaves will need their own kind when the reward model lands, and
 * they will get their own domain tag rather than extending this one.
 */
export function merkleLeaf(receiptHash: Hex): Hex {
    const hash = toBytes(receiptHash);
    if (hash.length !== 32) {
        throw new Error(`receipt hash must be 32 bytes, got ${hash.length}`);
    }
    return keccak256Hex(
        concatBytes([
            toBytes(MERKLE_LEAF_DOMAIN),
            uintToBytes(currentSchemaVersion('merkleLeaf'), 2),
            hash,
        ]),
    );
}

/** Internal node: `keccak256(NODE_DOMAIN || min(a,b) || max(a,b))`. */
export function merkleNode(a: Hex, b: Hex): Hex {
    const left = toBytes(a);
    const right = toBytes(b);
    if (left.length !== 32 || right.length !== 32) {
        throw new Error('merkle node children must both be 32 bytes');
    }
    const [first, second] = compareBytes(left, right) <= 0 ? [left, right] : [right, left];
    return keccak256Hex(concatBytes([toBytes(MERKLE_NODE_DOMAIN), first, second]));
}

/** A built tree: its root and every layer, bottom-up. */
export interface MerkleTree {
    root: Hex;
    /** `layers[0]` is the leaves; the last layer is `[root]`. */
    layers: Hex[][];
}

/**
 * Builds a tree from leaves, in the order given.
 *
 * An odd node is promoted to the next layer unchanged rather than paired with itself.
 * Duplicating it, which some implementations do, lets someone prove membership of a leaf
 * that appears once by presenting it as the duplicated pair.
 *
 * Duplicate leaves are rejected: two identical leaves make an inclusion proof ambiguous
 * about which one it covers, and for reward claims that ambiguity is the whole attack.
 * Receipt hashes are unique in practice, so a duplicate means the caller built the batch
 * wrong.
 */
export function buildMerkleTree(leaves: readonly Hex[]): MerkleTree {
    if (leaves.length === 0) {
        throw new Error('cannot build a merkle tree over an empty set');
    }
    const normalized = leaves.map((leaf, index) => {
        if (toBytes(leaf).length !== 32) {
            throw new Error(`leaf at index ${index} must be 32 bytes`);
        }
        return leaf.toLowerCase() as Hex;
    });
    if (new Set(normalized).size !== normalized.length) {
        throw new Error('merkle leaves must be unique; a duplicate makes an inclusion proof ambiguous');
    }

    const layers: Hex[][] = [normalized];
    while (layers[layers.length - 1]!.length > 1) {
        const current = layers[layers.length - 1]!;
        const next: Hex[] = [];
        for (let i = 0; i < current.length; i += 2) {
            const left = current[i]!;
            const right = current[i + 1];
            next.push(right === undefined ? left : merkleNode(left, right));
        }
        layers.push(next);
    }

    return { root: layers[layers.length - 1]![0]!, layers };
}

/** Root for a set of leaves. */
export function merkleRoot(leaves: readonly Hex[]): Hex {
    return buildMerkleTree(leaves).root;
}

/**
 * Sibling hashes proving the leaf at `index` is in the tree.
 *
 * No direction flags, because pairs are sorted when hashed. A promoted odd node
 * contributes no sibling at that level, which is why proof lengths vary within one tree.
 */
export function merkleProof(tree: MerkleTree, index: number): Hex[] {
    if (!Number.isSafeInteger(index) || index < 0 || index >= tree.layers[0]!.length) {
        throw new Error(`leaf index ${index} is out of range`);
    }
    const proof: Hex[] = [];
    let position = index;
    for (let level = 0; level < tree.layers.length - 1; level++) {
        const layer = tree.layers[level]!;
        const siblingIndex = position % 2 === 0 ? position + 1 : position - 1;
        const sibling = layer[siblingIndex];
        if (sibling !== undefined) {
            proof.push(sibling);
        }
        position = Math.floor(position / 2);
    }
    return proof;
}

/**
 * Recomputes the root from a leaf and its proof.
 *
 * This is what a contract does, so keeping it a plain fold over sorted pairs is the point.
 */
export function processMerkleProof(leaf: Hex, proof: readonly Hex[]): Hex {
    let computed = leaf.toLowerCase() as Hex;
    if (toBytes(computed).length !== 32) {
        throw new Error('leaf must be 32 bytes');
    }
    for (const sibling of proof) {
        computed = merkleNode(computed, sibling);
    }
    return computed;
}

/** Whether `leaf` with `proof` reaches `root`. */
export function verifyMerkleProof(leaf: Hex, proof: readonly Hex[], root: Hex): boolean {
    try {
        return processMerkleProof(leaf, proof) === root.toLowerCase();
    } catch {
        return false;
    }
}

/** Whether a receipt is in a batch, by its hash. */
export function verifyReceiptInclusion(receiptHash: Hex, proof: readonly Hex[], root: Hex): boolean {
    return verifyMerkleProof(merkleLeaf(receiptHash), proof, root);
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
    for (let i = 0; i < a.length; i++) {
        const left = a[i]!;
        const right = b[i]!;
        if (left !== right) {
            return left < right ? -1 : 1;
        }
    }
    return 0;
}

/** Exported for the vector generator and for debugging a proof mismatch. */
export function merkleLeafPreimage(receiptHash: Hex): Hex {
    return bytesToHex(
        concatBytes([
            toBytes(MERKLE_LEAF_DOMAIN),
            uintToBytes(currentSchemaVersion('merkleLeaf'), 2),
            toBytes(receiptHash),
        ]),
    );
}

