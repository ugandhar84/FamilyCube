/**
 * HealthPeoplePage — person-picker landing page for Health & Records.
 * Shows one summary card per family member (active medications count,
 * pending vaccines count, an overdue/due-soon flag) so a parent usually
 * gets their answer ("did Jaswi take her meds today?") without drilling
 * any further — tapping a card opens HealthRecordsScreen scoped to that
 * one person for the full view/edit/add flow.
 *
 * [live-requested: "landing page with the persons/family members -> page
 * with summaries like medications (active), Vaccination (pending), Health
 * records (count)? and then take to respective pages to complete view?" —
 * user then asked for a suggestion on balancing depth vs. speed for the
 * common case of checking the same person repeatedly; the agreed approach
 * was to make the summary cards information-dense enough (counts +
 * overdue/due-soon badges) that most visits end on THIS page, rather than
 * adding a separate "last viewed" shortcut.]
 *
 * A kid/teen/senior session skips this page entirely — HealthRecordsScreen
 * already restricts them to their own records only (kidView), so a
 * person-picker makes no sense for them; the caller (FamilyScreen.tsx /
 * app/(tabs)/family-health.tsx) should route non-parent sessions straight
 * to HealthRecordsScreen instead of here.
 *
 * Same Figma flat-token shell as every other converted module this session
 * (HomeownerNotesScreen/SchoolScreen/HealthRecordsScreen): pinned header,
 * white cards, pastel accent per card (cycling through the brand's real
 * *Light tokens, same pattern FamilyScreen.tsx's own section cards use).
 */
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Pill, Syringe, Shield, HeartPulse, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import FullPageOverlay from '@/components/FullPageOverlay';
import HealthRecordsScreen from '../HealthRecordsScreen';
import { useHealthRecords } from './useHealthRecords';
import { medicationAdherenceHistory, formatDoseTime, today } from './types';
import { GEMINI } from '@/constants/geminiRhythm';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception) — imported from
// the shared module instead of redeclared locally
// [live-requested: "make modularize for simplicity"].
const PAGE_BG   = GEMINI.canvas;
const TITLE_CLR = GEMINI.titleColor;
const BODY_CLR  = GEMINI.bodyColor;
const BODY_CLR_LIGHT = GEMINI.bodyColorLight;
const LINK_BLUE = GEMINI.linkBlue;
const BORDER    = GEMINI.border;
const CARD_BG   = GEMINI.cardBg;
const CARD_SHADOW = GEMINI.cardShadow;

