import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// The @shared/core barrel transitively imports the Switchboard VRF SDK, which
// runs Solana PDA derivation at module load and crashes in jsdom. Frontend unit
// tests never exercise that path, so stub it to keep the barrel importable.
vi.mock('@switchboard-xyz/on-demand', () => ({}));

// react-modal (used by <NeonModal>) calls Modal.setAppElement('#root'); provide
// the element so modal-rendering components don't throw under jsdom.
if (!document.getElementById('root')) {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
}

// Unmount React trees between tests so renderHook/render don't leak state.
afterEach(() => {
    cleanup();
});
