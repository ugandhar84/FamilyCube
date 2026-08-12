/**
 * HelpQueueSection — Family Support & Help Queue
 *
 * Real-world assignment flow:
 *
 *   PENDING (kid request)
 *     ⚡ Self-Assign — takes it immediately
 *     👤 Ask someone — Ride: adults only | others: ALL members (older kids can tutor, run errands, etc.)
 *     ❌ Reject — invalid/wrong info/silly; kid sees reason, no resubmit
 *
 *   PENDING (adult/senior request)
 *     ⚡ Self-Assign — takes it immediately
 *     👤 Ask someone — all members including kids (e.g. teen helps Grandma with iPad)
 *     (no reject — adult requests are always valid)
 *
 *   AWAITING_ACCEPTANCE — person who was asked:
 *     ✅ Accept → assigned
 *     ❌ Can't do it — must write reason → back to pending pool
 *
 *   AWAITING_ACCEPTANCE — everyone else:
 *     Observer card; can re-offer to someone else
 *
 *   ASSIGNED — confirmed helper:
 *     ✓ Mark Done
 *
 *   Cards collapse to a summary row; expand on tap.
 *   Cards requiring YOUR action start expanded; observer/info cards start collapsed.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, LayoutAnimation, Platform, UIManager, ScrollView, StyleSheet, KeyboardAvoidingView, Keyboard } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useHelpStore, HelpRequest } from '@/store/helpStore';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member { id: string; name: string; role: string; emoji?: string; avatarUrl?: string; }

// ─── Shared helpers ───────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  Ride: BRAND.teal, Homework: BRAND.purple, Childcare: BRAND.pink,
  Errand: BRAND.amber, Chore: '#10B981', Advice: '#3B82F6', General: '#64748B',
};

function CatBadge({ cat }: { cat: string }) {
  const c = CAT_COLOR[cat] ?? '#64748B';
  return (
    <View style={{ backgroundColor: c + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: c + '45' }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: c }}>{cat}</Text>
    </View>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const color = urgency === 'High' ? '#EF4444' : urgency === 'Medium' ? BRAND.amber : '#94A3B8';
  const label = urgency === 'High' ? '🔴 Urgent' : urgency === 'Medium' ? '🟡 Med' : '🟢 Low';
  return (
    <View style={{ backgroundColor: color + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color }}>{label}</Text>
    </View>
  );
}

/** Badges stacked vertically for the top-right corner of card summaries */
function BadgeStack({ cat, urgency }: { cat: string; urgency?: string }) {
  return (
    <View style={{ alignItems: 'flex-end', gap: 3 }}>
      <CatBadge cat={cat} />
      {urgency && <UrgencyBadge urgency={urgency} />}
    </View>
  );
}

function Btn({ label, color, onPress, outline, disabled, small }: {
  label: string; color: string; onPress: () => void; outline?: boolean; disabled?: boolean; small?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={{
        flex: 1, paddingVertical: small ? 8 : 10, borderRadius: 12, alignItems: 'center',
        backgroundColor: outline ? 'transparent' : disabled ? color + '50' : color,
        borderWidth: outline ? 1 : 0, borderColor: outline ? color + '70' : undefined,
        opacity: disabled ? 0.55 : 1,
      }}>
      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: outline ? color : '#fff' }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Which members can be offered this request?
 *   Ride → adults only (kids can't drive)
 *   Everything else → all members (older kids can tutor, help seniors with tech, run errands, etc.)
 */
function getOfferCandidates(req: HelpRequest, allMembers: Member[], excludeId: string): Member[] {
  const pool = req.category === 'Ride'
    ? allMembers.filter(m => m.role !== 'kid')
    : allMembers;
  return pool.filter(m => m.id !== excludeId);
}

// ─── Collapsible card shell ───────────────────────────────────────────────────

function CollapsibleCard({
  accent, defaultExpanded = false, summary, children, colors, isDark,
}: {
  accent: string;
  defaultExpanded?: boolean;
  summary: React.ReactNode;
  children: React.ReactNode;
  colors: any; isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(v => !v);
  }

  const bg = isDark ? accent + '18' : accent + '0D';
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: accent + '40', backgroundColor: bg, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent }} />

      {/* Summary row — always visible, tap to toggle */}
      <Pressable onPress={toggle} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 14, paddingLeft: 17 }}>
        <View style={{ flex: 1 }}>{summary}</View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={accent} style={{ marginTop: 3 }} />
      </Pressable>

      {/* Expanded body */}
      {expanded && (
        <View style={{ paddingHorizontal: 17, paddingBottom: 14, gap: 10 }}>
          {children}
        </View>
      )}
    </View>
  );
}

