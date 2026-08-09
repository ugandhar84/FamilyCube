import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { formatTime } from '@/lib/units';
import { pickCancelReason } from '@/features/social/utils';
import BottomSheet from '@/components/BottomSheet';
import { EmojiAvatar } from '@/features/social/components/EmojiAvatar';
import { IncomingRequest } from '@/features/social/types';

interface OutgoingPlaydateSheetProps {
  sheet: any | null;
  onClose: () => void;
  ac: string;
  colors: any;
  userId: string | null;
  playdatesChatEnabled: boolean;
  playdateChats: any[];
  proposalHistory: any[];
  openCounterPropose: (reqId: string) => void;
  loadPlaydateChats: () => void;
  loadIncomingRequests: () => void;
  setOutgoingActiveReqs: React.Dispatch<React.SetStateAction<any[]>>;
  setRequestedPets: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  setPlaydateStatuses: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  withdrawPlaydate: (p: any) => void;
}

export const OutgoingPlaydateSheet = React.memo(function OutgoingPlaydateSheet({
  sheet, onClose,
  ac, colors, userId,
  playdatesChatEnabled, playdateChats, proposalHistory,
  openCounterPropose, loadPlaydateChats, loadIncomingRequests,
  setOutgoingActiveReqs, setRequestedPets, setPlaydateStatuses, withdrawPlaydate,
}: OutgoingPlaydateSheetProps) {
  const fmtDate = (d: string) => { try { return format(parseISO(d), 'EEEE, MMMM d'); } catch { return d; } };
  const fmtTime = (t: string) => { try { const [hh, mm] = t.split(':').map(Number); const tmp = new Date(); tmp.setHours(hh, mm, 0, 0); return formatTime(tmp); } catch { return t.slice(0, 5); } };

  const oac         = sheet?.to_pet?.accent_color ?? ac;
  const isConfirmed = sheet?.status === 'accepted' || sheet?.status === 'agreed';
  const sheetIsMyTurn = sheet?.isMyTurn ?? false;
  const dateStr    = sheet ? (isConfirmed ? (sheet.agreed_date ?? sheet.proposed_date) : sheet.proposed_date) : null;
  const timeStr    = sheet ? (isConfirmed ? (sheet.agreed_time ?? sheet.proposed_time) : sheet.proposed_time) : null;
  const endTimeStr = sheet ? (isConfirmed ? null : (sheet.proposed_end_time ?? null)) : null;
  const locStr     = sheet ? (isConfirmed ? (sheet.agreed_location ?? sheet.proposed_location) : sheet.proposed_location) : null;
  const msgStr     = sheet ? (isConfirmed ? null : (sheet.message ?? null)) : null;
  const chatIdVal  = sheet?.chat_id ?? null;

  const addToCalendar = async () => {
    if (!dateStr || !sheet) return;
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission needed', 'Please allow calendar access in Settings to add this playdate.');
      return;
    }
    const tStr = timeStr ?? '10:00';
    const [hh, mm] = tStr.split(':').map(Number);
    const start = new Date(dateStr + 'T00:00:00');
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const petName = sheet.to_pet?.name ?? 'Dog';
    const storageKey = chatIdVal ? `playdate_cal_event_${chatIdVal}` : null;
    const eventDetails = {
      title: `🐾 Playdate with ${petName}`,
      startDate: start,
      endDate: end,
      location: locStr ?? undefined,
      notes: `Playdate arranged via PawBond 🐾`,
      alarms: [{ relativeOffset: -60 }] as Calendar.Alarm[],
    };
    try {
      const existingId = storageKey ? await AsyncStorage.getItem(storageKey) : null;
      if (existingId) {
        try {
          await Calendar.updateEventAsync(existingId, eventDetails);
          showAlert('Calendar updated! 🐾', `Your playdate with ${petName} has been updated.`);
          return;
        } catch {
          if (storageKey) await AsyncStorage.removeItem(storageKey);
        }
      }
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const defaultCal = calendars.find(c => c.allowsModifications && (c.isPrimary || c.source?.name === 'Default')) ?? calendars.find(c => c.allowsModifications);
      if (!defaultCal) { showAlert('No calendar found', 'Could not find a writable calendar on this device.'); return; }
      const newEventId = await Calendar.createEventAsync(defaultCal.id, eventDetails);
      if (newEventId && storageKey) await AsyncStorage.setItem(storageKey, newEventId);
      showAlert('Added to Calendar! 🐾', `Your playdate with ${petName} is saved.`);
    } catch (e: any) {
      showAlert('Error', e.message ?? 'Could not add to calendar.');
    }
  };

  return (
    <BottomSheet
      visible={!!sheet}
      onClose={onClose}
      title={sheet?.to_pet?.name ?? 'Playdate'}
      titleIcon={sheet?.to_pet ? <EmojiAvatar emoji={sheet.to_pet.emoji} name={sheet.to_pet.name} size={36} color={oac} avatarUrl={sheet.to_pet.avatar_url} /> : undefined}
      subtitle={
        sheet
          ? isConfirmed
            ? '✅ Playdate confirmed!'
            : sheetIsMyTurn
              ? '📅 Proposed a new time'
              : '⏳ Waiting for their reply…'
          : undefined
      }
      accent={oac}>
      {sheet && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
          {/* Status pill */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: isConfirmed ? '#22C55E18' : sheetIsMyTurn ? `${oac}18` : `${oac}10` }}>
              <Ionicons name={isConfirmed ? 'checkmark-circle' : sheetIsMyTurn ? 'alert-circle-outline' : 'time-outline'} size={14} color={isConfirmed ? colors.success : oac} />
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: isConfirmed ? colors.success : oac }}>
                {isConfirmed
                  ? '✅ Playdate Confirmed!'
                  : sheetIsMyTurn
                    ? `${sheet.to_pet?.name ?? 'They'} proposed a new time`
                    : `⏳ Waiting for ${sheet.to_pet?.name ?? 'them'} to reply`}
              </Text>
            </View>
          </View>

          {/* Date / time / location block */}
          {dateStr ? (
            <View style={{ backgroundColor: isConfirmed ? '#22C55E10' : `${oac}10`, borderRadius: 14, borderWidth: 1, borderColor: isConfirmed ? '#22C55E28' : `${oac}28`, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16, gap: 8 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', letterSpacing: 0.8, color: isConfirmed ? colors.success : oac }}>
                {isConfirmed ? 'CONFIRMED DATE & TIME' : sheetIsMyTurn ? `${sheet.to_pet?.name?.toUpperCase()}'S PROPOSAL` : 'YOUR PROPOSAL'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="calendar-outline" size={16} color={isConfirmed ? colors.success : oac} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{fmtDate(dateStr)}</Text>
              </View>
              {timeStr ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>
                    {fmtTime(timeStr)}{endTimeStr ? ` → ${fmtTime(endTimeStr)}` : ''}
                  </Text>
                </View>
              ) : null}
              {locStr ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{locStr}</Text>
                </View>
              ) : null}
              {msgStr ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.textSecondary} style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic', flex: 1 }}>"{msgStr}"</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Respond actions when it's the requester's turn after a counter-proposal */}
          {sheetIsMyTurn && !isConfirmed && (() => {
            const reqId = sheet.req_id;
            const acceptProposal = async () => {
              if (!reqId) return;
              try {
                const { data, error } = await supabase.functions.invoke('playdates', {
                  body: { action: 'respond', request_id: reqId, respond_action: 'accept' },
                });
                if (error || data?.error) { showAlert('Error', data?.error ?? error?.message ?? 'Could not accept'); return; }
                onClose();
                loadPlaydateChats();
                loadIncomingRequests();
                if (playdatesChatEnabled && data?.chat_id) router.push(`/playdate-chat/${data.chat_id}` as any);
                else router.push('/my-playdates' as any);
              } catch (e: any) { showAlert('Error', e.message); }
            };
            return (
              <View style={{ gap: 10, marginBottom: 10 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.success }}
                  onPress={acceptProposal}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={{ fontWeight: '800', fontSize: TYPO.body, color: '#fff' }}>Accept ✓</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: oac, backgroundColor: `${oac}12` }}
                    onPress={() => { if (reqId) { onClose(); openCounterPropose(reqId); } }}>
                    <Ionicons name="calendar-outline" size={15} color={oac} />
                    <Text style={{ fontWeight: '700', fontSize: TYPO.body, color: oac }}>New time</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: '#E24B4A50', backgroundColor: '#E24B4A10' }}
                    onPress={async () => {
                      onClose();
                      if (!reqId) return;
                      try {
                        const { data, error } = await supabase.functions.invoke('playdates', { body: { action: 'withdraw', request_id: reqId } });
                        if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
                        setOutgoingActiveReqs(prev => prev.filter(r => r.id !== reqId));
                        setRequestedPets(m => { const n = new Map(m); n.delete(sheet.to_pet?.id); return n; });
                        setPlaydateStatuses(m => { const n = new Map(m); n.delete(sheet.to_pet?.id); return n; });
                      } catch (e: any) { showAlert('Error', e.message); }
                    }}>
                    <Text style={{ fontWeight: '700', fontSize: TYPO.body, color: colors.danger }}>Withdraw</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

          {/* Add to Calendar */}
          {isConfirmed && dateStr && (
            <TouchableOpacity
              style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.success, marginBottom: 10 }}
              onPress={addToCalendar}>
              <Ionicons name="calendar" size={18} color="#fff" />
              <Text style={{ fontWeight: '800', fontSize: TYPO.body, color: '#fff' }}>Add to Calendar</Text>
            </TouchableOpacity>
          )}

          {/* Proposal negotiation history */}
          {isConfirmed && proposalHistory.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>NEGOTIATION HISTORY</Text>
              {proposalHistory.map((prop, i) => {
                const pet = Array.isArray(prop.proposed_by_pet) ? prop.proposed_by_pet[0] : prop.proposed_by_pet;
                const isMe = prop.proposed_by_owner_id === userId;
                const isAccepted = prop.status === 'accepted';
                const statusColor = isAccepted ? colors.success : prop.status === 'superseded' ? colors.textTertiary : oac;
                const fmtD = (d: string) => { try { return format(parseISO(d), 'EEE, MMM d'); } catch { return d; } };
                const fmtT = (t: string) => { try { const [h, m] = t.split(':').map(Number); const tmp = new Date(); tmp.setHours(h, m, 0, 0); return formatTime(tmp); } catch { return t.slice(0, 5); } };
                return (
                  <View key={prop.id} style={{ flexDirection: 'row', gap: 10, marginBottom: i < proposalHistory.length - 1 ? 12 : 0 }}>
                    <View style={{ alignItems: 'center', width: 20 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor, marginTop: 3 }} />
                      {i < proposalHistory.length - 1 && (
                        <View style={{ width: 1.5, flex: 1, backgroundColor: colors.border, marginTop: 3 }} />
                      )}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                          {pet?.emoji} {isMe ? 'You' : (pet?.name ?? 'Them')}
                        </Text>
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: statusColor + '20' }}>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: statusColor }}>
                            {isAccepted ? 'Accepted ✓' : prop.status === 'superseded' ? 'Counter-proposed' : `Round ${prop.round}`}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
                        📅 {fmtD(prop.proposed_date)}{prop.proposed_time ? `  ·  🕐 ${fmtT(prop.proposed_time)}` : ''}
                      </Text>
                      {prop.proposed_location ? (
                        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 }}>📍 {prop.proposed_location}</Text>
                      ) : null}
                      {prop.message ? (
                        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 }}>💬 "{prop.message}"</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Destructive action — only when NOT sheetIsMyTurn */}
          {!sheetIsMyTurn && (
            <TouchableOpacity
              style={{ paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: '#E24B4A50', backgroundColor: '#E24B4A10', alignItems: 'center' }}
              onPress={async () => {
                const petId = sheet.to_pet?.id;
                if (isConfirmed) {
                  const reason = await pickCancelReason();
                  if (reason === undefined) return;
                  onClose();
                  try {
                    if (chatIdVal) {
                      const { data, error } = await supabase.functions.invoke('playdates', {
                        body: { action: 'chat_cancel', chat_id: chatIdVal, ...(reason ? { reason } : {}) },
                      });
                      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
                    } else if (sheet.req_id) {
                      const { data, error } = await supabase.functions.invoke('playdates', {
                        body: { action: 'cancel', request_id: sheet.req_id, ...(reason ? { reason } : {}) },
                      });
                      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
                    }
                    if (petId) setPlaydateStatuses(m => { const n = new Map(m); n.delete(petId); return n; });
                    setOutgoingActiveReqs(prev => prev.filter(r => r.to_pet?.id !== petId));
                    loadIncomingRequests();
                    loadPlaydateChats();
                  } catch (e: any) { showAlert('Error', e.message); }
                } else {
                  onClose();
                  withdrawPlaydate(sheet.to_pet);
                }
              }}>
              <Text style={{ fontWeight: '700', fontSize: TYPO.body, color: colors.danger }}>{isConfirmed ? 'Cancel Playdate' : 'Withdraw Request'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
});
