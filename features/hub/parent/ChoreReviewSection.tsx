import { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronUp, ChevronDown, ClipboardList, Laptop, Leaf, HeartHandshake, CheckCircle2, HandCoins } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useChoreStore } from '@/store/choreStore';
import { ParentReviewDeck } from '@/features/chores/ParentReviewDeck';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// Money-green — "Save" jar accent in the coin-split preview, distinct from
// brand teal used for this card's header. Not colors.success (which IS
// brand teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

function GpSafetyReviewCard({ c, members, colors, isDark, approveGrandparentQuestAsParent, declineGrandparentQuestAsParent, active }: {
  c: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean; active: FamilyMember;
  approveGrandparentQuestAsParent: (choreId: string, parentId: string) => void;
  declineGrandparentQuestAsParent: (choreId: string, parentId: string, reason: string) => void;
}) {
  const sponsor = members.filter(m => m.role === 'senior').find(s => s.id === c.sponsorUserId);
  const linkedParent = sponsor?.linkedParentId ? members.find(m => m.id === sponsor.linkedParentId) : undefined;
  // Before approval nothing is assigned yet — targetChildIds is the only
  // record of who this was meant for. A 2+ target quest becomes a bounty
  // (full points each, independent) once approved.
  const targetKids = (c.targetChildIds?.length ? c.targetChildIds : c.assignedToId ? [c.assignedToId] : [])
    .map(id => members.find(m => m.id === id))
    .filter((m): m is FamilyMember => !!m);
  const pts = c.basePoints;

  return (
    <View style={{ borderRadius: 16, overflow: 'hidden',
      borderWidth: 1.5, borderColor: BRAND.teal + '40',
      backgroundColor: isDark ? BRAND.teal + '08' : BRAND.teal + '06' }}>
      <View style={{ backgroundColor: BRAND.teal, paddingHorizontal: 14, paddingVertical: 8,
        flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {c.questMode === 'virtual' ? <Laptop size={15} color="#fff" /> : <Leaf size={15} color="#fff" />}
        <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
          {c.questMode === 'virtual' ? 'Virtual' : 'In-Person'} Quest · {pts} pts
        </Text>
        <Text style={{ fontSize: TYPO.micro, color: '#fff', opacity: 0.8 }}>
          from {sponsor?.name.split(' ')[0] ?? 'Grandparent'}{linkedParent ? ` (${linkedParent.name.split(' ')[0]}'s parent)` : ''}
        </Text>
      </View>
      <View style={{ padding: 14, gap: 8 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
        {c.description ? (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, lineHeight: 18 }}>{c.description}</Text>
        ) : null}
        {targetKids.length > 0 ? (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
            For: {targetKids.map(k => k.name.split(' ')[0]).join(', ')}
            {targetKids.length > 1 ? ` — ${pts} pts each, independently` : ''}
          </Text>
        ) : (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>No kid picked — goes to the bounty pool</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[
            { label: 'Spend', val: Math.floor(pts * 0.5), color: BRAND.amber },
            { label: 'Save',  val: Math.floor(pts * 0.4), color: MONEY_GREEN },
            { label: 'Give',  val: pts - Math.floor(pts * 0.5) - Math.floor(pts * 0.4), color: BRAND.purple },
          ].map(j => (
            <View key={j.label} style={{ flex: 1, alignItems: 'center', borderRadius: 8,
              backgroundColor: j.color + '12', paddingVertical: 6,
              borderWidth: 1, borderColor: j.color + '20' }}>
              <Text style={{ fontSize: TYPO.micro }}>{j.label}</Text>
              <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: j.color }}>{j.val}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => declineGrandparentQuestAsParent(c.id, active.id, 'Not suitable')}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12,
              borderWidth: 1.5, borderColor: isDark ? colors.border : '#E2E8F0' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Decline</Text>
          </Pressable>
          <Pressable
            onPress={() => approveGrandparentQuestAsParent(c.id, active.id)}
            style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, backgroundColor: BRAND.teal }}>
            <CheckCircle2 size={14} color="#fff" />
            <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Approve & Publish to Kid</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function GpTurnedDownCard({ c, members, colors, isDark }: {
  c: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const sponsor = members.find(m => m.id === c.sponsorUserId);
  const kid = members.find(m => m.id === c.assignedToId);
  const otherKids = members.filter(m => m.role === 'kid' && m.id !== c.assignedToId);

  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 8,
      backgroundColor: isDark ? `${colors.danger}10` : '#FEF2F2',
      borderWidth: 1.5, borderColor: `${colors.danger}30` }}>
      <View>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
          {kid?.name.split(' ')[0] ?? 'Kid'} can't take this{sponsor ? ` · from ${sponsor.name.split(' ')[0]}` : ''}
        </Text>
      </View>
      {c.rejectionReason ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textPrimary, fontStyle: 'italic' }}>"{c.rejectionReason}"</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setExpanded(e => !e)}
          style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
            borderWidth: 1.5, borderColor: BRAND.amber + '60' }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.amber }}>Reassign</Text>
        </Pressable>
        <Pressable onPress={() => useChoreStore.getState().updateChore(c.id, {
          status: 'todo', isPool: true, assignedToId: undefined,
          targetChildIds: [], rejectionReason: undefined,
        })}
          style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: BRAND.teal }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Open to Any Kid</Text>
        </Pressable>
      </View>
      {expanded && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 }}>
          {otherKids.map(k => (
            <Pressable key={k.id} onPress={() => {
              useChoreStore.getState().updateChore(c.id, {
                status: 'todo', isPool: false, assignedToId: k.id,
                targetChildIds: [k.id], rejectionReason: undefined,
              });
            }}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                borderWidth: 1.5, borderColor: BRAND.amber + '50', backgroundColor: BRAND.amber + '10' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber }}>{k.name.split(' ')[0]}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function ChoreReviewSection({
  active, members, colors, isDark, chores, pendingReviewsCount,
  approveGrandparentQuestAsParent, declineGrandparentQuestAsParent,
}: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  chores: ChoreTask[]; pendingReviewsCount: number;
  approveGrandparentQuestAsParent: (choreId: string, parentId: string) => void;
  declineGrandparentQuestAsParent: (choreId: string, parentId: string, reason: string) => void;
}) {
  const gpPending = chores.filter(c => c.categoryType === 'grandparent_quest' && c.status === 'pending_parent_approval');
  const gpDeclined = chores.filter(c => c.categoryType === 'grandparent_quest' && c.status === 'declined');
  const badgeCount = pendingReviewsCount + gpPending.length;

  // Collapsed by default — auto-opens once there's more than one thing
  // waiting on review. A single pending item is legible from the badge
  // alone; a real backlog is worth the screen space.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (badgeCount > 1) setExpanded(true);
  }, [badgeCount > 1]);

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{
        backgroundColor: colors.card,
        borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
        overflow: 'hidden', marginBottom: 12,
      }}>
        <Pressable onPress={() => setExpanded(e => !e)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={20} color={BRAND.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Chore Reviews</Text>
              {badgeCount > 0 && (
                <View style={{ backgroundColor: BRAND.teal, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>{badgeCount}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
              {badgeCount > 0 ? `${badgeCount} pending approval` : 'All caught up'}
            </Text>
          </View>
          {expanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
        </Pressable>
        {expanded && (
          <View style={{ paddingBottom: 8 }}>
            {gpPending.length > 0 && (
              <View style={{ marginHorizontal: 14, marginBottom: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <HeartHandshake size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Grandparent Quests — Safety Review
                  </Text>
                </View>
                {gpPending.map(c => (
                  <GpSafetyReviewCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                    approveGrandparentQuestAsParent={approveGrandparentQuestAsParent}
                    declineGrandparentQuestAsParent={declineGrandparentQuestAsParent} />
                ))}
              </View>
            )}

            {/* Grandparent quest a kid turned down — GP sees this too (their own
                Hub), shown here so the parent isn't relying on chat alone to
                notice and can reassign or open it up without leaving the Hub. */}
            {gpDeclined.length > 0 && (
              <View style={{ marginHorizontal: 14, marginBottom: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <HandCoins size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Grandparent Quests — Turned Down
                  </Text>
                </View>
                {gpDeclined.map(c => (
                  <GpTurnedDownCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} />
                ))}
              </View>
            )}

            <ParentReviewDeck parent={active} members={members} colors={colors} isDark={isDark} />
          </View>
        )}
      </View>
    </View>
  );
}
