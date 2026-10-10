import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FullPageOverlay from '@/components/FullPageOverlay';
import type { HomeownerNote } from '@/store/homeownerNotesStore';
import { useFamilyStore } from '@/store/familyStore';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception, 2026-10-10) — see
// features/vault/tabs/SchoolHomeScreen.tsx's own comment for the full
// rationale.
const CANVAS = '#ECE6DE';
const TITLE_CLR = '#0D1210';
const BODY_CLR = '#3D4D47';
const BODY_CLR_LIGHT = '#4E5C56';
const BLUE = '#3B5FE4';
const LINK_BLUE = '#23352B';
const BORDER = '#DDD6CC';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F0EDE6';
const CARD_SHADOW = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 } as const;
const GREEN_BG = '#EEF7F0';
const GREEN_CLR = '#2D7A4A';

function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}
function fmtDisplay(s: string) {
  return parseLocalDateStr(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}
function addDays(iso: string, days: number): string {
  const d = parseLocalDateStr(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function intervalLabel(days: number): string {
  if (days === 7) return 'every week';
  if (days === 14) return 'every 2 weeks';
  if (days === 30) return 'every month';
  if (days === 90) return 'every 3 months';
  if (days === 180) return 'every 6 months';
  if (days === 365) return 'every year';
  return `every ${days} days`;
}

export function CompleteNoteSheet({ visible, note, colors, isDark, onClose, onConfirm, zIndex = 61 }: {
  visible: boolean; note: HomeownerNote | null; colors: any; isDark?: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
  zIndex?: number;
}) {
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId);

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  const close = () => { setComment(''); setDone(false); onClose(); };

  const confirm = () => {
    setDone(true);
    onConfirm(comment);
  };

  if (!note) return null;

  const today = new Date().toISOString().slice(0, 10);
  const nextDue = note.recurEveryDays ? addDays(today, note.recurEveryDays) : null;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
  const otherNames = members.filter(m => m.id !== activeMemberId).map(m => m.name.split(' ')[0]).join(' and ');

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Home care</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 8, lineHeight: 36 }}>
            A little care, recorded
          </Text>
          {/* Status badge */}
          <View style={{ marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5,
            borderRadius: 8, backgroundColor: isDark ? colors.surface : '#EEF3FB' }}>
            <Text style={{ fontSize: 12, color: isDark ? BLUE : LINK_BLUE, fontWeight: '600' }}>
              {done ? 'Completion recorded' : 'Fictional completion receipt'}
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 48, gap: 14 }}>

            {/* Completion summary card */}
            <View style={{ borderRadius: 18, backgroundColor: isDark ? colors.surface : GREEN_BG, padding: 18, gap: 14 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: isDark ? colors.textPrimary : GREEN_CLR }}>
                {note.title} · completed
              </Text>

              {/* Last done row */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <Text style={{ fontSize: 18, lineHeight: 24 }}>✅</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: titleC }}>
                    Last done: {fmtDisplay(today)}
                  </Text>
                  <Text style={{ fontSize: 13, color: bodyC, marginTop: 2 }}>
                    Recorded by {activeMember?.name?.split(' ')[0] ?? 'you'} · {timeStr}
                  </Text>
                  {note.dueDate && (
                    <Text style={{ fontSize: 13, color: bodyC, marginTop: 1 }}>
                      Earlier completion of {fmtDisplay(note.dueDate)} reminder
                    </Text>
                  )}
                </View>
              </View>

              {/* Next due row */}
              {nextDue && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <Text style={{ fontSize: 18, lineHeight: 24 }}>📅</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: titleC }}>
                      Next due: {fmtDisplay(nextDue)}
                    </Text>
                    <Text style={{ fontSize: 13, color: bodyC, marginTop: 2 }}>
                      Inferred from last done + {intervalLabel(note.recurEveryDays!)}
                    </Text>
                    {note.dueDate && (
                      <Text style={{ fontSize: 13, color: bodyC, marginTop: 1 }}>
                        Previously due {fmtDisplay(note.dueDate)} · replaced by new date
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* What the log keeps */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 18, backgroundColor: cardBg, padding: 18, gap: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: titleC }}>What the log keeps</Text>

              <View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>Completion note</Text>
                <Text style={{ fontSize: 13, color: bodyC, lineHeight: 18, marginTop: 2 }}>
                  {comment.trim() || 'No note added yet · add one below'}
                </Text>
              </View>

              {note.recurEveryDays && (
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>Interval retained</Text>
                  <Text style={{ fontSize: 13, color: bodyC, lineHeight: 18, marginTop: 2 }}>
                    {intervalLabel(note.recurEveryDays)} · editable household reminder, subject to manufacturer requirements
                  </Text>
                </View>
              )}

              <View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>Access & audit</Text>
                <Text style={{ fontSize: 13, color: bodyC, lineHeight: 18, marginTop: 2 }}>
                  {activeMember?.name?.split(' ')[0] ?? 'You'} recorded completion.
                  {otherNames ? ` ${otherNames} can view. ` : ' '}
                  Previous last-done date retained in history.
                </Text>
              </View>
            </View>

            {/* Comment input */}
            {!done && (
              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontSize: 12, color: bodyC, marginBottom: 6 }}>Completion note (optional)</Text>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="e.g. Daniel replaced the filter; spare used."
                  placeholderTextColor="#C0C7D4"
                  multiline
                  style={{ fontSize: 15, color: titleC, padding: 0, minHeight: 60, textAlignVertical: 'top' }}
                />
              </View>
            )}

            {/* Actions */}
            {!done && (
              <TouchableOpacity onPress={confirm}
                style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Mark as done</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={close}
              style={{ height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? BLUE : LINK_BLUE }}>
                {done ? 'Back to home care' : 'View completion history'}
              </Text>
            </TouchableOpacity>

            {!done && (
              <TouchableOpacity onPress={close}
                style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, color: bodyC }}>Cancel</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </FullPageOverlay>
  );
}