// ─── Bottom sheet wrapper with keyboard handling + close X ────────────────────

const ROLE_RING: Record<string, string> = {
  parent: BRAND.teal, senior: BRAND.amber, kid: BRAND.purple,
};

function BottomSheet({ visible, title, onClose, colors, isDark, children }: {
  visible: boolean; title: string; onClose: () => void;
  colors: any; isDark: boolean; children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const dismiss = () => { Keyboard.dismiss(); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      {/* Backdrop — tap to dismiss */}
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />

      {/* KAV owns full height — sheet stays pinned above keyboard as a unit */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
        pointerEvents={visible ? 'auto' : 'none'}>

        <View style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 8) + 8,
          maxHeight: '92%',
          shadowColor: '#000', shadowOpacity: 0.1,
          shadowOffset: { width: 0, height: -3 }, shadowRadius: 10,
          elevation: 20,
        }}>
          {/* Drag handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          {/* Header row — title + close X */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingVertical: 10,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
            marginBottom: 4,
          }}>
            <Text style={{ flex: 1, fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary }}>{title}</Text>
            <Pressable onPress={dismiss}
              style={{
                width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isDark ? colors.surface : colors.background,
              }}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Content — only mounted when visible (Petkoinia pattern) */}
          {visible && (
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingTop: 16, paddingBottom: 4, gap: 20 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── FAB-style action button ──────────────────────────────────────────────────

function FABBtn({ label, color, onPress, outline, disabled }: {
  label: string; color: string; onPress: () => void; outline?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({
        flex: 1, paddingVertical: 14, borderRadius: 18, alignItems: 'center',
        backgroundColor: outline ? 'transparent' : disabled ? color + '50' : color,
        borderWidth: outline ? 1.5 : 0, borderColor: outline ? color + '80' : undefined,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        shadowColor: outline || disabled ? 'transparent' : color,
        shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        elevation: outline || disabled ? 0 : 4,
      })}>
      <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: outline ? color : '#fff' }}>{label}</Text>
    </Pressable>
  );
}

// ─── Offer modal — avatar grid, multi-select, note ───────────────────────────

