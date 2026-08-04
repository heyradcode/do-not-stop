import { readFile } from 'node:fs/promises';

/**
 * Reads and JSON-parses `source`, which may be a local file path or an `http(s)` URL.
 *
 * This is the entire network/filesystem surface this package touches. No backend
 * access and no database means the verifier only ever consumes whatever a receipt file
 * or a public endpoint hands back — the same public inputs any other outsider running
 * this same check would have (§H).
 */
export async function readJsonFrom(source: string): Promise<unknown> {
    if (source.startsWith('http://') || source.startsWith('https://')) {
        const response = await fetch(source);
        if (!response.ok) {
            throw new Error(`fetching ${source} failed: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }
    const text = await readFile(source, 'utf8');
    return JSON.parse(text);
}
