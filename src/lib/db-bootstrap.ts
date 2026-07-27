/**
 * Compatibility re-export. The bootstrap logic now lives in `@/lib/db` itself
 * (it needs access to the un-extended basePrisma, which is module-private).
 *
 * Routes can import from either location:
 *   import { ensureDbSchema } from '@/lib/db-bootstrap';
 *   import { ensureDbSchema } from '@/lib/db';
 *
 * Both resolve to the same function. New code should prefer `@/lib/db`.
 */
export { ensureDbSchema } from '@/lib/db';