export default function HealthPeoplePage({ onClose }: { onClose?: () => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members } = useFamilyStore();
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  // Loaded once here (kidView: false — a parent always sees the whole
  // family in this hook) and reused for every card's summary counts, so
  // opening the picker doesn't fire N separate queries for N members.
  const hr = useHealthRecords({ kidView: false });

  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC  = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const pageBg = isDark ? colors.background : PAGE_BG;
  const linkC  = isDark ? colors.primary : LINK_BLUE;

  const handleClose = () => { onClose ? onClose() : router.back(); };

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8 }}>
        <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: linkC }}>‹ Family</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 10, lineHeight: 36 }}>
          Whose records?
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '500', color: bodyC, marginTop: 4 }}>
          Medications, vaccines, and records — pick a family member.
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 24, paddingTop: 10, gap: 12 }}>

        {/* ── Family-wide "what needs attention" banner — same intro-banner
            rhythm School's "Scan a schedule flyer" / Home Care's "Add a
            maintenance reminder" use, so the page doesn't open on nothing
            but a header and member cards [live-requested: "user header and
            footer banners to not to show page too emty"]. ── */}
        {(() => {
          const totalOverdue = hr.meds.filter(med => med.is_active && hr.isOverdue(med)).length;
          const totalDueSoon = hr.vaxes.filter(v => {
            if (v.done || !v.next_due_date) return false;
            const due = new Date(v.next_due_date).getTime();
            return (due - Date.now()) < 30 * 24 * 3600_000;
          }).length;
          const allClear = totalOverdue === 0 && totalDueSoon === 0;
          const tint = allClear
            ? { bg: colors.tealLight, fg: colors.teal }
            : { bg: colors.amberLight, fg: colors.amber };
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: tint.bg, borderRadius: 16, padding: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: cardBg,
                alignItems: 'center', justifyContent: 'center' }}>
                <HeartPulse size={22} color={tint.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>
                  {allClear ? 'Everyone is up to date' : 'A few things need attention'}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '500', color: bodyC, marginTop: 2 }}>
                  {allClear
                    ? 'No overdue doses or vaccines due soon across your family.'
                    : [
                        totalOverdue > 0 ? `${totalOverdue} dose${totalOverdue === 1 ? '' : 's'} overdue` : null,
                        totalDueSoon > 0 ? `${totalDueSoon} vaccine${totalDueSoon === 1 ? '' : 's'} due soon` : null,
                      ].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* ── Member list — flat, hairline-divided rows directly on the
            canvas instead of individually-boxed shadow cards, same rhythm
            as Home Care's task list (icon chip + title/meta lines + link)
            [live-requested: "i didnt like this design we can make this
            more flatten without cards like the tasks in homecare with
            more descriptive"]. All the same real data (today's dose
            status, vaccine/record counts, alert flag) is kept — just laid
            out as a denser multi-line row instead of a separate card per
            person. ── */}
        <View style={{ gap: 4 }}>
          {members.map((m, i) => {
            const roleAccent = m.role === 'parent'
              ? { bg: colors.tealLight, fg: colors.teal }
              : m.role === 'senior'
                ? { bg: colors.pinkLight, fg: colors.pink }
                : { bg: colors.amberLight, fg: colors.amber };

            const activeMeds = hr.meds.filter(med => med.member_id === m.id && med.is_active !== false);
            const pendingVax = hr.vaxes.filter(v => v.member_id === m.id && !v.done);
            const dueSoonCount = pendingVax.filter(v => {
              if (!v.next_due_date) return false;
              return (new Date(v.next_due_date).getTime() - Date.now()) < 30 * 24 * 3600_000;
            }).length;
            const totalRecords = hr.meds.filter(v => v.member_id === m.id).length
              + hr.vaxes.filter(v => v.member_id === m.id).length;

            // Today's dose status for each active med
            const todayStr = today();
            const todayDoses = activeMeds.map(med => {
              const history = medicationAdherenceHistory(med, 1);
              const todayEntries = history.filter(d => d.date === todayStr);
              const hasMissed   = todayEntries.some(d => d.status === 'missed');
              const allTaken    = todayEntries.length > 0 && todayEntries.every(d => d.status === 'taken');
              const nextUpcoming = todayEntries.find(d => d.status === 'upcoming');
              return { med, hasMissed, allTaken, nextUpcoming };
            });
            const missedToday = todayDoses.filter(d => d.hasMissed).length;

            // Age from dateOfBirth
            let ageLabel = '';
            if (m.dateOfBirth) {
              const dob = new Date(m.dateOfBirth);
              let age = new Date().getFullYear() - dob.getFullYear();
              const now = new Date();
              if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
              ageLabel = `${age} yrs`;
            }
            const roleLabel = m.subRole ?? m.relationship ?? (m.role === 'parent' ? 'Parent' : m.role === 'teen' ? 'Teen' : m.role === 'senior' ? 'Senior' : 'Kid');

            const hasAlert = missedToday > 0 || dueSoonCount > 0;
            const isLast = i === members.length - 1;

            return (
              <TouchableOpacity key={m.id} onPress={() => setOpenMemberId(m.id)} activeOpacity={0.7}
                style={{ paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: border }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: roleAccent.bg,
                    alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: roleAccent.fg }}>
                      {m.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, lineHeight: 20 }}>
                        {m.name} · {roleLabel}{ageLabel ? ` · ${ageLabel}` : ''}
                      </Text>
                      {hasAlert && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
                      )}
                    </View>

                    {/* Today's medications — descriptive line(s), not a
                        separate boxed section */}
                    {activeMeds.length > 0 ? (
                      <View style={{ marginTop: 4, gap: 3 }}>
                        {todayDoses.slice(0, 3).map(({ med, hasMissed, allTaken, nextUpcoming }) => {
                          const doseColor = hasMissed ? colors.danger : allTaken ? colors.teal : colors.amber;
                          const doseLabel = hasMissed ? 'Missed' : allTaken ? 'Taken' : nextUpcoming?.time ? formatDoseTime(nextUpcoming.time) : 'Upcoming';
                          return (
                            <Text key={med.id} style={{ fontSize: 12, color: bodyC }} numberOfLines={1}>
                              {med.name} · <Text style={{ color: doseColor, fontWeight: '700' }}>{doseLabel}</Text>
                            </Text>
                          );
                        })}
                        {activeMeds.length > 3 && (
                          <Text style={{ fontSize: 12, color: bodyC }}>+{activeMeds.length - 3} more medications</Text>
                        )}
                      </View>
                    ) : (
                      <Text style={{ fontSize: 12, color: bodyC, marginTop: 2 }}>No active medications</Text>
                    )}

                    <Text style={{ fontSize: 12, color: bodyC, marginTop: 2 }}>
                      {pendingVax.length > 0
                        ? `${pendingVax.length} vaccine${pendingVax.length === 1 ? '' : 's'} pending${dueSoonCount > 0 ? ` · ${dueSoonCount} due soon` : ''}`
                        : 'Vaccines up to date'}
                      {' · '}{totalRecords} record{totalRecords === 1 ? '' : 's'}
                    </Text>

                    <View style={{ marginTop: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: linkC }}>
                        Open {m.name.split(' ')[0]}'s records →
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Privacy footer — same teal card every other Health page ends
            on, so this landing page doesn't just stop after the last
            member card. ── */}
        <View style={{ backgroundColor: colors.tealLight, borderRadius: 16, padding: 16, marginTop: 4, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Shield size={13} color={colors.teal} />
            <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: colors.teal, textTransform: 'uppercase' }}>
              Private · Family Cube
            </Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? colors.textPrimary : '#1D3B2E', marginTop: 2 }}>
            Shared with your family
          </Text>
          <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : '#3E5A4D', marginTop: 1 }}>
            Kids, teens and seniors only ever see their own medications and vaccines — never the full family list.
          </Text>
        </View>
      </ScrollView>

      {/* Per-person full view — opened scoped to whichever card was
          tapped, as a FullPageOverlay sibling of this screen's own
          ScrollView (same containment rule as every other converted
          module this session). */}
      <FullPageOverlay visible={!!openMemberId} onDismiss={() => setOpenMemberId(null)} zIndex={55}>
        {openMemberId && (
          <HealthRecordsScreen onClose={() => setOpenMemberId(null)} initialMemberId={openMemberId} />
        )}
      </FullPageOverlay>
    </View>
  );
}
