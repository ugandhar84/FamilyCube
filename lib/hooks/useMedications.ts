import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import {
  getMedications, getActiveMedications,
  saveMedication, toggleMedActive, deleteMedication,
  type Medication,
} from '@/lib/db/medications';

export const medicationKeys = {
  all:    (petId: string) => ['medications', petId] as const,
  active: (petId: string, date?: string) => ['medications', petId, 'active', date] as const,
};

export function useMedications(petId: string | null) {
  return useQuery({
    queryKey: medicationKeys.all(petId ?? ''),
    queryFn: () => getMedications(petId!),
    enabled: !!petId,
    ...CACHE.WARM,
  });
}

export function useActiveMedications(petId: string | null, asOf?: string) {
  return useQuery({
    queryKey: medicationKeys.active(petId ?? '', asOf),
    queryFn: () => getActiveMedications(petId!, asOf),
    enabled: !!petId,
    ...CACHE.WARM,
  });
}

export function useSaveMedication(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, id }: { payload: Omit<Medication, 'id' | 'pet_id' | 'created_at'>; id?: string }) =>
      saveMedication(petId, payload, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medications', petId] }),
  });
}

export function useToggleMedActive(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => toggleMedActive(id, isActive),
    // Optimistic update — flips the badge instantly without waiting for server
    onMutate: async ({ id, isActive }) => {
      await qc.cancelQueries({ queryKey: medicationKeys.all(petId) });
      const prev = qc.getQueryData<Medication[]>(medicationKeys.all(petId));
      qc.setQueryData<Medication[]>(medicationKeys.all(petId), old =>
        old?.map(m => m.id === id ? { ...m, is_active: isActive } : m) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(medicationKeys.all(petId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['medications', petId] }),
  });
}

export function useDeleteMedication(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMedication(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medications', petId] }),
  });
}
