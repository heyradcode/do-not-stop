/**
 * Public surface of the protected feature. External code imports from
 * `@features/protected` so the internal layout can change without touching
 * call sites.
 */
export { getProfile, getUsers } from './protected.controller';
