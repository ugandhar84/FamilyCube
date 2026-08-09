/**
 * store/petStore.ts — backwards-compatibility re-export shim.
 *
 * During the architecture refactor the store moved from `store/petStore.ts` to
 * `shared/store/index.ts`. This file keeps all existing import paths working
 * without touching every screen — it simply re-exports everything from the new
 * location. No logic lives here; the canonical source of truth is `shared/store`.
 */
// store/petStore.ts — re-exports from new location for backwards compatibility
export { usePetStore } from '@/shared/store';
export { invalidatePetsCache } from '@/shared/store/slices';
export type { PetsSlice, CareSlice, HealthSlice, MilestonesSlice } from '@/shared/store/slices';
