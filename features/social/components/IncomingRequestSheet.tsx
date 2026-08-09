import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { formatTime } from '@/lib/units';
import { relTime } from '@/features/social/utils';
import BottomSheet from '@/components/BottomSheet';
import { EmojiAvatar } from '@/features/social/components/EmojiAvatar';
import { IncomingRequest } from '@/features/social/types';

interface IncomingRequestSheetProps {
  visible: boolean;
  request: IncomingRequest | null;
  onClose: () => void;
  ac: string;
  colors: any;
  userId: string | null;
  respondAndChat: (id: string) => void;
  respondToRequest: (id: string, action: 'decline', petName?: string) => void;
  openCounterPropose: (requestId: string) => void;
  playdatesChatEnabled: boolean;
  playdateChats: any[];
  setIncomingRequests: React.Dispatch<React.SetStateAction<IncomingRequest[]>>;
}

export const IncomingRequestSheet = React.memo(function IncomingRequestSheet({
  visible, request, onClose,
  ac, colors, userId,
  respondAndChat, respondToRequest, openCounterPropose,
  playdatesChatEnabled, playdateChats, setIncomingRequests,
}: IncomingRequestSheetProps) {
  const fmtD = (d: string) => { try { return format(parseISO(d), 'EEEE, MMMM d'); } catch { return d; } };
  const fmtT = (t: string) => { try { const [h, m] = t.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return formatTime(d); } catch { return t.slice(0, 5); } };

  const sac = request?.from_pet?.accent_color ?? ac;
  const myTurn = !request || request.status === 'pending' || request.responder_user_id !== userId;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={request?.from_pet?.name}
      titleIcon={request ? <EmojiAvatar emoji={request.from_pet.emoji ?? '🐾'} name={request.from_pet.name} size={36} color={request.from_pet.accent_color ?? ac} avatarUrl={request.from_pet.avatar_url} /> : undefined}
      subtitle={
        request?.status === 'scheduling'
          ? request.responder_user_id !== userId
            ? '📅 Proposed a new time'
            : `⏳ Waiting for reply…`
          : request?.status === 'pending'
            ? `🐾 Wants to play! · ${relTime(request.created_at)}`
            : undefined
      }
      accent={sac}>
      {request && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
          {request.status === 'scheduling' && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: myTurn ? `${sac}18` : colors.inputBg }}>
                <Ionicons name={myTurn ? 'alert-circle-outline' : 'time-outline'} size={13} color={myTurn ? sac : colors.textTertiary} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: myTurn ? sac : colors.textTertiary }}>
                  {myTurn
                    ? `${request.from_pet.name} proposed a new time`
                    : `You proposed — waiting for ${request.from_pet.name}`}
                </Text>
              </View>
            </View>
          )}

          {request.proposed_date && (
            <View style={{ backgroundColor: myTurn ? `${sac}10` : colors.inputBg, borderRadius: 14, borderWidth: 1, borderColor: myTurn ? `${sac}28` : colors.border, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 16, gap: 10 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', letterSpacing: 0.8, color: myTurn ? sac : colors.textTertiary }}>
                {myTurn ? 'PROPOSED DATE & TIME' : 'YOUR PROPOSAL'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="calendar-outline" size={16} color={myTurn ? sac : colors.textSecondary} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{fmtD(request.proposed_date!)}</Text>
              </View>
              {request.proposed_time ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>
                    {fmtT(request.proposed_time!)}
                    {request.proposed_end_time ? ` → ${fmtT(request.proposed_end_time)}` : ''}
                  </Text>
                </View>
              ) : null}
              {request.proposed_location ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{request.proposed_location}</Text>
                </View>
              ) : null}
              {request.message ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.textSecondary} style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic', flex: 1 }}>"{request.message}"</Text>
                </View>
              ) : null}
            </View>
          )}

          {myTurn ? (
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: sac, alignItems: 'center' }}
                onPress={() => respondAndChat(request.id)}>
                <Text style={{ fontWeight: '800', fontSize: TYPO.body, color: '#fff' }}>Accept 🐾</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: sac, backgroundColor: `${sac}14` }}
                  onPress={() => {
                    onClose();
                    const relatedChat = playdatesChatEnabled
                      ? playdateChats.find(c => c.from_pet?.id === request.from_pet?.id || c.to_pet?.id === request.from_pet?.id)
                      : null;
                    if (relatedChat?.id) {
                      // router.push handled by parent if needed — just open counter-propose
                    }
                    openCounterPropose(request.id);
                  }}>
                  <Ionicons name="calendar-outline" size={14} color={sac} />
                  <Text style={{ fontWeight: '700', fontSize: TYPO.body, color: sac }}>Propose new time</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 0.7, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' }}
                  onPress={() => respondToRequest(request.id, 'decline', request.from_pet?.name)}>
                  <Text style={{ fontWeight: '700', fontSize: TYPO.body, color: colors.textSecondary }}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inputBg, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, justifyContent: 'center' }}>
                <Ionicons name="time-outline" size={15} color={colors.textTertiary} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Waiting for {request.from_pet.name} to reply…</Text>
              </View>
              <TouchableOpacity
                style={{ paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: '#E24B4A50', backgroundColor: '#E24B4A10', alignItems: 'center' }}
                onPress={() => {
                  onClose();
                  respondToRequest(request.id, 'decline', request.from_pet?.name);
                }}>
                <Text style={{ fontWeight: '700', fontSize: TYPO.body, color: colors.danger }}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
});
