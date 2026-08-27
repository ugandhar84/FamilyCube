import { useState } from 'react';
import { View, Text, TextInput, Alert, Pressable } from 'react-native';
import { Coins, X, Check, PenLine } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { CollapsibleCard } from '../hubComponents';
import { CallReminderToggle } from '@/features/tasks/components/forms/CallReminderToggle';
import { DueDateTimePicker } from '@/features/tasks/components/forms/DueDateTimePicker';
import { fmtDateLabel, fmtTimeLabel } from '@/features/quests/components/questFormShared';
import { localDateStr } from '@/lib/dates';
import type { FamilyMember } from '@/store/familyStore';
import type { KidRequest } from '@/store/kidRequestStore';

// Scenario 1.4 — a Kid's suggested chore ("Can I wash the car for 15 coins?")
// awaiting a parent's Approve-as-is / Approve-with-Changes / Decline
// decision. Mirrors QuestApprovalCard's visual shape (the closest existing
// review-card pattern) but the action underneath is different: approving
// here doesn't just flip a status — it converts the request into a real,
// live chore via choreStore.addChore (wired by the caller through
// onApprove), matching every other kid-request review card's "approve
// calls back up to ParentView, which owns the actual store calls" shape.
export function QuestProposalCard({ req, kidName, active, colors, isDark, onApprove, onDecline }: {
  req: KidRequest; kidName: string; active: FamilyMember;
  colors: any; isDark: boolean;
  // finalCoins may differ from req.rewardCoins if the parent edited the
  // amount inline ("Approve with Changes" collapsed into one editable field
  // rather than a separate modal — same end result, less friction). dueDate/
  // dueTime/alertCall/alertCallLeadMinutes are all optional: a quest
  // proposal approves into an open pool quest by default (no due date), the
  // same as before this picker existed — a parent only needs to set them if
  // they want the call-reminder sweeper to actually have something to ring
  // against (it only queries chores that have a due_date set at all).
  onApprove: (finalCoins: number, schedule?: { dueDate: string; dueTime: string; alertCall: boolean; alertCallLeadMinutes: number }) => void;
  onDecline: (reason?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [coinsText, setCoinsText] = useState(String(req.rewardCoins ?? 15));
  // Guards a fast double-tap on Approve/Decline — onApprove calls addChore
  // (no dedup, creates a new chore every call) and onDecline calls
  // declineRequest; without this, two rapid taps created two live pool
  // quests for the same proposal plus two chat notifications.
  const [submitting, setSubmitting] = useState(false);

  const finalCoins = Math.max(0, Math.round(parseInt(coinsText, 10) || 0));
  const wasEdited = finalCoins !== (req.rewardCoins ?? 15);

  // Call-style reminder needs a due date/time to ring against — off by
  // default (pool quest, no due date, matching the pre-existing behavior)
  // and only shown/collected once the parent turns the toggle on.
  const [alertCall, setAlertCall] = useState(false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutes] = useState(10);
  const defaultDue = () => { const d = new Date(); const m = d.getMinutes(); d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1); return d; };
  const [dueDate, setDueDate] = useState<Date>(defaultDue);
  const [showDatePick, setShowDatePick] = useState(false);
  const [showTimePick, setShowTimePick] = useState(false);

  return (
    <CollapsibleCard accent={colors.parent} colors={colors} isDark={isDark} defaultExpanded
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 16 }}>🧩</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.parent }} numberOfLines={1}>
              {kidName} suggested a chore
            </Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>
              "{req.detail}"
            </Text>
          </View>
          <View style={{ backgroundColor: colors.parent + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.parent }}>Review</Text>
          </View>
        </View>
      }>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Coins size={14} color={colors.kid} />
        {editing ? (
          <TextInput
            value={coinsText}
            onChangeText={t => setCoinsText(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            autoFocus
            onBlur={() => setEditing(false)}
            style={{
              borderWidth: 1.5, borderColor: colors.parent, borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 4, fontSize: TYPO.label, fontWeight: '800',
              color: colors.textPrimary, width: 80,
            }}
          />
        ) : (
          <Pressable onPress={() => setEditing(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>
              {finalCoins} coins proposed{wasEdited ? ' (edited)' : ''}
            </Text>
            <PenLine size={12} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* Optional due date/time + call-reminder — shown collapsed by
          default (pool quest, no schedule) since most proposed chores don't
          need one; a parent who wants the sweeper to ring must set a due
          time here first, since it only queries chores with due_date set. */}
      <CallReminderToggle
        alertCall={alertCall} setAlertCall={setAlertCall}
        alertCallLeadMinutes={alertCallLeadMinutes} setAlertCallLeadMinutes={setAlertCallLeadMinutes}
        accentColor={colors.parent} colors={colors} isDark={isDark}
        variant="icon" pillStyle={styles.datePill}
      />
      {alertCall && (
        <DueDateTimePicker
          value={dueDate} setValue={setDueDate}
          showDatePick={showDatePick} setShowDatePick={setShowDatePick}
          showTimePick={showTimePick} setShowTimePick={setShowTimePick}
          fmtDateLabel={fmtDateLabel} fmtTimeLabel={fmtTimeLabel}
          accentColor={colors.parent} colors={colors} isDark={isDark}
          pillStyle={styles.datePill} overlayStyle={styles.pickerOverlay} cardStyle={styles.pickerCard}
        />
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          disabled={submitting}
          onPress={() => Alert.prompt(
            'Decline Chore Idea',
            `Let ${kidName} know why "${req.detail}" wasn't approved (optional).`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Decline', style: 'destructive', onPress: (reason?: string) => {
                if (submitting) return;
                setSubmitting(true);
                onDecline(reason?.trim() || undefined);
              } },
            ],
            'plain-text',
          )}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            backgroundColor: `${colors.danger}15`, borderWidth: 1, borderColor: `${colors.danger}40`,
            paddingVertical: 10, borderRadius: 12, opacity: submitting ? 0.6 : 1 }}>
          <X size={13} color={colors.danger} />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>Decline</Text>
        </Pressable>
        <Pressable
          disabled={submitting}
          onPress={() => {
            if (submitting) return;
            setSubmitting(true);
            onApprove(finalCoins, alertCall ? {
              dueDate: localDateStr(dueDate), dueTime: fmtTimeLabel(dueDate),
              alertCall, alertCallLeadMinutes,
            } : undefined);
          }}
          style={{ flex: 2, backgroundColor: colors.parent, paddingVertical: 10, borderRadius: 12,
            alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: submitting ? 0.6 : 1 }}>
          <Check size={14} color="#fff" />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
            {wasEdited ? `Approve with Changes (${finalCoins}🪙)` : `Approve as Chore (${finalCoins}🪙)`}
          </Text>
        </Pressable>
      </View>
    </CollapsibleCard>
  );
}

const styles = {
  datePill:      { flexDirection: 'row' as const, alignItems: 'center' as const, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flex: 1 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center' as const, paddingHorizontal: 20 },
  pickerCard:    { borderRadius: 20, overflow: 'hidden' as const, paddingBottom: 12 },
};