function OfferModal({ visible, candidates, allNames, onOffer, onClose, colors, isDark }: {
  visible: boolean;
  candidates: Member[];
  allNames: string[];
  onOffer: (toIds: string[], toNames: string[], note: string) => void;
  onClose: () => void;
  colors: any; isDark: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState('');

  function toggle(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function submit() {
    const selected = candidates.filter(c => selectedIds.includes(c.id));
    if (!selected.length) return;
    onOffer(selected.map(c => c.id), selected.map(c => c.name), note.trim());
    setSelectedIds([]); setNote('');
  }

  function handleClose() { onClose(); setSelectedIds([]); setNote(''); }

  const selectedCount = selectedIds.length;
  const rows: Member[][] = [];
  for (let i = 0; i < candidates.length; i += 3) rows.push(candidates.slice(i, i + 3));

  return (
    <BottomSheet
      visible={visible}
      title={selectedCount > 0 ? `${selectedCount} selected` : 'Ask for help'}
      onClose={handleClose} colors={colors} isDark={isDark}>

      {/* Avatar grid — multi-select */}
      <View style={{ gap: 16 }}>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: 12 }}>
            {row.map(m => {
              const sel      = selectedIds.includes(m.id);
              const ring     = ROLE_RING[m.role] ?? BRAND.purple;
              return (
                <Pressable key={m.id} onPress={() => toggle(m.id)}
                  style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                  <View style={{ position: 'relative' }}>
                    <FamilyAvatar
                      name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl}
                      siblings={allNames} size={68}
                      ringColor={sel ? BRAND.purple : ring}
                      ringWidth={sel ? 3.5 : 2}
                      bgColor={sel ? BRAND.purple + '20' : undefined}
                    />
                    {sel && (
                      <View style={{
                        position: 'absolute', bottom: -3, right: -3,
                        backgroundColor: BRAND.purple, borderRadius: 11,
                        width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
                        borderWidth: 2.5, borderColor: colors.surface,
                      }}>
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text style={{
                    fontSize: TYPO.body, fontWeight: sel ? '800' : '600',
                    color: sel ? BRAND.purple : colors.textPrimary, textAlign: 'center',
                  }} numberOfLines={1}>{m.name.split(' ')[0]}</Text>
                  <Text style={{ fontSize: TYPO.body, color: colors.textTertiary, textTransform: 'capitalize', textAlign: 'center' }}>
                    {m.role}
                  </Text>
                </Pressable>
              );
            })}
            {row.length < 3 && Array(3 - row.length).fill(null).map((_, i) => (
              <View key={`e${i}`} style={{ flex: 1 }} />
            ))}
          </View>
        ))}
      </View>

      {/* Note — always visible, optional */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>
          Note <Text style={{ fontWeight: '400', color: colors.textTertiary }}>(optional — they'll see this)</Text>
        </Text>
        <TextInput
          value={note} onChangeText={setNote}
          placeholder="e.g. Can you take her after gym? I have a work call until 3."
          placeholderTextColor={colors.textTertiary}
          multiline numberOfLines={3}
          style={{
            fontSize: TYPO.body, color: colors.textPrimary, borderRadius: 14,
            borderWidth: 1.5, borderColor: note.length > 0 ? BRAND.purple + '90' : colors.border,
            backgroundColor: isDark ? '#13102a' : '#F6F4FF',
            paddingHorizontal: 14, paddingVertical: 12, minHeight: 76,
            textAlignVertical: 'top',
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <FABBtn label="Cancel" color={colors.textSecondary} outline onPress={handleClose} />
        <FABBtn
          label={selectedCount > 1 ? `Send to ${selectedCount}` : 'Send'}
          color={BRAND.purple} onPress={submit} disabled={selectedCount === 0}
        />
      </View>
    </BottomSheet>
  );
}

// ─── Decline-offer sheet ──────────────────────────────────────────────────────

function DeclineOfferModal({ visible, onDecline, onClose, colors, isDark }: {
  visible: boolean; onDecline: (c: string) => void; onClose: () => void; colors: any; isDark: boolean;
}) {
  const [comment, setComment] = useState('');
  function handleClose() { onClose(); setComment(''); }
  return (
    <BottomSheet visible={visible} title="Can't help right now" onClose={handleClose} colors={colors} isDark={isDark}>
      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: -8 }}>
        Let the family know why — this goes back to the queue for someone else to pick up.
      </Text>
      <TextInput
        value={comment} onChangeText={setComment}
        placeholder="e.g. I have a meeting until 5 PM and can't make it today."
        placeholderTextColor={colors.textTertiary}
        multiline numberOfLines={3}
        style={{
          fontSize: TYPO.body, color: colors.textPrimary, borderRadius: 14,
          borderWidth: 1.5, borderColor: comment.length > 0 ? '#EF444490' : colors.border,
          backgroundColor: isDark ? '#1a0a0a' : '#FFF5F5',
          paddingHorizontal: 14, paddingVertical: 12, minHeight: 76, textAlignVertical: 'top',
        }}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <FABBtn label="Cancel" color={colors.textSecondary} outline onPress={handleClose} />
        <FABBtn label="Confirm" color="#EF4444"
          onPress={() => { if (comment.trim()) { onDecline(comment.trim()); setComment(''); } }}
          disabled={!comment.trim()} />
      </View>
    </BottomSheet>
  );
}

// ─── Reject sheet (parent → kid's invalid request) ───────────────────────────

