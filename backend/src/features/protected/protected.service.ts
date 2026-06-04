import { users } from '@features/auth/auth.service';
import type { User } from '@features/auth/auth.types';

export function getUserProfile(address: string): User | undefined {
    return users.get(address);
}

export function listUsers(): User[] {
    return Array.from(users.values());
}
