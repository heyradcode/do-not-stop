import fsPromises from 'node:fs/promises';

// Windows-only: Hardhat 3's solidity build system writes large build-info
// files to cache/ and then renames them into artifacts/build-info/. On this
// machine that rename intermittently fails with EBUSY (AV/indexer briefly
// locking the freshly-written file), which aborts compile/test entirely.
// Retry the rename with backoff before giving up — a separate process
// retrying the same rename a moment later always succeeds, so the lock is
// transient.
if (process.platform === 'win32') {
    const originalRename = fsPromises.rename.bind(fsPromises);
    fsPromises.rename = async (oldPath, newPath) => {
        const maxAttempts = 10;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await originalRename(oldPath, newPath);
            } catch (err) {
                if (err.code !== 'EBUSY' || attempt === maxAttempts) throw err;
                await new Promise((r) => setTimeout(r, 300 * attempt));
            }
        }
    };
}

import('../../../node_modules/hardhat/dist/src/cli.js');