function RejectModal({ visible, onReject, onClose, colors, isDark }: {
  visible: boolean; onReject: (r: string) => void; onClose: () => void; colors: any; isDark: boolean;
}) {
  const [reason, setReason] = useState('');
  function handleClose() { onClose(); setReason(''); }
  return (
    <BottomSheet visible={visible} title="Reject this request" onClose={handleClose} colors={colors} isDark={isDark}>
      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: -8 }}>
        Use this when the request is invalid, has wrong info, or is not appropriate. The child will see your reason.
      </Text>
      <TextInput
        value={reason} onChangeText={setReason}
        placeholder="e.g. This is not the right day — check your schedule again."
        placeholderTextColor={colors.textTertiary}
        multiline numberOfLines={3}
        style={{
          fontSize: TYPO.body, color: colors.textPrimary, borderRadius: 14,
          borderWidth: 1.5, borderColor: reason.length > 0 ? '#EF444490' : colors.border,
          backgroundColor: isDark ? '#1a0a0a' : '#FFF5F5',
          paddingHorizontal: 14, paddingVertical: 12, minHeight: 76, textAlignVertical: 'top',
        }}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <FABBtn label="Cancel" color={colors.textSecondary} outline onPress={handleClose} />
        <FABBtn label="Reject Request" color="#EF4444"
          onPress={() => { if (reason.trim()) { onReject(reason.trim()); setReason(''); } }}
          disabled={!reason.trim()} />
      </View>
    </BottomSheet>
  );
}

// ─── PENDING card (adult/senior viewer) ──────────────────────────────────────

function PendingCard({ req, active, allMembers, colors, isDark }: {
  req: HelpRequest; active: Member; allMembers: Member[]; colors: any; isDark: boolean;
}) {
  const { selfAssign, offerToMembers, rejectRequest } = useHelpStore();
  const [offerModal, setOfferModal]   = useState(false);
  const [rejectModal, setRejectModal] = useState(false);

  const isKidRequest = req.requesterRole === 'kid';
  const accent       = req.urgency === 'High' ? '#EF4444' : BRAND.amber;
  const candidates   = getOfferCandidates(req, allMembers, active.id);
  const allNames     = allMembers.map(m => m.name);

  return (
    <CollapsibleCard accent={accent} defaultExpanded colors={colors} isDark={isDark}
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
              {req.requesterName.split(' ')[0]}: {req.title}
            </Text>
          </View>
          <BadgeStack cat={req.category} urgency={req.urgency} />
        </View>
      }>

      {/* Description */}
      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 }}>
        "{req.description}"
      </Text>

      {/* Scheduling info */}
      {(req.date || req.fromLoc) && (
        <Text style={{ fontSize: TYPO.body, color: colors.textTertiary }}>
          {req.date ? `📅 ${req.date}` : ''}{req.time ? ` · ${req.time}` : ''}
          {req.fromLoc ? `\n📍 ${req.fromLoc}` : ''}{req.toLoc ? ` → ${req.toLoc}` : ''}
        </Text>
      )}

      {/* Previous decline note */}
      {req.lastDeclineComment && (
        <View style={{ backgroundColor: '#EF444412', borderRadius: 10, padding: 8, flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 13 }}>⚠️</Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, flex: 1, fontStyle: 'italic' }}>
            {req.lastDeclinedByName?.split(' ')[0]} said: "{req.lastDeclineComment}"
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={{ gap: 8 }}>
        <Btn label={`⚡ I'll do it  (${active.name.split(' ')[0]})`} color="#10B981"
          onPress={() => selfAssign(req.id, active.id, active.name)} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {candidates.length > 0 && (
            <Btn label="👤 Ask someone..." color={BRAND.purple} onPress={() => setOfferModal(true)} />
          )}
          {isKidRequest && (
            <Btn label="❌ Reject" color="#EF4444" outline onPress={() => setRejectModal(true)} />
          )}
        </View>
      </View>

      <OfferModal
        visible={offerModal} candidates={candidates} allNames={allNames}
        onOffer={(toIds, toNames, note) => { offerToMembers(req.id, toIds, toNames, active.name, note, active.id); setOfferModal(false); }}
        onClose={() => setOfferModal(false)} colors={colors} isDark={isDark}
      />
      <RejectModal
        visible={rejectModal}
        onReject={(reason) => { rejectRequest(req.id, active.name, reason); setRejectModal(false); }}
        onClose={() => setRejectModal(false)} colors={colors} isDark={isDark}
      />
    </CollapsibleCard>
  );
}

