import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import { getWeightLogs, logWeight, deleteWeightLog } from '@/lib/db/weight';

export const weightKeys = {
  all: (petId: string) => ['weight', petId] as const,
};

export function useWeightLogs(petId: string | null, limit = 30) {
  return useQuery({
    queryKey: weightKeys.all(petId ?? ''),
    queryFn: () => getWeightLogs(petId!, limit),
    enabled: !!petId,
    ...CACHE.COOL,
  });
}

export function useLogWeight(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ weightKg, loggedBy }: { weightKg: number; loggedBy?: string }) =>
      logWeight(petId, weightKg, loggedBy),
    onSuccess: () => qc.invalidateQueries({ queryKey: weightKeys.all(petId) }),
  });
}

export function useDeleteWeightLog(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWeightLog(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: weightKeys.all(petId) }),
  });
}
