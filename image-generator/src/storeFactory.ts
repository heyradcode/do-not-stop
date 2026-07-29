/**
 * Builds the configured ImageStore. Split from config.ts so config stays
 * dependency-free and the R2 client (and its S3 SDK) is only imported when R2
 * is actually the selected backend.
 */

import type { StoreSelection } from './config.js';
import { ConfigError } from './config.js';
import type { ImageStore } from './store.js';
import { FilesystemImageStore, MemoryImageStore } from './store.js';

export const createStore = async (selection: StoreSelection): Promise<ImageStore> => {
    switch (selection.kind) {
        case 'memory':
            return new MemoryImageStore();
        case 'filesystem':
            return new FilesystemImageStore(selection.root);
        case 'r2': {
            if (!selection.r2) throw new ConfigError('R2 store selected but R2 credentials are missing');
            const { R2ImageStore } = await import('./r2Store.js');
            return new R2ImageStore(selection.r2);
        }
    }
};

export const describeStore = (selection: StoreSelection): string =>
    selection.kind === 'r2' ? `r2:${selection.r2?.bucket ?? '?'}` : `${selection.kind}:${selection.root}`;
