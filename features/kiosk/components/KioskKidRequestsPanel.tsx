/**
 * KioskKidRequestsPanel — a parent's inbox of what the kids are asking for,
 * shown inside the Chores page (the old Overview "Approvals" widget it
 * replaces went away with the new Home). One pastel card per pending
 * request, with the same decisions the phone and the old widget carried:
 *   · most types   — Approve / Decline, with an optional reply to the kid
 *   · check-in     — "Got it" (completes it)
 *   · quest idea   — pick a coin reward, Approve creates the real chore
 *   · grocery / supplies — Approve all adds the items to the grocery list
 * Tap the card title for the full request (items, status, parent note).
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import { useKidRequestStore, REQUEST_META, type KidRequest } from '@/store/kidRequestStore';
import { useChoreStore } from '@/store/choreStore';
import { useChatStore } from '@/store/chatStore';
import { useGroceryStore } from '@/store/groceryStore';
import type { FamilyMember } from '@/store/familyStore';
import { showToast } from '@/components/AppToast';
import { localDateStr } from '@/lib/dates';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { KioskAvatar } from './KioskAvatar';
import { Eyebrow, firstName } from './KioskHomeParts';
import { KidRequestsSheet } from './KioskKidQuickActions';
import { KioskRequestDetailDrawer, requestDisplayTitle } from './KioskKidWidgets';

/** Same "still needs a parent" rule the old Approvals widget used. */
export function pendingKidRequests(requests: KidRequest[]): KidRequest[] {
  return requests.filter(r => {
    if (!['pending', 'partial'].includes(r.status)) return false;
    if (r.status === 'partial' && (r.items?.length ?? 0) > 0 && !r.items!.some(it => it.status === 'pending')) return false;
    if (r.type === 'delegation' && (r.items?.length ?? 0) === 0 && !r.detail?.startsWith('💵')) return false;
    return true;
  });
}

const COIN_CHOICES = [5, 10, 15, 20, 25, 30];
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
const TONE_BY_TYPE: Partial<Record<string, number>> = {
  grocery: 1, supplies: 1, cheer: 1, ride: 2, tutor: 3, quest_proposal: 3, emergency: 0, medication: 0, checkin: 1,
};

