import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { pd } from '@/features/social/socialStyles';
import { relTime, petAgeLabel } from '@/features/social/utils';
import { toTitle } from '@/lib/format';

interface PlaydatesTabProps {
  ac: string;
  colors: any;
  userId: string | null;
  playdateChats: any[];
  incomingRequests: any[];
  requestedPets: Map<string, string>;
  outgoingActiveReqs?: any[];
  loadingRequests: boolean;
  loadingChats: boolean;
  playdatesChatEnabled: boolean;
  respondingId: string | null;
  formatTime: (d: Date) => string;
  onRespondToRequest: (id: string, action: 'decline', petName?: string) => void;
  onRespondAndChat: (id: string) => void;
  onRespondAndSchedule: (id: string) => void;
  onGoNearby: () => void;
}

function SectionHead({ title, count, onViewAll, ac, colors }: {
  title: string; count: number; onViewAll?: () => void; ac: string; colors: any;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>{title}</Text>
      {count > 0 && (
        <View style={{ backgroundColor: ac, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: onViewAll ? 8 : 0 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>{count}</Text>
        </View>
      )}
      {onViewAll && (
        <TouchableOpacity onPress={onViewAll}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: ac }}>View All</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ChatCard({ chat, userId, ac, colors, playdatesChatEnabled, formatTime }: {
  chat: any; userId: string | null; ac: string; colors: any;
  playdatesChatEnabled: boolean; formatTime: (d: Date) => string;
}) {
  const myPet    = chat.from_owner_id === userId ? chat.from_pet : chat.to_pet;
  const theirPet = chat.from_owner_id === userId ? chat.to_pet   : chat.from_pet;
  const cAc = theirPet?.accent_color ?? colors.primary;
  return (
    <TouchableOpacity
      style={[pd.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => playdatesChatEnabled ? router.push(`/playdate-chat/${chat.id}`) : router.push('/my-playdates' as any)}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={[pd.ava, { backgroundColor: `${ac}20`, zIndex: 2 }]}>
            {myPet?.avatar_url
              ? <Image source={{ uri: myPet.avatar_url }} cachePolicy="memory-disk" style={{ width: 36, height: 36, borderRadius: 18 }} />
              : <Text style={{ fontSize: TYPO.heading }}>{myPet?.emoji}</Text>}
          </View>
          <View style={[pd.ava, { backgroundColor: `${cAc}20`, marginLeft: -12 }]}>
            {theirPet?.avatar_url
              ? <Image source={{ uri: theirPet.avatar_url }} cachePolicy="memory-disk" style={{ width: 36, height: 36, borderRadius: 18 }} />
              : <Text style={{ fontSize: TYPO.heading }}>{theirPet?.emoji}</Text>}
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
            {myPet?.name} & {theirPet?.name}
          </Text>
          {chat.status === 'agreed' ? (
            <Text style={{ fontSize: TYPO.body, color: '#14B8A6', fontWeight: '600', marginTop: 2 }}>
              ✅ {chat.agreed_date}{chat.agreed_time ? ` · ${(() => {
                try {
                  const [hh, mm] = (chat.agreed_time as string).split(':').map(Number);
                  const tmp = new Date(); tmp.setHours(hh, mm, 0, 0);
                  return formatTime(tmp);
                } catch { return (chat.agreed_time as string).slice(0, 5); }
              })()}` : ''}{chat.agreed_location ? ` · ${chat.agreed_location}` : ''}
            </Text>
          ) : (
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 }}>💬 Tap to schedule date & time</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return iso; }
}

function fmtTime(t: string) {
  try {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return t.slice(0, 5); }
}

export const PlaydatesTab = React.memo(function PlaydatesTab({
  ac, colors, userId, playdateChats, incomingRequests, requestedPets, outgoingActiveReqs,
  loadingRequests, loadingChats, playdatesChatEnabled, respondingId,
  formatTime, onRespondToRequest, onRespondAndChat, onRespondAndSchedule, onGoNearby,
}: PlaydatesTabProps) {
  const negotiating = playdateChats.filter(c => c.status === 'negotiating');
  const agreed      = playdateChats.filter(c => c.status === 'agreed');
  // Use outgoingActiveReqs if available, else fall back to requestedPets keys
  const sentReqs: any[] = outgoingActiveReqs ?? [];
  const hasContent  = incomingRequests.length > 0 || sentReqs.length > 0 || requestedPets.size > 0 || negotiating.length > 0 || agreed.length > 0;

  return (
    <View style={{ paddingBottom: 32 }}>
      {!hasContent && !loadingRequests && !loadingChats && (
        <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>🐾</Text>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>No playdates yet</Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 20 }}>
            Go to Nearby to find pets and send a playdate request!
          </Text>
          <TouchableOpacity style={[pd.btn, { backgroundColor: ac }]} onPress={onGoNearby}>
            <Ionicons name="location-outline" size={15} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Find Nearby Pets</Text>
          </TouchableOpacity>
        </View>
      )}

      {(loadingRequests || incomingRequests.length > 0) && (
        <>
          <SectionHead title="📥 Incoming Requests" count={incomingRequests.length} ac={ac} colors={colors} />
          {loadingRequests
            ? <View style={{ alignItems: 'center', padding: 20 }}><ActivityIndicator color={ac} /></View>
            : incomingRequests.map(r => {
                const pAc = r.from_pet?.accent_color ?? colors.primary;
                return (
                  <View key={r.id} style={[pd.card, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                      <View style={[pd.ava, { backgroundColor: `${pAc}20`, width: 48, height: 48, borderRadius: 24 }]}>
                        {r.from_pet?.avatar_url
                          ? <Image source={{ uri: r.from_pet.avatar_url }} cachePolicy="memory-disk" style={{ width: 44, height: 44, borderRadius: 22 }} />
                          : <Text style={{ fontSize: TYPO.title }}>{r.from_pet?.emoji}</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                          {r.from_pet?.emoji} {r.from_pet?.name}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                          {r.from_pet?.breed && (
                            <View style={{ backgroundColor: '#FF8C5520', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#FF8C55' }}>{toTitle(r.from_pet.breed)}</Text>
                            </View>
                          )}
                          {(r.from_pet as any)?.birthday && (
                            <View style={{ backgroundColor: '#14B8A620', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#14B8A6' }}>{petAgeLabel((r.from_pet as any).birthday)}</Text>
                            </View>
                          )}
                        </View>
                        {(r.proposed_date || r.message) && (
                          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 3 }} numberOfLines={1}>
                            {r.proposed_date ? `📅 ${r.proposed_date}${r.proposed_time ? ' · ' + r.proposed_time.slice(0,5) : ''}` : ''}
                            {r.proposed_date && r.message ? '  ' : ''}
                            {r.message ? `"${r.message}"` : ''}
                          </Text>
                        )}
                        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>{relTime(r.created_at)}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[pd.declineBtn, { borderColor: colors.border, flex: 1 }]}
                        onPress={() => onRespondToRequest(r.id, 'decline', r.from_pet?.name)}
                        disabled={respondingId === r.id}
                      >
                        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[pd.chatBtn, { backgroundColor: ac, flex: 2 }]}
                        onPress={() => onRespondAndSchedule(r.id)}
                        disabled={respondingId === r.id}
                      >
                        {respondingId === r.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <>
                              <Ionicons name="calendar-outline" size={13} color="#fff" />
                              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Accept & Schedule</Text>
                            </>}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
          }
        </>
      )}

      {sentReqs.length > 0 && (
        <>
          <SectionHead title="⏳ Sent Requests" count={sentReqs.length} ac={ac} colors={colors}
            onViewAll={() => router.push('/my-playdates' as any)} />
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            {sentReqs.map((req: any) => {
              const pet = req.to_pet;
              const pAc = pet?.accent_color ?? ac;
              const statusColor = req.status === 'accepted' ? '#22C55E' : req.status === 'scheduling' ? '#4896D8' : '#FF8C55';
              const statusLabel = req.status === 'accepted' ? '✅ Confirmed' : req.status === 'scheduling' ? '💬 Scheduling' : '⏳ Awaiting reply';
              return (
                <TouchableOpacity
                  key={req.id}
                  style={[pd.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/playdate/${req.id}` as any)}>
                  {/* Header row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <View style={[pd.ava, { backgroundColor: `${pAc}20` }]}>
                      {pet?.avatar_url
                        ? <Image source={{ uri: pet.avatar_url }} cachePolicy="memory-disk" style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
                        : <Text style={{ fontSize: TYPO.heading }}>{pet?.emoji ?? '🐾'}</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{pet?.name ?? '—'}</Text>
                      {pet?.breed && (
                        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 1 }}>{toTitle(pet.breed)}</Text>
                      )}
                    </View>
                    <View style={{ backgroundColor: statusColor + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
                    </View>
                  </View>

                  {/* Proposed / agreed details */}
                  {(req.agreed_date || req.proposed_date) && (
                    <View style={{ backgroundColor: colors.inputBg, borderRadius: 10, padding: 10, gap: 4 }}>
                      {req.agreed_date ? (
                        <>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#22C55E' }}>
                            📅 {fmtDate(req.agreed_date)}{req.agreed_time ? `  🕐 ${fmtTime(req.agreed_time)}` : ''}
                          </Text>
                          {req.agreed_location && (
                            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>📍 {req.agreed_location}</Text>
                          )}
                        </>
                      ) : (
                        <>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#FF8C55' }}>
                            📅 Proposed · {fmtDate(req.proposed_date)}
                            {req.proposed_time ? `  🕐 ${fmtTime(req.proposed_time)}` : ''}
                            {req.proposed_end_time ? ` → ${fmtTime(req.proposed_end_time)}` : ''}
                          </Text>
                          {req.proposed_location && (
                            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>📍 {req.proposed_location}</Text>
                          )}
                        </>
                      )}
                      {req.message && (
                        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontStyle: 'italic' }} numberOfLines={2}>
                          💬 "{req.message}"
                        </Text>
                      )}
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary ?? colors.textSecondary }}>{relTime(req.created_at)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: ac }}>View details</Text>
                      <Ionicons name="chevron-forward" size={13} color={ac} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {(loadingChats || negotiating.length > 0) && (
        <>
          <SectionHead title="💬 Scheduling" count={negotiating.length} ac={ac} colors={colors}
            onViewAll={() => router.push('/my-playdates' as any)} />
          {loadingChats
            ? <View style={{ alignItems: 'center', padding: 16 }}><ActivityIndicator color={ac} /></View>
            : negotiating.map(c => (
                <View key={c.id} style={{ paddingHorizontal: 16 }}>
                  <ChatCard chat={c} userId={userId} ac={ac} colors={colors}
                    playdatesChatEnabled={playdatesChatEnabled} formatTime={formatTime} />
                </View>
              ))
          }
        </>
      )}

      {agreed.length > 0 && (
        <>
          <SectionHead title="✅ Confirmed" count={agreed.length} ac={ac} colors={colors}
            onViewAll={() => router.push('/my-playdates' as any)} />
          {agreed.map(c => (
            <View key={c.id} style={{ paddingHorizontal: 16 }}>
              <ChatCard chat={c} userId={userId} ac={ac} colors={colors}
                playdatesChatEnabled={playdatesChatEnabled} formatTime={formatTime} />
            </View>
          ))}
        </>
      )}

      <TouchableOpacity
        style={{ marginHorizontal: 16, marginTop: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
        onPress={() => router.push('/my-playdates' as any)}
      >
        <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>View Full History & Declined</Text>
      </TouchableOpacity>
    </View>
  );
});
