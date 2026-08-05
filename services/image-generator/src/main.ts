/**
 * Process entry point. Separate from server.ts so that module stays importable
 * by tests without starting a listener as a side effect.
 */

import { ConfigError } from './config.js';
import { start } from './server.js';

start().catch((error: unknown) => {
    console.error(error instanceof ConfigError ? error.message : error);
    process.exitCode = 1;
});
