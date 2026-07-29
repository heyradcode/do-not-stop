/**
 * HTTP entry point. Socket wiring only; all routing logic lives in routes.ts so
 * it can be tested without a listening port.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { EvmPetReader, parsePetCoreAddress } from './chain.js';
import { loadServerConfig, loadStoreSelection, loadWorkersAiConfig } from './config.js';
import { handleRequest, type RouteDeps } from './routes.js';
import { createStore, describeStore } from './storeFactory.js';

export const createRequestListener = (deps: RouteDeps) =>
    async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const method = req.method ?? 'GET';
        // Only the path is routed; query strings are ignored so a cache-busting
        // ?v=2 cannot become a second cache entry for the same pet.
        const path = new URL(req.url ?? '/', 'http://localhost').pathname;
        const started = Date.now();

        let response;
        try {
            response = await handleRequest(deps, method, path);
        } catch (error) {
            // handleRequest maps expected failures itself; reaching here means a
            // genuine bug, which must not take the process down.
            console.error(`unhandled error for ${method} ${path}`, error);
            response = {
                status: 500,
                headers: { 'content-type': 'application/json' },
                body: Buffer.from(JSON.stringify({ error: 'Internal error' })),
            };
        }

        res.writeHead(response.status, response.headers);
        res.end(method === 'HEAD' ? undefined : response.body);

        if (path !== '/health') {
            console.log(`${method} ${path} ${response.status} ${Date.now() - started}ms`);
        }
    };

export const buildDeps = async (): Promise<{ deps: RouteDeps; port: number; store: string }> => {
    const server = loadServerConfig();
    const config = loadWorkersAiConfig();
    const selection = loadStoreSelection();
    const store = await createStore(selection);

    const reader = new EvmPetReader({
        rpcUrl: server.evm.rpcUrl,
        petCoreAddress: parsePetCoreAddress(server.evm.petCoreAddress),
    });

    return {
        deps: {
            config,
            store,
            reader,
            publicBaseUrl: server.publicBaseUrl,
            ...(server.externalUrlTemplate ? { externalUrlTemplate: server.externalUrlTemplate } : {}),
        },
        port: server.port,
        store: describeStore(selection),
    };
};

export const start = async (): Promise<Server> => {
    const { deps, port, store } = await buildDeps();
    const server = createServer(createRequestListener(deps));

    await new Promise<void>((resolve) => server.listen(port, resolve));
    console.log(`image-generator listening on :${port}`);
    console.log(`  store   ${store}`);
    console.log(`  model   ${deps.config.model}`);
    console.log(`  base    ${deps.publicBaseUrl}`);

    // Stop accepting connections and let the process end once in-flight requests
    // drain; a generation can take tens of seconds and cutting it off wastes an
    // inference that was already paid for. exit() is not called from inside the
    // close callback: doing that trips a libuv assertion on Windows.
    const shutdown = (): void => {
        console.log('shutting down');
        server.close();
        const forced = setTimeout(() => process.exit(0), deps.config.timeoutMs + 5_000);
        forced.unref();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    return server;
};