// ─── AWAITING_ACCEPTANCE card ─────────────────────────────────────────────────

function AwaitingCard({ req, active, allMembers, colors, isDark }: {
  req: HelpRequest; active: Member; allMembers: Member[]; colors: any; isDark: boolean;
}) {
  const { acceptOffer, declineOffer, offerToMembers, selfAssign } = useHelpStore();
  const [declineModal, setDeclineModal] = useState(false);
  const [reofferModal, setReofferModal] = useState(false);

  const isOfferedToMe   = (req.offeredToIds ?? []).includes(active.id);
  const offeredNames    = (req.offeredToIds ?? [])
    .map(id => allMembers.find(m => m.id === id)?.name.split(' ')[0] ?? id)
    .join(', ');
  const candidates      = getOfferCandidates(req, allMembers, active.id)
    .filter(c => !(req.offeredToIds ?? []).includes(c.id));
  const allNames        = allMembers.map(m => m.name);

  if (isOfferedToMe) {
    return (
      <CollapsibleCard accent={BRAND.teal} defaultExpanded colors={colors} isDark={isDark}
        summary={
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.teal, }}>
                🙋 {req.offeredByName?.split(' ')[0]} is asking for your help!
              </Text>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                {req.requesterName.split(' ')[0]}: {req.title}
              </Text>
            </View>
            <BadgeStack cat={req.category} />
          </View>
        }>

        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 }}>
          "{req.description}"
        </Text>

        {(req.date || req.fromLoc) && (
          <Text style={{ fontSize: TYPO.body, color: colors.textTertiary }}>
            {req.date ? `📅 ${req.date}` : ''}{req.time ? ` · ${req.time}` : ''}
            {req.fromLoc ? `\n📍 ${req.fromLoc}` : ''}{req.toLoc ? ` → ${req.toLoc}` : ''}
          </Text>
        )}

        {req.offerNote && (
          <View style={{ backgroundColor: BRAND.teal + '15', borderRadius: 10, padding: 10, gap: 3 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: BRAND.teal }}>
              NOTE FROM {req.offeredByName?.split(' ')[0].toUpperCase()}
            </Text>
            <Text style={{ fontSize: TYPO.body, color: colors.textPrimary, fontStyle: 'italic' }}>"{req.offerNote}"</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn label="✅ Yes, I'll do it" color={BRAND.teal} onPress={() => acceptOffer(req.id, active.id, active.name)} />
          <Btn label="❌ Can't do it" color="#EF4444" outline onPress={() => setDeclineModal(true)} />
        </View>

        <DeclineOfferModal
          visible={declineModal}
          onDecline={(comment) => { declineOffer(req.id, active.id, active.name, comment); setDeclineModal(false); }}
          onClose={() => setDeclineModal(false)} colors={colors} isDark={isDark}
        />
      </CollapsibleCard>
    );
  }

  // Observer view — start collapsed
  return (
    <CollapsibleCard accent={BRAND.purple} defaultExpanded colors={colors} isDark={isDark}
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple, }}>
              ⏳ Waiting for {offeredNames}
            </Text>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
              {req.requesterName.split(' ')[0]}: {req.title}
            </Text>
          </View>
          <BadgeStack cat={req.category} />
        </View>
      }>

      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic' }}>
        "{req.description}"
      </Text>
      <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>
        Requested by {req.requesterName.split(' ')[0]} · Offered by {req.offeredByName?.split(' ')[0]}
      </Text>

      {req.offerNote && (
        <View style={{ backgroundColor: BRAND.purple + '12', borderRadius: 10, padding: 8 }}>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic' }}>"{req.offerNote}"</Text>
        </View>
      )}

      {(req.date || req.fromLoc) && (
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>
          {req.date ? `📅 ${req.date}` : ''}{req.time ? ` · ${req.time}` : ''}
          {req.fromLoc ? `\n📍 ${req.fromLoc}` : ''}{req.toLoc ? ` → ${req.toLoc}` : ''}
        </Text>
      )}

      {/* Actions: person who offered can self-assign or re-offer to someone else */}
      <View style={{ gap: 8 }}>
        <Btn label={`⚡ I'll take it myself`} color="#10B981"
          onPress={() => selfAssign(req.id, active.id, active.name)} />
        {candidates.length > 0 && (
          <Btn label="👤 Ask someone else instead" color={BRAND.purple} outline
            onPress={() => setReofferModal(true)} />
        )}
      </View>

      <OfferModal
        visible={reofferModal} candidates={candidates} allNames={allNames}
        onOffer={(toIds, toNames, note) => { offerToMembers(req.id, toIds, toNames, active.name, note); setReofferModal(false); }}
        onClose={() => setReofferModal(false)} colors={colors} isDark={isDark}
      />
    </CollapsibleCard>
  );
}

