/**
 * One-shot generator, for eyeballing output before the HTTP surface exists:
 *
 *   pnpm generate --dna=7934056188134207 --rarity=3 --out=pet.png
 *
 * Prints the prompt it used so a disappointing image can be traced to the
 * prompt table rather than the model. Defaults to the filesystem store, so a
 * second run of the same pet costs nothing and proves the cache path; pass
 * --store=memory to force a fresh inference.
 */

import { writeFile } from 'node:fs/promises';
import { ConfigError, loadStoreSelection, loadWorkersAiConfig } from './config.js';
import { buildPetPrompt, summarisePet } from './prompt.js';
import { getOrCreatePetImage } from './pipeline.js';
import { createStore, describeStore } from './storeFactory.js';
import { derivePetVisualTraits } from './traits.js';
import { WorkersAiError } from './workersAi.js';

const arg = (name: string): string | undefined =>
    process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const main = async (): Promise<void> => {
    const dnaArg = arg('dna');
    if (!dnaArg) {
        throw new ConfigError(
            'Usage: pnpm generate --dna=<16 digits> [--rarity=1-5] [--species=N] [--out=pet.png] [--store=filesystem|memory|r2]',
        );
    }

    const storeArg = arg('store');
    if (storeArg) process.env.IMAGE_STORE = storeArg;

    const dna = BigInt(dnaArg);
    const speciesArg = arg('species');
    const out = arg('out') ?? 'pet.png';
    const input = {
        dna,
        rarity: Number(arg('rarity') ?? 1),
        ...(speciesArg == null ? {} : { speciesId: Number(speciesArg) }),
    };

    const traits = derivePetVisualTraits(input);
    const spec = buildPetPrompt(traits, dna);

    // Printed before credentials are read so the prompt table can be iterated
    // on without a Cloudflare token in the environment.
    console.log(summarisePet(traits));
    console.log(`traits  ${JSON.stringify(traits)}`);
    console.log(`seed    ${spec.seed}`);
    console.log(`prompt  ${spec.prompt}\n`);

    const config = loadWorkersAiConfig();
    const selection = loadStoreSelection('filesystem');
    const store = await createStore(selection);
    console.log(`model   ${config.model}`);
    console.log(`store   ${describeStore(selection)}`);

    const started = Date.now();
    const result = await getOrCreatePetImage({ config, store }, input);
    await writeFile(out, result.bytes);

    console.log(
        `${result.cached ? 'served from cache' : 'generated'}  ${result.key}`
        + `  (${result.bytes.length} bytes, ${Date.now() - started}ms)`,
    );
    if (result.url) console.log(`url     ${result.url}`);
    console.log(`wrote   ${out}`);
};

main().catch((error: unknown) => {
    if (error instanceof ConfigError || error instanceof WorkersAiError) {
        console.error(error.message);
    } else {
        console.error(error);
    }
    process.exitCode = 1;
});