export function KioskKidRequestsPanel({ active, members }: { active: FamilyMember; members: FamilyMember[] }) {
  const { k, isDark } = useKioskColors();
  const pastels = kioskPastels(k);
  const requests = useKidRequestStore(s => s.requests);
  const approveRequest = useKidRequestStore(s => s.approveRequest);
  const declineRequest = useKidRequestStore(s => s.declineRequest);
  const completeRequest = useKidRequestStore(s => s.completeRequest);
  const approveItems = useKidRequestStore(s => s.approveItems);
  const rejectAllItems = useKidRequestStore(s => s.rejectAllItems);
  const addChore = useChoreStore(s => s.addChore);
  const addGroceryItem = useGroceryStore(s => s.addItem);
  const pending = useMemo(
    () => pendingKidRequests(requests).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [requests],
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState<Record<string, number>>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const familyId = active.familyId ?? '';
  const detail = requests.find(r => r.id === detailId) ?? null;

  const tell = (toId: string, text: string) => {
    try { useChatStore.getState().sendMessage(toId, active.id, text); } catch { /* notification is best-effort */ }
  };

  const approveGeneric = (r: KidRequest) => { approveRequest(r.id, active.id, notes[r.id]?.trim() || undefined); showToast('Approved ✓'); };
  const declineGeneric = (r: KidRequest) => { declineRequest(r.id, active.id, notes[r.id]?.trim() || undefined); showToast('Declined'); };
  const gotIt = (r: KidRequest) => { completeRequest(r.id, active.id, notes[r.id]?.trim() || undefined); showToast('Got it ✓'); };
  const approveIdea = (r: KidRequest) => {
    const finalCoins = coins[r.id] ?? r.rewardCoins ?? 10;
    addChore({
      title: r.detail, categoryType: 'routine', category: 'Other', basePoints: 0, coinsReward: finalCoins, xpReward: 10,
      status: 'todo', isPool: true, requiresPhotoProof: false, recurrenceRule: { frequency: 'once' },
      familyId, createdById: active.id, dueDate: localDateStr(),
    } as any);
    approveRequest(r.id, active.id, `Approved as a ${finalCoins}-coin chore!`);
    tell(r.fromMemberId, `✅ Your chore idea "${r.detail}" was approved for ${finalCoins} coins — go ahead!`);
    showToast(`Added as a ${finalCoins}-coin bounty ✓`);
  };
  const declineIdea = (r: KidRequest) => {
    const reason = notes[r.id]?.trim();
    declineRequest(r.id, active.id, reason || undefined);
    tell(r.fromMemberId, `Your chore idea "${r.detail}" wasn't approved this time${reason ? ` — "${reason}"` : ''}.`);
    showToast('Declined');
  };
  const approveList = async (r: KidRequest) => {
    const open = (r.items ?? []).filter(it => it.status === 'pending');
    approveItems(r.id, open.map(it => it.id), active.id);
    for (const it of open) {
      await addGroceryItem({
        familyId, name: it.name, quantity: it.qty || undefined,
        category: r.type === 'supplies' ? 'Supplies' : (it.category ?? 'Other'),
        storePreference: it.store, addedBy: r.fromMemberId,
      } as any);
    }
    showToast('Added to the grocery list ✓');
  };
  const declineList = (r: KidRequest) => {
    rejectAllItems(r.id, active.id, notes[r.id]?.trim() || undefined);
    showToast('Declined');
  };

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Eyebrow label="KID REQUESTS" accent={k.primary} k={k} right={`${pending.length} waiting`} />
        <Pressable onPress={() => setHistory(true)} accessibilityRole="button" style={[s.histBtn, { backgroundColor: k.well }]}>
          <Text style={[s.histText, { color: k.textMuted }]}>Request history</Text>
        </Pressable>
      </View>

      {pending.length === 0 ? (
        <View style={[s.empty, { backgroundColor: k.pastelSage }]}>
          <Text style={[s.emptyTitle, { color: k.sage }]}>All caught up ✓</Text>
          <Text style={[s.sub, { color: k.textMuted }]}>When a kid asks for something it shows up here.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.grid}>
          {pending.map(r => {
            const meta = REQUEST_META[r.type];
            const kid = members.find(m => m.id === r.fromMemberId);
            const tone = pastels[TONE_BY_TYPE[r.type] ?? 1];
            const isList = (r.type === 'grocery' || r.type === 'supplies') && (r.items?.length ?? 0) > 0;
            const isIdea = r.type === 'quest_proposal';
            const isCheckin = r.type === 'checkin';
            const picked = coins[r.id] ?? r.rewardCoins ?? 10;
            const urgent = r.urgency === 'urgent' || r.urgency === 'emergency';
            return (
              <View key={r.id} style={[s.card, { backgroundColor: tone.col, borderColor: tone.card }]}>
                <View style={s.cardTop}>
                  <View style={[s.emoji, { backgroundColor: tone.card }]}><Text style={{ fontSize: 24 }}>{meta?.emoji ?? '📨'}</Text></View>
                  <Pressable onPress={() => setDetailId(r.id)} style={{ flex: 1, minWidth: 0 }} accessibilityRole="button" accessibilityLabel={`Open request: ${requestDisplayTitle(r, meta?.label)}`}>
                    <Text style={[s.title, { color: k.text }]} numberOfLines={2}>{requestDisplayTitle(r, meta?.label)}</Text>
                    <Text style={[s.sub, { color: k.textMuted }]} numberOfLines={1}>{meta?.label} · {stamp(r.requestedAt)}</Text>
                  </Pressable>
                  <View style={s.who}>
                    <KioskAvatar name={kid?.name ?? '?'} emoji={kid?.emoji} avatarUrl={kid?.avatarUrl} size={34} bgColor={k.card} k={k} />
                    <Text style={[s.whoName, { color: tone.fg }]} numberOfLines={1}>{firstName(kid)}</Text>
                  </View>
                </View>
                {urgent && <View style={[s.urgent, { backgroundColor: k.pastelPrimaryCard }]}><Text style={[s.urgentText, { color: k.danger }]}>{r.urgency === 'emergency' ? '🚨 Emergency' : 'Urgent'}</Text></View>}
                {!!r.detail && !isList && <Text style={[s.detail, { color: k.text }]} numberOfLines={3}>{r.detail}</Text>}
                {isList && <Text style={[s.detail, { color: k.text }]} numberOfLines={2}>{r.items!.map(it => it.name).join(', ')}</Text>}
                {!!r.scheduledDate && <Text style={[s.sub, { color: k.textMuted }]}>📅 {r.scheduledDate}{r.scheduledTime ? ` · ${r.scheduledTime}` : ''}</Text>}

                {isIdea && (
                  <View style={s.coinRow}>
                    {COIN_CHOICES.map(c => (
                      <Pressable key={c} onPress={() => setCoins(p => ({ ...p, [r.id]: c }))} accessibilityRole="button" accessibilityState={{ selected: picked === c }}
                        style={[s.coin, { backgroundColor: picked === c ? tone.fg : tone.card }]}>
                        <Text style={[s.coinText, { color: picked === c ? k.onAccent : tone.fg }]}>🪙 {c}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {!isCheckin && (
                  <TextInput
                    value={notes[r.id] ?? ''} onChangeText={t => setNotes(p => ({ ...p, [r.id]: t }))}
                    placeholder="Reply to them (optional)" placeholderTextColor={k.textFaint}
                    style={[s.input, { color: k.text, backgroundColor: k.card, borderColor: tone.card }]} maxLength={140}
                  />
                )}

                <View style={s.actions}>
                  {isCheckin ? (
                    <Btn label="Got it" bg={k.primary} fg={k.onPrimary} onPress={() => gotIt(r)} flex />
                  ) : (
                    <>
                      <Btn label="Decline" bg={k.card} fg={k.text} onPress={() => (isIdea ? declineIdea(r) : isList ? declineList(r) : declineGeneric(r))} flex />
                      <Btn
                        label={isIdea ? `Approve · ${picked} coins` : isList ? 'Approve all' : 'Approve'}
                        bg={k.primary} fg={k.onPrimary}
                        onPress={() => (isIdea ? approveIdea(r) : isList ? approveList(r) : approveGeneric(r))} flex
                      />
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <KioskRequestDetailDrawer request={detail} members={members} k={k} isDark={isDark} onClose={() => setDetailId(null)} />
      {history && <KidRequestsSheet active={active} members={members} k={k} isDark={isDark} scope="family" onClose={() => setHistory(false)} />}
    </View>
  );
}

function Btn({ label, bg, fg, onPress, flex }: { label: string; bg: string; fg: string; onPress: () => void; flex?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [s.btn, { backgroundColor: bg }, flex && { flex: 1 }, pressed && { opacity: 0.75 }]}>
      <Text style={[s.btnText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: KIOSK_SPACE.sm, minHeight: 0 },
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  histBtn: { minHeight: 40, borderRadius: 100, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  histText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, paddingBottom: KIOSK_SPACE.xl },
  card: { width: '48.8%', borderRadius: KIOSK_RADIUS.xl, borderWidth: 1.5, padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  emoji: { width: 46, height: 46, borderRadius: KIOSK_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  sub: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  who: { alignItems: 'center', gap: 2, minWidth: 54 },
  whoName: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', maxWidth: 62 },
  detail: { fontSize: KIOSK_TYPO.body, fontWeight: '600' },
  urgent: { alignSelf: 'flex-start', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 4 },
  urgentText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  coinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  coin: { minHeight: 40, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  coinText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  input: { minHeight: 44, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5, paddingHorizontal: 12, fontSize: KIOSK_TYPO.caption },
  actions: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  btn: { minHeight: 48, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  empty: { borderRadius: KIOSK_RADIUS.xl, padding: KIOSK_SPACE.xl, gap: 4 },
  emptyTitle: { fontSize: KIOSK_TYPO.heading, fontWeight: '800' },
});