// ─── ASSIGNED card ────────────────────────────────────────────────────────────

function AssignedCard({ req, active, allMembers, colors, isDark }: {
  req: HelpRequest; active: Member; allMembers: Member[]; colors: any; isDark: boolean;
}) {
  const { completeRequest, offerToMembers, selfAssign } = useHelpStore();
  const [reofferModal, setReofferModal] = useState(false);
  const iAmHelper     = req.assignedHelperId === active.id;
  const iAmRequester  = req.requesterId === active.id;
  const accent        = iAmHelper ? BRAND.teal : BRAND.purple;
  const candidates    = getOfferCandidates(req, allMembers, active.id)
    .filter(c => c.id !== req.assignedHelperId);
  const allNames      = allMembers.map(m => m.name);

  return (
    <CollapsibleCard accent={accent} defaultExpanded={iAmHelper} colors={colors} isDark={isDark}
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: accent, }}>
              {iAmHelper ? `🤝 Helping ${req.requesterName.split(' ')[0]}` : `🔄 In progress — ${req.assignedHelper?.split(' ')[0]}`}
            </Text>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
              {req.title}
            </Text>
          </View>
          <BadgeStack cat={req.category} />
        </View>
      }>

      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic' }}>"{req.description}"</Text>

      {(req.date || req.fromLoc) && (
        <Text style={{ fontSize: TYPO.body, color: colors.textTertiary }}>
          {req.date ? `📅 ${req.date}` : ''}{req.time ? ` · ${req.time}` : ''}
          {req.fromLoc ? `\n📍 ${req.fromLoc}` : ''}{req.toLoc ? ` → ${req.toLoc}` : ''}
        </Text>
      )}

      {iAmHelper && (
        <Btn label="✓ Mark Done" color={BRAND.teal} onPress={() => completeRequest(req.id)} />
      )}

      {/* Requester or any parent can reassign if the helper is struggling */}
      {!iAmHelper && (iAmRequester || active.role === 'parent' || active.role === 'senior') && candidates.length > 0 && (
        <Btn label="🔁 Reassign to someone else" color={BRAND.purple} outline
          onPress={() => setReofferModal(true)} />
      )}

      <OfferModal
        visible={reofferModal} candidates={candidates} allNames={allNames}
        onOffer={(toIds, toNames, note) => { offerToMembers(req.id, toIds, toNames, active.name, note); setReofferModal(false); }}
        onClose={() => setReofferModal(false)} colors={colors} isDark={isDark}
      />
    </CollapsibleCard>
  );
}

// ─── COMPLETED row (compact, no collapse needed) ──────────────────────────────

