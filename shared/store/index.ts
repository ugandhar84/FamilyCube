/**
 * shared/store/index.ts — single Zustand store composed from four slice factories.
 *
 * Each slice (Pets, Care, Health, Milestones) is created independently and then
 * spread into one combined store so components can read or mutate any slice via
 * the same `usePetStore` hook. Slices never import each other — cross-slice calls
 * (e.g. CareSlice calling touchStreak) go through `get()` at runtime.
 *
 * `useShallow` is re-exported here so callers don't need a direct zustand import —
 * it prevents re-renders when only unrelated store fields change.
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createPetsSlice, PetsSlice } from './slices/pets.slice';
import { createCareSlice, CareSlice } from './slices/care.slice';
import { createHealthSlice, HealthSlice } from './slices/health.slice';
import { createMilestonesSlice, MilestonesSlice } from './slices/milestones.slice';

type StoreState = PetsSlice & CareSlice & HealthSlice & MilestonesSlice;

export const usePetStore = create<StoreState>()((...a) => ({
  ...createPetsSlice(...a),
  ...createCareSlice(...a),
  ...createHealthSlice(...a),
  ...createMilestonesSlice(...a),
}));

export { useShallow };
export type { PetsSlice, CareSlice, HealthSlice, MilestonesSlice };
