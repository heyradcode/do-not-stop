import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Hex } from '../../src/encoding/bytes';
import {
    buildMerkleTree,
    MERKLE_LEAF_DOMAIN,
    MERKLE_NODE_DOMAIN,
    merkleLeaf,
    merkleNode,
    merkleProof,
    merkleRoot,
    processMerkleProof,
    verifyMerkleProof,
    verifyReceiptInclusion,
} from '../../src/merkle';

/**
 * Consumes contracts/test-vectors/protocol-merkle.json. A failure means the implementation
 * drifted, and the fix is the code, never the vector (`AGENTS.md`).
 *
 * This file is also the contract-side specification: the root registry and claim contract
 * consume the same vectors, so a Solidity implementation that disagrees fails here first.
 */
interface MerkleCase {
    name: string;
    note: string;
    receiptHashes: string[];
    leaves: string[];
    expectedRoot: string;
    proofs: { index: number; proof: string[] }[];
}

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../../../contracts/test-vectors/protocol-merkle.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as {
    domains: { leaf: string; node: string; leafSchemaVersion: number };
    cases: MerkleCase[];
};

describe('domain separators', () => {
    it('match the recorded constants', () => {
        expect(MERKLE_LEAF_DOMAIN).toBe(vectors.domains.leaf);
        expect(MERKLE_NODE_DOMAIN).toBe(vectors.domains.node);
    });

    it('differ from each other', () => {
        // The property that stops an internal node being passed off as a leaf.
        expect(MERKLE_LEAF_DOMAIN).not.toBe(MERKLE_NODE_DOMAIN);
    });
});

describe('golden vectors', () => {
    for (const c of vectors.cases) {
        it(`derives the recorded leaves and root for ${c.name}`, () => {
            expect(c.receiptHashes.map((hash) => merkleLeaf(hash as Hex))).toEqual(c.leaves);
            expect(merkleRoot(c.leaves as Hex[])).toBe(c.expectedRoot);
        });

        it(`verifies every recorded proof for ${c.name}`, () => {
            for (const { index, proof } of c.proofs) {
                expect(
                    verifyReceiptInclusion(
                        c.receiptHashes[index]! as Hex,
                        proof as Hex[],
                        c.expectedRoot as Hex,
                    ),
                ).toBe(true);
            }
        });

        it(`regenerates the recorded proofs for ${c.name}`, () => {
            const tree = buildMerkleTree(c.leaves as Hex[]);
            for (const { index, proof } of c.proofs) {
                expect(merkleProof(tree, index)).toEqual(proof);
            }
        });
    }
});

describe('tree shape', () => {
    const leaves = (n: number): Hex[] =>
        Array.from({ length: n }, (_, i) => merkleLeaf(`0x${((i + 1) % 256).toString(16).padStart(2, '0').repeat(32)}`));

    it('makes a single leaf its own root', () => {
        const single = leaves(1);
        expect(merkleRoot(single)).toBe(single[0]);
    });

    it('promotes an odd node unchanged rather than pairing it with itself', () => {
        // Self-pairing lets someone prove membership of a leaf that appears once by
        // presenting it as the duplicated pair, so the promoted shape is deliberate.
        const three = leaves(3);
        const expected = merkleNode(merkleNode(three[0]!, three[1]!), three[2]!);
        expect(merkleRoot(three)).toBe(expected);
    });

    it('gives shorter proofs to promoted nodes', () => {
        const tree = buildMerkleTree(leaves(3));
        expect(merkleProof(tree, 0)).toHaveLength(2);
        expect(merkleProof(tree, 2)).toHaveLength(1);
    });

    it('depends on leaf order', () => {
        const [a, b, c] = leaves(3) as [Hex, Hex, Hex];
        expect(merkleRoot([a, b, c])).not.toBe(merkleRoot([c, b, a]));
    });

    it('hashes pairs commutatively, so proofs need no direction flags', () => {
        const [a, b] = leaves(2) as [Hex, Hex];
        expect(merkleNode(a, b)).toBe(merkleNode(b, a));
    });

    it('rejects an empty set', () => {
        expect(() => merkleRoot([])).toThrow(/empty set/);
    });

    it('rejects duplicate leaves', () => {
        // A duplicate makes an inclusion proof ambiguous about which entry it covers, and
        // for reward claims that ambiguity is the attack.
        const [a] = leaves(1) as [Hex];
        expect(() => merkleRoot([a, a])).toThrow(/must be unique/);
    });

    it('rejects a leaf of the wrong width', () => {
        expect(() => merkleRoot(['0x1234' as Hex])).toThrow(/must be 32 bytes/);
        expect(() => merkleLeaf('0x1234' as Hex)).toThrow(/must be 32 bytes/);
    });
});

describe('proof verification', () => {
    const receiptHashes = Array.from({ length: 5 }, (_, i) => `0x${(i + 1).toString(16).padStart(2, '0').repeat(32)}` as Hex);
    const leafHashes = receiptHashes.map((hash) => merkleLeaf(hash));
    const tree = buildMerkleTree(leafHashes);

    it('accepts a valid proof for each index', () => {
        for (let index = 0; index < receiptHashes.length; index++) {
            expect(verifyReceiptInclusion(receiptHashes[index]!, merkleProof(tree, index), tree.root)).toBe(true);
        }
    });

    it('rejects a proof against the wrong root', () => {
        expect(verifyMerkleProof(leafHashes[0]!, merkleProof(tree, 0), `0x${'99'.repeat(32)}`)).toBe(false);
    });

    it('rejects a proof for a leaf that is not in the tree', () => {
        const outsider = merkleLeaf(`0x${'ee'.repeat(32)}`);
        expect(verifyMerkleProof(outsider, merkleProof(tree, 0), tree.root)).toBe(false);
    });

    it('rejects a tampered sibling', () => {
        const proof = merkleProof(tree, 1);
        proof[0] = `0x${'77'.repeat(32)}`;
        expect(verifyMerkleProof(leafHashes[1]!, proof, tree.root)).toBe(false);
    });

    it('rejects a truncated proof', () => {
        expect(verifyMerkleProof(leafHashes[1]!, merkleProof(tree, 1).slice(1), tree.root)).toBe(false);
    });

    it('rejects an internal node presented as a leaf', () => {
        // The second-preimage attack domain separation prevents: without distinct leaf and
        // node domains, this node would verify as a member of the set.
        const internalNode = tree.layers[1]![0]!;
        const proofFromLevelOne = tree.layers.length > 2 ? [tree.layers[1]![1]!] : [];
        expect(verifyMerkleProof(internalNode, proofFromLevelOne, tree.root)).toBe(false);
    });

    it('rejects a malformed leaf without throwing', () => {
        expect(verifyMerkleProof('0xabcd' as Hex, [], tree.root)).toBe(false);
    });

    it('treats an empty proof as a claim that the leaf is the root', () => {
        expect(processMerkleProof(tree.root, [])).toBe(tree.root);
        expect(verifyMerkleProof(leafHashes[0]!, [], tree.root)).toBe(false);
    });
});
