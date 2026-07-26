/** Narrows an untrusted JSON value to a plain object before indexing into it. */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/** Reads a required string field, throwing a message that names the field and the culprit. */
export function requireString(value: Record<string, unknown>, field: string): string {
    const raw = value[field];
    if (typeof raw !== 'string') {
        throw new Error(`expected a string field "${field}", got ${JSON.stringify(raw)}`);
    }
    return raw;
}

/** Reads the first field present as a string, for wire shapes that spell one field two ways. */
export function firstString(value: Record<string, unknown>, fields: readonly string[]): string {
    for (const field of fields) {
        const raw = value[field];
        if (typeof raw === 'string') {
            return raw;
        }
    }
    throw new Error(`expected one of ${fields.join('/')} to be a string field`);
}
