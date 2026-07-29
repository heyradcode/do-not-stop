/**
 * One-shot generator, for eyeballing output before the HTTP surface exists:
 *
 *   pnpm generate --dna=7934056188134207 --rarity=3 --out=pet.png
 *
 * Prints the prompt it used so a disappointing image can be traced to the
 * prompt table rather than the model.
 */

import { writeFile } from 'node:fs/promises';
import { ConfigError, loadWorkersAiConfig } from './config.js';
import { buildPetPrompt, summarisePet } from './prompt.js';
import { derivePetVisualTraits } from './traits.js';
import { WorkersAiError, generateImage } from './workersAi.js';

const arg = (name: string): string | undefined =>
    process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const main = async (): Promise<void> => {
    const dnaArg = arg('dna');
    if (!dnaArg) {
        throw new ConfigError('Usage: pnpm generate --dna=<16 digits> [--rarity=1-5] [--species=N] [--out=pet.png]');
    }

    const dna = BigInt(dnaArg);
    const rarity = Number(arg('rarity') ?? 1);
    const speciesArg = arg('species');
    const out = arg('out') ?? 'pet.png';

    const traits = derivePetVisualTraits({
        dna,
        rarity,
        ...(speciesArg == null ? {} : { speciesId: Number(speciesArg) }),
    });
    const spec = buildPetPrompt(traits, dna);

    // Printed before credentials are read so the prompt table can be iterated
    // on without a Cloudflare token in the environment.
    console.log(summarisePet(traits));
    console.log(`traits  ${JSON.stringify(traits)}`);
    console.log(`seed    ${spec.seed}`);
    console.log(`prompt  ${spec.prompt}\n`);

    const config = loadWorkersAiConfig();
    console.log(`model   ${config.model}`);

    const started = Date.now();
    const bytes = await generateImage(config, spec);
    await writeFile(out, bytes);
    console.log(`wrote ${out} (${bytes.length} bytes) in ${Date.now() - started}ms`);
};

main().catch((error: unknown) => {
    if (error instanceof ConfigError || error instanceof WorkersAiError) {
        console.error(error.message);
    } else {
        console.error(error);
    }
    process.exitCode = 1;
});
