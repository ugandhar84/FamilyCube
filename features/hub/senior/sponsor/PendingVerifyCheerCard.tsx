import { useState } from 'react';
import { View, Text, Pressable, Image, Alert, Modal, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Hammer, CheckCircle2, UserX, Clock, Users, HandCoins, RotateCcw, X } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import { fmtDateTime } from '@/lib/dates';
import { GP } from '../seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// Sticker-picker feature — intentional literal emoji options, not chrome.
// Do not touch.
const CHEER_STICKERS = ['⭐', '🏆', '🎉', '💪', '🌟', '❤️'];

// Green — "verified" status accent, distinct from brand teal used
// elsewhere in this card. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const VERIFIED_GREEN = '#22c55e';

function rowMeta(status: string, colors: any) {
  switch (status) {
    case 'pending_grandparent_approval': return { label: 'Ready to review', color: BRAND.teal, Icon: Camera };
    case 'in_progress':                  return { label: 'Working on it',    color: BRAND.amber, Icon: Hammer };
    case 'approved': case 'auto_approved': case 'completed':
                                          return { label: 'Verified',         color: VERIFIED_GREEN, Icon: CheckCircle2 };
    case 'declined':                     return { label: 'Declined',         color: colors.danger, Icon: UserX };
    default:                             return { label: 'Not started',      color: colors.textTertiary, Icon: Clock };
  }
}

