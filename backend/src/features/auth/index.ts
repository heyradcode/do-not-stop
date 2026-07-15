/**
 * Public surface of the auth feature. External code imports from
 * `@features/auth` so the internal layout can change without touching
 * call sites.
 */
export { getNonce, verify } from './auth.controller';
export type { User } from './auth.types';
