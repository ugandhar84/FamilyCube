import { useState, useCallback } from 'react';
import { showAlert } from '@/components/AppAlert';
import { supabase } from '@/lib/supabase';
import { format, isBefore } from 'date-fns';
import { insertCommunityEvent, deleteEventRsvpByUser, insertEventRsvp } from '@/lib/db';
import { todayLocal } from '@/lib/dates';
import type { CommunityEvent } from '@/features/social/types';

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; };

export function useSocialEvents(userId: string | null, activePetId: string | null) {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [evType, setEvType] = useState('meetup');
  const [evLocation, setEvLocation] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const [evStart, setEvStart] = useState<Date>(tomorrow());
  const [evEnd, setEvEnd] = useState<Date>(() => { const d = tomorrow(); d.setHours(12, 0, 0, 0); return d; });
  const [pickerTarget, setPickerTarget] = useState<'startDate' | 'startTime' | 'endDate' | 'endTime' | null>(null);
  const [evCoverUri, setEvCoverUri] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const today = todayLocal();
      const { data: evData } = await supabase
        .from('community_events').select('*, event_rsvps(user_id)')
        .eq('is_public', true).gte('event_date', today)
        .order('event_date', { ascending: true }).limit(20);
      const evRows = evData ?? [];

      const orgIds = [...new Set(evRows.map((ev: any) => ev.organizer_id).filter(Boolean))];
      const { data: orgProfiles } = orgIds.length
        ? await supabase.from('profiles').select('id, full_name, handle, avatar_url').in('id', orgIds)
        : { data: [] };
      const orgMap = Object.fromEntries((orgProfiles ?? []).map((p: any) => [p.id, p]));

      setEvents(evRows.map((ev: any) => ({
        ...ev,
        organizer: orgMap[ev.organizer_id] ?? null,
        rsvp_count: (ev.event_rsvps ?? []).length,
        user_rsvpd: (ev.event_rsvps ?? []).some((r: any) => r.user_id === userId),
      })));
    } finally {
      setLoadingEvents(false);
    }
  }, [userId]);

  const toggleRsvp = useCallback(async (event: CommunityEvent) => {
    if (!userId) return;
    const wasRsvpd = event.user_rsvpd;

    // Confirm before un-RSVPing so it can't be tapped off accidentally
    if (wasRsvpd) {
      showAlert('Cancel RSVP?', `Remove yourself from "${event.title}"?`, [
        { text: 'Keep Going', style: 'cancel' },
        { text: 'Cancel RSVP', style: 'destructive', onPress: async () => {
          setEvents(prev => prev.map(ev => ev.id !== event.id ? ev : {
            ...ev, user_rsvpd: false, rsvp_count: Math.max(0, ev.rsvp_count - 1),
          }));
          try { await deleteEventRsvpByUser(userId, event.id); }
          catch {
            setEvents(prev => prev.map(ev => ev.id !== event.id ? ev : {
              ...ev, user_rsvpd: true, rsvp_count: ev.rsvp_count + 1,
            }));
          }
        }},
      ]);
      return;
    } else {
      if (!activePetId) {
        showAlert('Select a pet', 'Please select a pet before RSVPing to events.');
        return;
      }
      // Optimistic update
      setEvents(prev => prev.map(ev => ev.id !== event.id ? ev : {
        ...ev, user_rsvpd: true, rsvp_count: ev.rsvp_count + 1,
      }));
      try { await insertEventRsvp({ event_id: event.id, user_id: userId }); }
      catch {
        setEvents(prev => prev.map(ev => ev.id !== event.id ? ev : {
          ...ev, user_rsvpd: false, rsvp_count: Math.max(0, ev.rsvp_count - 1),
        }));
        return;
      }
      supabase.functions.invoke('notify-event-rsvp', {
        body: { event_id: event.id, action: 'join' },
      }).catch(() => {});
    }
  }, [userId, activePetId]);

  const createEvent = useCallback(async () => {
    if (!evTitle.trim() || !userId) return;
    if (evTitle.trim().length < 3) { showAlert('Title too short', 'Event title must be at least 3 characters.'); return; }
    if (evTitle.trim().length > 100) { showAlert('Title too long', 'Event title must be 100 characters or fewer.'); return; }
    if (isBefore(evEnd, evStart)) { showAlert('Invalid times', 'End time must be after start time.'); return; }
    setSavingEvent(true);
    try {
      let coverUrl: string | null = null;
      if (evCoverUri) {
        const ext = evCoverUri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `events/${userId}/${Date.now()}.${ext}`;
        const blob = await (await fetch(evCoverUri)).blob();
        const { error: upErr } = await supabase.storage.from('post-photos').upload(path, blob, { contentType: `image/${ext}` });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('post-photos').getPublicUrl(path);
          coverUrl = urlData.publicUrl;
        }
      }
      await insertCommunityEvent({
        organizer_id: userId,
        title: evTitle.trim(),
        description: evDesc.trim() || null,
        event_type: evType,
        event_date: format(evStart, 'yyyy-MM-dd'),
        event_time: format(evStart, 'HH:mm'),
        event_end_date: format(evEnd, 'yyyy-MM-dd'),
        event_end_time: format(evEnd, 'HH:mm'),
        location_name: evLocation.trim() || null,
        cover_url: coverUrl,
        is_public: true,
      });
    } catch (e: any) {
      setSavingEvent(false);
      showAlert('Error', e.message);
      return;
    }
    setSavingEvent(false);
    setPickerTarget(null);
    setShowCreateEvent(false);
    setEvTitle(''); setEvDesc(''); setEvLocation(''); setEvType('meetup'); setEvCoverUri(null);
    const t = tomorrow(); setEvStart(t);
    const e = tomorrow(); e.setHours(12, 0, 0, 0); setEvEnd(e);
    showAlert('Event created! 🎉', 'Your event is live for the community.');
    loadEvents();
  }, [evTitle, evDesc, evType, evLocation, evStart, evEnd, userId, loadEvents]);

  return {
    events, loadingEvents,
    showCreateEvent, setShowCreateEvent,
    evTitle, setEvTitle,
    evDesc, setEvDesc,
    evType, setEvType,
    evLocation, setEvLocation,
    savingEvent,
    evStart, setEvStart,
    evEnd, setEvEnd,
    pickerTarget, setPickerTarget,
    evCoverUri, setEvCoverUri,
    loadEvents, toggleRsvp, createEvent,
  };
}
