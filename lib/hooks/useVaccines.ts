import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import { getVaccines, saveVaccine, deleteVaccine, type Vaccine } from '@/lib/db/vaccines';

export const vaccineKeys = {
  all: (petId: string) => ['vaccines', petId] as const,
};

export function useVaccines(petId: string | null) {
  return useQuery({
    queryKey: vaccineKeys.all(petId ?? ''),
    queryFn: () => getVaccines(petId!),
    enabled: !!petId,
    ...CACHE.COOL,
  });
}

export function useSaveVaccine(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, id }: { payload: Omit<Vaccine, 'id' | 'pet_id' | 'created_at'>; id?: string }) =>
      saveVaccine(petId, payload, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: vaccineKeys.all(petId) }),
  });
}

export function useDeleteVaccine(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVaccine(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: vaccineKeys.all(petId) }),
  });
}