// Pending grandparent verification — child submitted photo proof, GP picks
// a cheer sticker and either approves per-kid (team quests) or approves the
// whole card (single-kid quests).
export function PendingVerifyCheerCard({
  pendingGpApproval, allChores, kids, allNames, colors, isDark,
  cheerSticker, setCheerSticker,
  onApproveAndCheer, onRequestRedo, members,
}: {
  pendingGpApproval: ChoreTask[]; allChores: ChoreTask[];
  kids: FamilyMember[]; allNames: string[]; colors: any; isDark: boolean;
  cheerSticker: string; setCheerSticker: (s: string) => void;
  onApproveAndCheer: (choreId: string) => void;
  onRequestRedo: (choreId: string, reason: string) => void;
  members?: FamilyMember[];
}) {
  if (pendingGpApproval.length === 0) return null;

  const insets = useSafeAreaInsets();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const promptRedo = (choreId: string, title: string, kidName: string) => Alert.prompt(
    'Ask for a redo?',
    `Let ${kidName} know why "${title}" needs another try.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Request Redo', style: 'destructive', onPress: (reason?: string) => onRequestRedo(choreId, reason?.trim() || 'Needs another try') },
    ],
    'plain-text',
  );

  // A team quest clones one chore per kid — reviewing them as N separate
  // full cards repeats the same title/points/sticker chrome N times. Render
  // each team once: one header, one roster with each kid's own
  // status/photo/timestamp, one shared payout preview.
  const seenTeams = new Set<string>();
  const cards = pendingGpApproval.filter(c => {
    if (!c.teamGroupId) return true;
    if (seenTeams.has(c.teamGroupId)) return false;
    seenTeams.add(c.teamGroupId);
    return true;
  });

  return (
    <View style={{ gap: 10, marginBottom: 12 }}>
      {/* "Verify & Cheer 🎉" — the trailing emoji is expressive celebration
          tone, not chrome — kept. */}
      <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textTertiary,
        textTransform: 'uppercase', letterSpacing: 0.8 }}>Verify & Cheer 🎉</Text>
      {/* Sticker picker */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {CHEER_STICKERS.map(s => (
          <Pressable key={s} onPress={() => setCheerSticker(s)}
            style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: cheerSticker === s ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
              backgroundColor: cheerSticker === s ? BRAND.teal + '20' : 'transparent' }}>
            <Text style={{ fontSize: 18 }}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {cards.map(chore => {
        const team = chore.teamGroupId
          ? allChores.filter(c => c.teamGroupId === chore.teamGroupId)
          : [chore];
        const pts = chore.basePoints;
        const readyCount = team.filter(c => c.status === 'pending_grandparent_approval').length;
        const verifiedCount = team.filter(c => ['approved', 'auto_approved', 'completed'].includes(c.status)).length;
        return (
          <View key={chore.teamGroupId ?? chore.id} style={{
            borderRadius: 16, borderWidth: 1.5, borderColor: BRAND.teal + '40',
            backgroundColor: isDark ? BRAND.teal + '10' : BRAND.teal + '06',
            overflow: 'hidden',
          }}>
            <View style={{ backgroundColor: BRAND.teal, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Camera size={16} color="#fff" />
              <Text style={{ flex: 1, fontSize: GP.sub, fontWeight: '900', color: '#fff' }}>
                {chore.title}
              </Text>
              {chore.teamGroupId && (
                <View style={{ backgroundColor: '#ffffff30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Users size={11} color="#fff" />
                  <Text style={{ fontSize: GP.tiny, fontWeight: '900', color: '#fff' }}>
                    {verifiedCount}/{team.length} verified
                  </Text>
                </View>
              )}
            </View>
            <View style={{ padding: 14, gap: 10 }}>
              {/* Roster — one row per kid, own status/photo/note/timestamp */}
              <View style={{ gap: 8 }}>
                {team.map(member => {
                  const kid = kids.find(k => k.id === member.assignedToId);
                  const meta = rowMeta(member.status, colors);
                  const when = member.submittedAt ?? member.approvedAt;
                  const reviewer = member.reviewedById ? (members ?? kids).find(m => m.id === member.reviewedById) : undefined;
                  return (
                    <View key={member.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 8, borderRadius: 12,
                      backgroundColor: isDark ? colors.surface : '#fff',
                      borderWidth: 1, borderColor: meta.color + '30' }}>
                      {member.submissionPhotoUrl ? (
                        <Pressable onPress={() => setLightboxUri(member.submissionPhotoUrl!)}>
                          <Image source={{ uri: member.submissionPhotoUrl }}
                            style={{ width: 44, height: 44, borderRadius: 10 }} resizeMode="cover" />
                        </Pressable>
                      ) : (
                        <FamilyAvatar name={kid?.name ?? '?'} emoji={kid?.emoji} avatarUrl={kid?.avatarUrl} siblings={allNames} size={38} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: GP.body, fontWeight: '800', color: colors.textPrimary }}>
                          {kid?.name.split(' ')[0] ?? 'Grandchild'}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <meta.Icon size={11} color={meta.color} />
                          <Text style={{ fontSize: GP.tiny, fontWeight: '700', color: meta.color }}>
                            {meta.label}{when ? ` · ${fmtDateTime(when)}` : ''}{reviewer ? ` by ${reviewer.name.split(' ')[0]}` : ''}
                          </Text>
                        </View>
                        {member.submissionNote ? (
                          <Text style={{ fontSize: GP.tiny, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 }} numberOfLines={2}>
                            "{member.submissionNote}"
                          </Text>
                        ) : null}
                      </View>
                      {/* Team quests approve per-kid inline (payout waits for the group);
                          a single-kid quest uses the one big button below instead. */}
                      {member.status === 'pending_grandparent_approval' && chore.teamGroupId && (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <Pressable onPress={() => promptRedo(member.id, chore.title, kid?.name.split(' ')[0] ?? 'them')}
                            style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
                              borderWidth: 1.5, borderColor: colors.danger + '60' }}>
                            <RotateCcw size={13} color={colors.danger} />
                          </Pressable>
                          <Pressable onPress={() => onApproveAndCheer(member.id)}
                            style={{ backgroundColor: BRAND.teal, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
                            <Text style={{ fontSize: GP.tiny, fontWeight: '900', color: '#fff' }}>{cheerSticker} Approve</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Full reward each — not a shared pool. One kid declining
                  never reduces what the others earn. */}
              {chore.teamGroupId && (
                <Text style={{ fontSize: GP.tiny, fontWeight: '700', color: colors.textTertiary, textAlign: 'center' }}>
                  {pts} pts to EACH kid who finishes — independently
                </Text>
              )}
              {/* Grandparent Bonus jar preview — GP-funded coins are a
                  single, deliberately unsplit pool (product decision), not
                  run through the household's Spend/Save/Give split. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                borderRadius: 10, borderWidth: 1, borderColor: BRAND.purple + '30',
                backgroundColor: BRAND.purple + '10', paddingVertical: 8 }}>
                <HandCoins size={12} color={BRAND.purple} />
                <Text style={{ fontSize: GP.sub, color: BRAND.purple }}>Grandparent Bonus jar</Text>
                <Text style={{ fontSize: GP.body, fontWeight: '900', color: BRAND.purple }}>{pts}</Text>
              </View>

              {chore.teamGroupId ? (
                readyCount > 0 && (
                  <Text style={{ fontSize: GP.tiny, color: colors.textTertiary, textAlign: 'center' }}>
                    Approve each kid above — pays them right away
                  </Text>
                )
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => promptRedo(chore.id, chore.title, kids.find(k => k.id === chore.assignedToId)?.name.split(' ')[0] ?? 'them')}
                    style={{ paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
                      borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger + '60' }}>
                    <RotateCcw size={16} color={colors.danger} />
                  </Pressable>
                  <Pressable onPress={() => onApproveAndCheer(chore.id)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      backgroundColor: BRAND.teal, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 6 }}>
                    <Text style={{ fontSize: 18 }}>{cheerSticker}</Text>
                    <Text style={{ fontSize: GP.sub, fontWeight: '900', color: '#fff', flexShrink: 1 }}
                      numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      APPROVE & CHEER · {pts} pts
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        );
      })}

      {/* Full-screen photo lightbox — the thumbnail is the only way a GP
          can inspect proof before deciding approve vs. redo, so it needs
          to actually enlarge, not just sit there at 44x44. */}
      <Modal visible={!!lightboxUri} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <Pressable style={{ flex: 1, backgroundColor: '#000' }} onPress={() => setLightboxUri(null)}>
          <View style={{ position: 'absolute', top: insets.top + 8, right: 16, zIndex: 10 }}>
            <Pressable onPress={() => setLightboxUri(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color="#fff" />
            </Pressable>
          </View>
          {lightboxUri && (
            <Image source={{ uri: lightboxUri }}
              style={{ flex: 1, width: Dimensions.get('window').width }}
              resizeMode="contain" />
          )}
        </Pressable>
      </Modal>
    </View>
  );
}
