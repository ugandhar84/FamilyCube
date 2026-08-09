import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CACHE } from '@/lib/queryClient';
import {
  getAppointments, getUpcomingAppointments,
  saveAppointment, deleteAppointment,
  type Appointment,
} from '@/lib/db/appointments';

export const appointmentKeys = {
  all:      (petId: string) => ['appointments', petId] as const,
  upcoming: (petId: string) => ['appointments', petId, 'upcoming'] as const,
};

export function useAppointments(petId: string | null) {
  return useQuery({
    queryKey: appointmentKeys.all(petId ?? ''),
    queryFn: () => getAppointments(petId!),
    enabled: !!petId,
    ...CACHE.WARM,
  });
}

export function useUpcomingAppointments(petId: string | null) {
  return useQuery({
    queryKey: appointmentKeys.upcoming(petId ?? ''),
    queryFn: () => getUpcomingAppointments(petId!),
    enabled: !!petId,
    ...CACHE.WARM,
  });
}

export function useSaveAppointment(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, id }: { payload: Omit<Appointment, 'id' | 'pet_id'>; id?: string }) =>
      saveAppointment(petId, payload, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments', petId] }),
  });
}

export function useDeleteAppointment(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments', petId] }),
  });
}
