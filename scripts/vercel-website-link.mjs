#!/usr/bin/env node
/**
 * Ensures .vercel/project.json at the monorepo root targets website/ as rootDirectory.
 * Used in CI before vercel pull/deploy (must run from repository root).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const projectId = process.env.VERCEL_PROJECT_ID;
const orgId = process.env.VERCEL_ORG_ID;

if (!projectId || !orgId) {
  console.error('VERCEL_PROJECT_ID and VERCEL_ORG_ID must be set');
  process.exit(1);
}

const dir = join(process.cwd(), '.vercel');
const file = join(dir, 'project.json');

let project = { projectId, orgId };

try {
  project = { ...project, ...JSON.parse(await readFile(file, 'utf8')) };
} catch {
  // no existing file
}

project.projectId = projectId;
project.orgId = orgId;
project.settings = {
  ...(project.settings ?? {}),
  rootDirectory: 'website',
  framework: 'nextjs',
};

await mkdir(dir, { recursive: true });
await writeFile(file, `${JSON.stringify(project, null, 2)}\n`);
console.log('Linked Vercel project with rootDirectory=website');