function CompletedRow({ req, colors, isDark }: { req: HelpRequest; colors: any; isDark: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderRadius: 14, borderWidth: 1, borderColor: BRAND.teal + '35',
      backgroundColor: isDark ? '#001A18' : '#F0FDFC',
      padding: 12, paddingLeft: 15, overflow: 'hidden',
    }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: BRAND.teal }} />
      <Ionicons name="checkmark-circle" size={14} color={BRAND.teal} />
      <Text style={{ flex: 1, fontSize: TYPO.body, color: colors.textSecondary, flexShrink: 1 }} numberOfLines={1}>
        <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{req.requesterName.split(' ')[0]}: </Text>
        "{req.title}"
      </Text>
      {req.assignedHelper && (
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: BRAND.teal }}>
          ✓ {req.assignedHelper.split(' ')[0]}
        </Text>
      )}
    </View>
  );
}

// ─── Kid's own request view ───────────────────────────────────────────────────

function KidCard({ req, active, allMembers, colors, isDark, onResubmit }: {
  req: HelpRequest; active: Member; allMembers: Member[]; colors: any; isDark: boolean; onResubmit: () => void;
}) {
  const { withdrawRequest, acceptOffer, completeRequest, declineOffer } = useHelpStore();
  const [declineModal, setDeclineModal] = useState(false);

  // Kid was offered to help someone else (adult request routed to them)
  if ((req.offeredToIds ?? []).includes(active.id) && req.status === 'awaiting_acceptance') {
    return (
      <CollapsibleCard accent={BRAND.teal} defaultExpanded colors={colors} isDark={isDark}
        summary={
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.teal, }}>
                🙋 {req.offeredByName?.split(' ')[0]} is asking for your help!
              </Text>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{req.title}</Text>
            </View>
            <BadgeStack cat={req.category} />
          </View>
        }>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic' }}>"{req.description}"</Text>
        {req.offerNote && (
          <View style={{ backgroundColor: BRAND.teal + '15', borderRadius: 10, padding: 8 }}>
            <Text style={{ fontSize: TYPO.body, color: colors.textPrimary, fontStyle: 'italic' }}>"{req.offerNote}"</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn label="✅ Sure, I'll help!" color={BRAND.teal} onPress={() => acceptOffer(req.id, active.id, active.name)} />
          <Btn label="❌ Can't right now" color="#EF4444" outline onPress={() => setDeclineModal(true)} />
        </View>
        <DeclineOfferModal
          visible={declineModal}
          onDecline={(c) => { declineOffer(req.id, active.id, active.name, c); setDeclineModal(false); }}
          onClose={() => setDeclineModal(false)} colors={colors} isDark={isDark}
        />
      </CollapsibleCard>
    );
  }

  // Kid is the confirmed helper
  if (req.assignedHelperId === active.id && req.status === 'assigned') {
    return (
      <CollapsibleCard accent={BRAND.teal} defaultExpanded colors={colors} isDark={isDark}
        summary={
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.teal, }}>
                🤝 Helping {req.requesterName.split(' ')[0]}
              </Text>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{req.title}</Text>
            </View>
            <BadgeStack cat={req.category} />
          </View>
        }>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic' }}>"{req.description}"</Text>
        <Btn label="✓ Mark Done" color={BRAND.teal} onPress={() => completeRequest(req.id)} />
      </CollapsibleCard>
    );
  }

  // Kid's own request — various states
  const stateAccent =
    req.status === 'rejected' ? '#EF4444' :
    req.status === 'assigned' ? BRAND.purple :
    req.status === 'completed' ? BRAND.teal : BRAND.amber;

  const stateLabel =
    req.status === 'pending'             ? '⏳ Waiting for a parent to see this...' :
    req.status === 'awaiting_acceptance' ? `🤞 ${req.offeredByName?.split(' ')[0]} asked ${(req.offeredToIds ?? []).map((id: string) => allMembers.find(m => m.id === id)?.name.split(' ')[0] ?? id).join(', ')} — waiting on their reply...` :
    req.status === 'assigned'            ? `✅ In progress — ${req.assignedHelper}` :
    req.status === 'completed'           ? '✓ Done!' :
    req.status === 'rejected'            ? `❌ Rejected by ${req.rejectedByName?.split(' ')[0]}` :
    '';

  return (
    <CollapsibleCard accent={stateAccent} defaultExpanded={req.status === 'pending' || req.status === 'rejected'} colors={colors} isDark={isDark}
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{req.title}</Text>
            <Text style={{ fontSize: TYPO.caption, color: stateAccent, fontWeight: '600' }} numberOfLines={1}>{stateLabel}</Text>
          </View>
          <BadgeStack cat={req.category} />
        </View>
      }>

      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic' }}>"{req.description}"</Text>

      {req.status === 'rejected' && req.rejectionReason && (
        <View style={{ backgroundColor: '#EF444415', borderRadius: 10, padding: 8 }}>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic' }}>
            Reason: "{req.rejectionReason}"
          </Text>
        </View>
      )}

      {req.rewardCoins && req.status === 'completed' && (
        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: BRAND.amber }}>+{req.rewardCoins}🪙 earned!</Text>
      )}

      {req.status === 'pending' && (
        <Pressable onPress={() => withdrawRequest(req.id, active.id)}>
          <Text style={{ fontSize: TYPO.body, color: colors.textTertiary, fontWeight: '600' }}>Withdraw request</Text>
        </Pressable>
      )}
    </CollapsibleCard>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface Props {
  onRequestHelp: () => void;
  hideAskButton?: boolean;
}

