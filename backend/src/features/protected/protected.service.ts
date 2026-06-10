import { getUser, listUsers as listUserRows, type UserRecord } from '@repositories/user.repository';
import type { User } from '@features/auth/auth.types';

/** API shape: dates as ISO strings (see {@link User}). */
function toUser(row: UserRecord): User {
    return {
        address: row.address,
        createdAt: row.createdAt.toISOString(),
        lastLogin: row.lastLogin.toISOString(),
    };
}

export async function getUserProfile(address: string): Promise<User | null> {
    const row = await getUser(address);
    return row ? toUser(row) : null;
}

export async function listUsers(): Promise<User[]> {
    return (await listUserRows()).map(toUser);
}
