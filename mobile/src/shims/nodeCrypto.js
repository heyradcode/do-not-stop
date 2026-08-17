const { sha256 } = require('@noble/hashes/sha2');
const { blake2b } = require('@noble/hashes/blake2b');
const { Buffer } = require('buffer');

/**
 * The only part of Node's `crypto` that reaches this bundle.
 *
 * `@switchboard-xyz/*` calls `createHash` in two places, sha256 in Surge's
 * signature auth and blake2b512 in its protobuf hashing. Metro has to resolve
 * the import to build the module graph at all, and `crypto-browserify` answers
 * it by pulling in the whole browserify cascade (`cipher-base`, `stream`,
 * `readable-stream`) for those two calls. This does the same job with hashers
 * the bundle already carries.
 *
 * Both are checked against Node's own output. Anything else throws rather than
 * returning a wrong digest quietly.
 */
const hashers = {
    sha256: (bytes) => sha256(bytes),
    blake2b512: (bytes) => blake2b(bytes, { dkLen: 64 }),
};

const createHash = (algorithm) => {
    const hasher = hashers[algorithm];
    if (!hasher) {
        throw new Error(
            `nodeCrypto shim implements ${Object.keys(hashers).join(
                ' and '
            )}, asked for ${algorithm}`
        );
    }

    const chunks = [];
    const hash = {
        update(data) {
            chunks.push(
                typeof data === 'string'
                    ? Buffer.from(data, 'utf8')
                    : Buffer.from(data)
            );
            return hash;
        },
        digest(encoding) {
            const digest = Buffer.from(hasher(Buffer.concat(chunks)));
            return encoding ? digest.toString(encoding) : digest;
        },
    };

    return hash;
};

module.exports = { createHash };