export default function HelpQueueSection({ onRequestHelp, hideAskButton = false }: Props) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const { requests } = useHelpStore();

  const active = members.find(m => m.id === activeMemberId) ?? members[0];
  if (!active) return null;

  const isAdult = active.role === 'parent' || active.role === 'senior';

  const visibleReqs = isAdult
    ? requests.filter(r =>
        r.status === 'pending' || r.status === 'awaiting_acceptance' || r.status === 'assigned'
      )
    : requests.filter(r => {
        const isMyRequest    = r.requesterId === active.id && r.status !== 'withdrawn';
        const iOfferedToHelp = (r.offeredToIds ?? []).includes(active.id) && r.status === 'awaiting_acceptance';
        const iAmHelper      = r.assignedHelperId === active.id && r.status === 'assigned';
        return isMyRequest || iOfferedToHelp || iAmHelper;
      });

  const recentCompleted = isAdult
    ? requests.filter(r => r.status === 'completed').slice(0, 3)
    : [];

  const hasSomething = visibleReqs.length > 0 || recentCompleted.length > 0;

  return (
    <View style={{ gap: 8 }}>
      {!hideAskButton && (
        <Pressable onPress={onRequestHelp}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            backgroundColor: BRAND.purple, borderRadius: 14, paddingVertical: 12,
          }}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Ask for Help</Text>
        </Pressable>
      )}

      {!hasSomething && (
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <Text style={{ fontSize: 24 }}>✨</Text>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textTertiary, marginTop: 4 }}>
            All caught up — no open requests
          </Text>
        </View>
      )}

      {isAdult ? (
        <>
          {visibleReqs.filter(r => r.status === 'pending').map(req => (
            <PendingCard key={req.id} req={req} active={active} allMembers={members} colors={colors} isDark={isDark} />
          ))}
          {visibleReqs.filter(r => r.status === 'awaiting_acceptance').map(req => (
            <AwaitingCard key={req.id} req={req} active={active} allMembers={members} colors={colors} isDark={isDark} />
          ))}
          {visibleReqs.filter(r => r.status === 'assigned').map(req => (
            <AssignedCard key={req.id} req={req} active={active} allMembers={members} colors={colors} isDark={isDark} />
          ))}
          {recentCompleted.map(req => (
            <CompletedRow key={req.id} req={req} colors={colors} isDark={isDark} />
          ))}
        </>
      ) : (
        visibleReqs.map(req => (
          <KidCard
            key={req.id} req={req} active={active} allMembers={members}
            colors={colors} isDark={isDark}
            onResubmit={onRequestHelp}
          />
        ))
      )}

      {/* History link */}
      <Pressable
        onPress={() => router.push('/hub/help-history' as any)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          paddingVertical: 10,
        }}>
        <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
        <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary }}>
          Check History
        </Text>
        <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
}
