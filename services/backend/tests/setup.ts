/**
 * Test environment bootstrap. Several modules import `@config/env`, which throws
 * at import time when DATABASE_URL is unset (and would read a real .env via
 * dotenv). Provide deterministic, non-production values here before any such
 * import runs so unit tests never touch a real database or secret.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'test-secret';
