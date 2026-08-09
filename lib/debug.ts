// ── PawBond Debug Logger ─────────────────────────────────────────────────────
// Console logs are grouped by tag for easy filtering in Metro / Xcode console.
// All output is suppressed in production builds automatically.
//
// Usage:
//   import { dbg, dbgWarn, dbgError } from '@/lib/debug';
//   dbg('PetStore', 'fetchPets result', { count: pets.length });
//   dbgWarn('Auth', 'No session found, redirecting');
//   dbgError('Supabase', 'Insert failed', error);

const IS_DEV = process.env.NODE_ENV !== 'production';

/** Debug info — dev only */
export const dbg = (tag: string, message: string, ...data: unknown[]): void => {
  if (!IS_DEV) return;
  if (data.length > 0) {
    console.log(`[PawBond:${tag}] ${message}`, ...data);
  } else {
    console.log(`[PawBond:${tag}] ${message}`);
  }
};

/** Debug warning — dev only */
export const dbgWarn = (tag: string, message: string, ...data: unknown[]): void => {
  if (!IS_DEV) return;
  if (data.length > 0) {
    console.warn(`[PawBond:${tag}] ⚠️  ${message}`, ...data);
  } else {
    console.warn(`[PawBond:${tag}] ⚠️  ${message}`);
  }
};

/** Error — always logged (prod + dev) */
export const dbgError = (tag: string, message: string, ...data: unknown[]): void => {
  if (data.length > 0) {
    console.error(`[PawBond:${tag}] ❌ ${message}`, ...data);
  } else {
    console.error(`[PawBond:${tag}] ❌ ${message}`);
  }
};

/** Log a Supabase error with context — always logged */
export const dbgSupabase = (
  operation: string,
  error: { message: string; code?: string; details?: string } | null
): void => {
  if (!error) return;
  console.error(
    `[PawBond:Supabase] ❌ ${operation} failed`,
    { message: error.message, code: error.code, details: error.details }
  );
};
