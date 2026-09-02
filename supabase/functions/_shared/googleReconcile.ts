// Shared Google Calendar incremental-changes reconciliation — extracted
// from calendar-webhook-google so both the webhook (kept in case a custom
// domain + Search Console verification is set up later, enabling real
// push) and calendar-google-poll (the actual working inbound-sync path,
// since Google's channels.watch push requires the webhook's domain to be
// verified in Search Console under the same Cloud project as the OAuth
// client — not achievable on a supabase.co domain we don't control DNS
// for) share exactly one implementation of "fetch what changed since
// sync_token and apply it."
import { getValidAccessToken, type CalendarConnectionRow } from './calendarTokens.ts';
import { googleBodyToPortablePatch } from './calendarFieldMapping.ts';

export async function reconcileGoogleChanges(supabase: any, connection: CalendarConnectionRow): Promise<void> {
  const accessToken = await getValidAccessToken(supabase, connection);
  const calendarId = encodeURIComponent(connection.external_calendar_id ?? 'primary');
  let syncToken = connection.sync_token;
  let pageToken: string | undefined;
  const changedItems: any[] = [];

  do {
    const params = new URLSearchParams();
    // Google's Events.list defaults showDeleted to false — a cancelled
    // event is silently OMITTED from the response entirely, even on a
    // valid incremental syncToken call, unless this is explicitly set.
    // Without it, reconcileOneGoogleEvent's `item.status === 'cancelled'`
    // branch could never even be reached, no matter how correct its own
    // logic is — live-reported: an event deleted directly on Google
    // Calendar never disappeared from the app, even after reopening Hub
    // (which forces an immediate poll). Must be set on every page/branch
    // of this call, same as singleEvents.
    params.set('showDeleted', 'true');
    if (pageToken) {
      // pageToken is treated as a fully opaque cursor carrying the
      // original query forward — sent alone, no other params alongside it.
      params.set('pageToken', pageToken);
    } else {
      // singleEvents=true always on the first page of a sync — without
      // it, a recurring series comes back as one MASTER record carrying
      // its ORIGINAL start date (e.g. a yearly bank reminder from 2017),
      // which timeMin does NOT filter out even though the series itself
      // is still ongoing; singleEvents expands the series into individual
      // occurrences instead, so timeMin correctly limits results to
      // today-onward occurrences only. Must stay set the same way on
      // every call using a given sync token going forward (Google
      // requires singleEvents to stay consistent for a sync token's
      // lifetime) — but this connection's sync_token is only ever
      // persisted from nextSyncToken AFTER pagination completes with
      // singleEvents=true already applied to the whole page sequence, so
      // that invariant holds without needing to resend it here too.
      params.set('singleEvents', 'true');
      if (syncToken) {
        // timeMin/timeMax cannot be combined with syncToken (Google
        // rejects the request) — not needed here anyway, since a
        // syncToken-based call only ever returns the actual delta
        // (created/changed/deleted items) rather than re-expanding every
        // occurrence of every recurring series again.
        params.set('syncToken', syncToken);
      } else {
        // Start of today in UTC (this Deno process's local timezone),
        // not the current instant — using `now` here would exclude an
        // event created earlier today, before this sync happened to run.
        // No per-connection timezone is stored, so this is UTC-midnight,
        // not the connected user's actual local midnight — the practical
        // effect is always a slightly WIDER window than the user's true
        // "today" (their local midnight always falls at or after UTC
        // midnight for a positive offset, and at or after for a negative
        // one measured the other direction — worked through both cases:
        // it's over-inclusive either way, never excludes a same-day
        // event). Fine for this use — the goal is "don't miss today,"
        // not pixel-precise day boundaries, and matches the same
        // UTC-based approach calendar-freebusy-sync's SYNC_WINDOW_DAYS
        // already uses elsewhere in this codebase.
        const startOfToday = new Date();
        startOfToday.setUTCHours(0, 0, 0, 0);
        params.set('timeMin', startOfToday.toISOString());
        // Bounds how far a recurring series (yearly birthday/bill
        // reminders etc.) gets expanded on this FIRST sync — without it,
        // singleEvents=true expands a recurring series with no end date
        // years into the future, one row per occurrence (confirmed live:
        // 182 rows from a handful of recurring reminders). 90 days is
        // enough to catch a real recurring family commitment (e.g. a
        // weekly piano lesson) without importing a decade of bank/birthday
        // reminders that have nothing to do with family scheduling.
        const in90Days = new Date();
        in90Days.setDate(in90Days.getDate() + 90);
        params.set('timeMax', in90Days.toISOString());
      }
    }

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 410) {
      await supabase.from('calendar_connections').update({ sync_token: null }).eq('id', connection.id);
      return reconcileGoogleChanges(supabase, { ...connection, sync_token: null });
    }
    if (!res.ok) throw new Error(`Google events.list failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    changedItems.push(...(json.items ?? []));
    pageToken = json.nextPageToken;
    if (json.nextSyncToken) syncToken = json.nextSyncToken;
  } while (pageToken);

  // TEMPORARY diagnostic — live-reported: deleting an event directly on
  // Google Calendar still never reflects in the app even after the
  // showDeleted fix + a forced sync_token reset + a throttle-bypassing
  // manual refresh. Confirmed via an earlier round of this same debug
  // line that Google DOES correctly report the item as cancelled
  // (showDeleted is working) — so the remaining gap is inside
  // reconcileOneGoogleEvent's own handling of that item, not the fetch.
  // Now captures each item's own outcome string alongside its status to
  // pin down exactly which internal branch it's landing in (e.g.
  // "no-link-found" would mean the event_external_links row it needs
  // never existed or doesn't match).
  const outcomes: string[] = [];
  for (const item of changedItems) {
    const outcome = await reconcileOneGoogleEvent(supabase, connection, item);
    outcomes.push(`${item.id}:${item.status}${item.recurringEventId ? '(instance)' : ''} -> ${outcome}`);
  }
  const debugSummary = `DEBUG poll@${new Date().toISOString()}: ${changedItems.length} item(s)` +
    (outcomes.length ? ' — ' + outcomes.join(' | ') : '');
  await supabase.from('calendar_connections').update({ last_error: debugSummary }).eq('id', connection.id);

  if (syncToken) await supabase.from('calendar_connections').update({ sync_token: syncToken }).eq('id', connection.id);
}

async function reconcileOneGoogleEvent(supabase: any, connection: CalendarConnectionRow, item: any): Promise<string> {
  // A recurring Google event, expanded via singleEvents=true, returns one
  // item PER OCCURRENCE — each with its own instance id (item.id, e.g.
  // "abc123_20270513T210000Z") but also item.recurringEventId pointing
  // back to the series MASTER id (absent on a genuinely one-off event).
  // Live-confirmed bug: a recurring series pushed out via calendar-sync-
  // push never ended up linked at all (its own event_external_links
  // insert either failed or raced), so EVERY instance looked brand-new on
  // every poll — recreating ~84-250+ duplicate local rows repeatedly, even
  // right after being manually cleaned up, since nothing remembered "this
  // whole series has already been seen" between poll runs.
  //
  // Fix: key the identity check on the MASTER id (recurringEventId, or
  // the item's own id for a non-recurring event) rather than each
  // instance's own id — collapses every occurrence of one recurring
  // series onto exactly one local row/link, symmetric with the outbound
  // side (calendar-sync-push only ever links the master id too). This is
  // self-healing regardless of why the original link never got created —
  // the first instance of a series seen after this fix creates and links
  // the master id; every subsequent instance (including ones already
  // queued in a page of results) matches that link and is skipped.
  const identityId = item.recurringEventId || item.id;

  const { data: link, error: linkError } = await supabase.from('event_external_links')
    .select('*').eq('connection_id', connection.id).eq('external_event_id', identityId).maybeSingle();

  if (item.status === 'cancelled') {
    // A cancelled INSTANCE of a still-live recurring series must not
    // delete the whole series' local row — only a cancelled event whose
    // own id IS the identity (a genuinely single event, or the master
    // itself being cancelled) should.
    if (link && item.id === identityId) {
      const { error: updateErr } = await supabase.from('calendar_events').update({ deleted_at: new Date().toISOString(), deleted_by: 'external:google' }).eq('id', link.event_id);
      await supabase.from('event_external_links').delete().eq('id', link.id);
      return updateErr ? `delete-failed(${updateErr.message})` : `deleted(event_id=${link.event_id})`;
    }
    return link ? `skip-not-identity(item.id=${item.id},identityId=${identityId})` : `no-link-found(external_event_id=${identityId}${linkError ? ',err=' + linkError.message : ''})`;
  }

  // Already represented locally (either a genuinely one-off event we've
  // seen before, or ANY instance of a recurring series we've already
  // linked via its master id) — apply an update if the external side is
  // actually newer, same last-write-wins-by-updated_at rule
  // calendar-webhook-outlook's reconcileOneOutlookEvent already uses.
  //
  // Real gap found in a QA pass: this branch used to unconditionally
  // `return` here — editing an event on Google after its first sync ever
  // reached FamilyCube (title/time/location/notes) was silently dropped
  // forever, since nothing ever re-checked an already-linked item's body
  // against what's stored locally. Google's events.list delta only ever
  // returns items that actually changed since the last sync_token, so
  // every item reaching this function already represents a real change on
  // Google's side — the only thing this was missing was actually applying
  // it to an existing link.
  if (link) {
    // Only apply the update when the changed item IS the identity (a
    // genuinely one-off event, or the recurring series' own master record)
    // — same reasoning as the cancellation branch above: a single
    // exception occurrence of an otherwise-unchanged series must not
    // overwrite the whole series' local row with just that one instance's
    // fields.
    if (item.id !== identityId) return `skip-instance(item.id=${item.id})`;
    const { data: localRow } = await supabase.from('calendar_events').select('updated_at, deleted_at').eq('id', link.event_id).maybeSingle();
    if (!localRow || localRow.deleted_at) return `local-row-gone(event_id=${link.event_id})`;
    const externalModified = item.updated ? new Date(item.updated).getTime() : Date.now();
    const localModified = localRow.updated_at ? new Date(localRow.updated_at).getTime() : 0;
    if (externalModified <= localModified) return `not-newer(ext=${externalModified},local=${localModified})`;
    const patch = googleBodyToPortablePatch(item);
    await supabase.from('calendar_events').update({
      title: patch.title, date: patch.date, start_time: patch.startTime, end_time: patch.endTime,
      all_day: patch.allDay, location: patch.location, notes: patch.notes,
      last_external_sync_at: new Date().toISOString(), last_external_sync_provider: 'google', last_external_sync_account: connection.connected_account_email ?? null,
    }).eq('id', link.event_id);
    await supabase.from('event_external_links').update({ last_pulled_at: new Date().toISOString(), external_etag: item.etag ?? null }).eq('id', link.id);
    return `updated(event_id=${link.event_id})`;
  }

  const patch = googleBodyToPortablePatch(item);

  // Live-reported bug: a FamilyCube-native Ride (e.g. "Pick up kid from
  // school," created directly in-app with its own driver/helper
  // assignment) and this same real-world pickup ALSO existing on the
  // connected Google Calendar (e.g. the other parent added it there, or a
  // school's shared calendar pushed it) previously always landed as two
  // completely independent calendar_events rows — this function had no
  // path back to check_likely_duplicate_event at all, unlike manual
  // creation (EventFormModal.tsx/AskCubeChat.tsx), which already warns on
  // this exact collision. The two rows then showed as a genuine "double
  // booked" conflict for whoever ended up assigned on both, with no way
  // to tell from the UI that they were the same real pickup.
  //
  // Only checked for a genuinely NEW external item (this branch — an
  // already-linked item goes through the update path above instead), and
  // only when a same-title/time/family FamilyCube event already exists
  // within the RPC's own 14-day window. Link this Google item to that
  // EXISTING row instead of inserting a second one — the native row's
  // richer fields (driver/helper assignment, category, coins, etc.) are
  // preserved untouched; only the external link is created, so future
  // Google-side edits reconcile onto the real row via the update branch
  // above instead of drifting a separate copy.
  if (patch.title && patch.startTime && patch.date) {
    const { data: dupes } = await supabase.rpc('check_likely_duplicate_event', {
      p_family_id: connection.family_id,
      p_title: patch.title,
      p_start_time: patch.startTime,
      p_date: patch.date,
    });
    const dupe = Array.isArray(dupes) ? dupes[0] : dupes;
    if (dupe?.id) {
      const { data: alreadyLinked } = await supabase.from('event_external_links')
        .select('id').eq('connection_id', connection.id).eq('event_id', dupe.id).maybeSingle();
      if (!alreadyLinked) {
        await supabase.from('event_external_links').insert({
          event_id: dupe.id, connection_id: connection.id, external_event_id: identityId,
          external_etag: item.etag ?? null, last_pulled_at: new Date().toISOString(),
        });
      }
      return `linked-to-dupe(event_id=${dupe.id})`;
    }
  }

  const newId = crypto.randomUUID();
  await supabase.from('calendar_events').insert({
    id: newId, family_id: connection.family_id, member_id: connection.member_id,
    title: patch.title, date: patch.date, start_time: patch.startTime, end_time: patch.endTime,
    all_day: patch.allDay ?? false, location: patch.location, notes: patch.notes,
    type: 'event', category: 'Event',
    last_external_sync_at: new Date().toISOString(), last_external_sync_provider: 'google', last_external_sync_account: connection.connected_account_email ?? null,
  });
  await supabase.from('event_external_links').insert({
    event_id: newId, connection_id: connection.id, external_event_id: identityId,
    external_etag: item.etag ?? null, last_pulled_at: new Date().toISOString(),
  });
  return `created(event_id=${newId},external_event_id=${identityId})`;
}
