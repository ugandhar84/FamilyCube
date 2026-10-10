/**
 * HealthFigmaList — flat "Figma" presentational rebuild of the Health &
 * Records list (Current/Past medication cards, Recorded vaccines card),
 * matching the HomeownerNotesScreen.tsx/SchoolScreen.tsx/FamilyScreen.tsx
 * Figma shell established this session (PAGE_BG/TITLE_CLR/BODY_CLR/BLUE/
 * BORDER flat tokens, gated behind `isDark ? colors.X : FIGMA_TOKEN` the
 * same way ScanDateField.tsx's `figmaTokens` prop does).
 *
 * This does NOT own any state or business logic — it is a pure
 * presentational sibling of HealthRecordsList.tsx, driven by the exact
 * same props HealthTab.tsx already computes (filteredMeds/filteredVaxes,
 * markTaken, toggleMedActive, deleteMed, deleteMedsBulk, bulk-select,
 * member/filter state, etc.). HealthRecordsList.tsx is untouched — kiosk
 * and any other caller that still wants the old glass look keeps getting
 * it; HealthRecordsScreen.tsx (mobile's real screen) now renders THIS
 * component instead for the flat look, per the live-supplied mockup
 * ["while adapting the new design also find opportunity to add our all
 * features" — every feature below is the same underlying handler, just a
 * different container around it].
 */
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput } from 'react-native';
import {
  Pill, Syringe, Trash2, Check, Clock, ChevronDown, User, Calendar, RefreshCw,
  History, X, XCircle, Square, CheckSquare, Share2, SlidersHorizontal, ChevronRight, Shield,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GEMINI } from '@/constants/geminiRhythm';
import { MemberAvatar } from '../shared';
import {
  Medication, Vaccine, FREQ_LABELS, getCatColors, today, encodeTakenEntry, formatDoseTime,
  medicationAdherenceHistory, fmtDateDisplay, DoseAdherence, groupHistoryByDay,
} from './types';
import { fmtDate } from '@/lib/dates';
import { showAlert } from '@/components/AppAlert';
import { shareVaccineRecordsPdf } from './vaxPdfExport';
import FullPageOverlay from '@/components/FullPageOverlay';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception) — imported from the
// shared module instead of redeclared locally
// [live-requested: "make modularize for simplicity"].
// Two distinct blues: BLUE = real primary/action color (selected states,
// "Mark taken" pill, Select-mode checkbox check); LINK_BLUE = link-style
// text only ("View medication →", "Filters", "Select", "Open full
// filters →").
const PAGE_BG   = GEMINI.canvas;
const TITLE_CLR = GEMINI.titleColor;
const BODY_CLR  = GEMINI.bodyColor;
const BLUE      = GEMINI.blue;
const LINK_BLUE = GEMINI.linkBlue;
const BORDER    = GEMINI.border;
const CARD_BG   = GEMINI.cardBg;

// "Content group" card per the exact Figma export — white bg, radius 22
// (was 16 here — a real mismatch against the spec), soft shadow (was a
// plain 1px border with no shadow), padding 16, gap 12. Dark mode keeps a
// 1px border (shadows don't read well on dark backgrounds in this app) and
// no shadow, same convention as this session's other Figma cards.
function contentGroupStyle(cardBg: string, isDark: boolean, border: string) {
  return isDark
    ? { backgroundColor: cardBg, borderRadius: 22, borderWidth: 1, borderColor: border, padding: 16, gap: 12 as const }
    : {
        backgroundColor: cardBg, borderRadius: 22, padding: 16, gap: 12 as const,
        shadowColor: '#102347', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      };
}

const STATUS_META: Record<DoseAdherence['status'], { label: string; Icon: any }> = {
  taken: { label: 'Taken', Icon: Check },
  missed: { label: 'Missed', Icon: XCircle },
  upcoming: { label: 'Upcoming', Icon: Clock },
};

export default function HealthFigmaList({
  colors, isDark, kidView,
  meds, vaxes, filteredMeds, filteredVaxes,
  healthTab,
  medSearch, setMedSearch, vaxSearch, setVaxSearch,
  openFilterSheet,
  medMemberFilter,
  vaxMemberFilter,
  members,
  familyName,
  memberName, memberColor,
  isOverdue,
  expandedId, setExpandedId,
  markTaken, toggleMedActive, deleteMed, deleteMedsBulk,
  toggleVax, deleteVax, deleteVaxesBulk,
  onEditMed, onEditVax,
  load,
  recordOwnerLine,
}: {
  colors: any; isDark: boolean; kidView: boolean;
  meds: Medication[]; vaxes: Vaccine[];
  filteredMeds: Medication[]; filteredVaxes: Vaccine[];
  healthTab: 'meds' | 'vax';
  medSearch: string; setMedSearch: (v: string) => void;
  vaxSearch: string; setVaxSearch: (v: string) => void;
  openFilterSheet: () => void;
  medMemberFilter: string[]; vaxMemberFilter: string[];
  members: any[];
  familyName?: string;
  memberName: (id: string) => string; memberColor: (id: string) => string;
  isOverdue: (med: Medication) => boolean;
  expandedId: string | null; setExpandedId: (id: string | null) => void;
  markTaken: (med: Medication, time: string | null) => void;
  toggleMedActive: (med: Medication) => void;
  deleteMed: (id: string) => void;
  deleteMedsBulk?: (ids: string[]) => void;
  toggleVax: (vax: Vaccine) => void;
  deleteVax: (id: string) => void;
  deleteVaxesBulk?: (ids: string[]) => void;
  onEditMed?: (med: Medication) => void;
  onEditVax?: (vax: Vaccine) => void;
  load: () => void;
  // Honest ownership/visibility line for the privacy footer — passed down
  // from HealthRecordsScreen.tsx so this presentational component doesn't
  // need its own role-lookup logic.
  recordOwnerLine: string;
}) {
  const catColors = getCatColors(colors);
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC  = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const pageBg = isDark ? colors.background : PAGE_BG;
  const insets = useSafeAreaInsets();

  const [historyMed, setHistoryMed] = useState<Medication | null>(null);
  const historyDays = historyMed ? groupHistoryByDay(medicationAdherenceHistory(historyMed)) : [];

  // Long-press-to-select multi-delete — same trigger/interaction model as
  // HealthRecordsList.tsx's own selectMode (just reskinned chrome below).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const enterSelectMode = () => { setSelectMode(true); setSelectedIds(new Set()); setExpandedId(null); };
  const toggleSelected = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const confirmBulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (healthTab === 'meds') {
      deleteMedsBulk?.(ids);
    } else {
      showAlert(`Delete ${ids.length} vaccine${ids.length > 1 ? 's' : ''}?`, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteVaxesBulk?.(ids) },
      ]);
    }
    exitSelectMode();
  };

  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const memberFilter = healthTab === 'meds' ? medMemberFilter : vaxMemberFilter;
  const memberPillLabel = memberFilter.length === 1
    ? memberName(memberFilter[0])
    : memberFilter.length > 1
      ? `${memberFilter.length} members`
      : 'All members';

  // Current vs Past split for medications — "Current" = active/ongoing,
  // "Past" = inactive/deactivated or ended. Same underlying is_active flag
  // HealthTab.tsx's toggleMedActive already writes, just split into two
  // named groups instead of one flat filtered list with an opacity dim.
  const currentMeds = useMemo(() => filteredMeds.filter(m => m.is_active !== false), [filteredMeds]);
  const pastMeds = useMemo(() => filteredMeds.filter(m => m.is_active === false), [filteredMeds]);

  // Vaccines: one flat "Recorded vaccines" list, newest first — matches
  // the mockup's Vaccines-segment card ("Recorded vaccines · N", not a
  // Current/Past split). filteredVaxes is already sorted newest-first by
  // HealthTab.tsx's own useMemo.
  const [exportingPdf, setExportingPdf] = useState(false);
  const onSharePdf = async () => {
    if (exportingPdf || filteredVaxes.length === 0) return;
    setExportingPdf(true);
    try {
      const byMember = new Map<string, Vaccine[]>();
      for (const v of filteredVaxes) {
        const list = byMember.get(v.member_id) ?? [];
        list.push(v);
        byMember.set(v.member_id, list);
      }
      await shareVaccineRecordsPdf({
        familyName: familyName ?? 'Family Cube',
        members: Array.from(byMember.entries()).map(([memberId, vaccines]) => ({
          memberId, memberName: memberName(memberId), vaccines,
        })),
      });
    } catch (e: any) {
      showAlert('Could not share PDF', e?.message ?? 'Something went wrong generating the file.');
    } finally {
      setExportingPdf(false);
    }
  };

  // ── Shared row chrome ──────────────────────────────────────────────
  function MedRow({ med, isLast, isPast = false }: { med: Medication; isLast: boolean; isPast?: boolean }) {
    const isTakenToday = med.taken_date === today();
    const overdue = isOverdue(med);
    const expanded = expandedId === med.id;
    const catColor = catColors[med.category] ?? colors.danger;
    const isSelected = selectedIds.has(med.id);
    const doseTimes = med.frequency_times?.length ? med.frequency_times : [null];
    const multiDose = doseTimes.length > 1;
    const takenSet = new Set(med.taken_dates ?? []);
    const todayStr = today();

    return (
      <View style={{ borderTopWidth: isLast ? 0 : 1, borderTopColor: border, paddingTop: isLast ? 0 : 12, marginTop: isLast ? 0 : 12 }}>
        <TouchableOpacity
          onPress={() => selectMode ? toggleSelected(med.id) : setExpandedId(expanded ? null : med.id)}
          onLongPress={() => !kidView && !selectMode && onEditMed?.(med)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            {selectMode ? (
              <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                {isSelected ? <CheckSquare size={18} color={BLUE} /> : <Square size={18} color={bodyC} />}
              </View>
            ) : (
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: catColor + '18',
                alignItems: 'center', justifyContent: 'center' }}>
                <Pill size={15} color={catColor} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: titleC, flex: 1 }}>{med.name}</Text>
                {isTakenToday && <View style={{ backgroundColor: colors.success + '18', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.success }}>Taken</Text>
                </View>}
                {!isTakenToday && overdue && <View style={{ backgroundColor: colors.danger + '18', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.danger }}>Overdue</Text>
                </View>}
              </View>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 2 }}>
                {med.dosage} {med.dosage_unit} · {FREQ_LABELS[med.frequency] ?? med.frequency}
                {doseTimes[0] ? ` · ${doseTimes.filter(Boolean).map(t => formatDoseTime(t as string)).join(' & ')}` : ''}
              </Text>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 1, textTransform: 'capitalize' }}>
                {med.category} · Started {med.start_date ? fmtDateDisplay(new Date(med.start_date + 'T00:00:00')) : '—'}
              </Text>
              {(med.prescribing_doctor || med.pharmacy) && (
                <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>
                  {med.prescribing_doctor ? `Dr. ${med.prescribing_doctor}` : ''}{med.prescribing_doctor && med.pharmacy ? ' · ' : ''}{med.pharmacy ?? ''}
                </Text>
              )}
              {!selectMode && (
                <TouchableOpacity
                  onPress={() => isPast ? setHistoryMed(med) : setExpandedId(expanded ? null : med.id)}
                  style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: LINK_BLUE }}>
                    {isPast ? 'View history' : 'View medication'}
                  </Text>
                  <ChevronRight size={13} color={LINK_BLUE} />
                </TouchableOpacity>
              )}
            </View>
            {!selectMode && <MemberAvatar name={memberName(med.member_id)} color={memberColor(med.member_id)} size={26} />}
          </View>
        </TouchableOpacity>

        {expanded && !selectMode && (
          <View style={{ marginTop: 12, gap: 8, paddingTop: 12, borderTopWidth: 1, borderColor: border }}>
            {med.pills_remaining != null && (
              <Text style={{ fontSize: 12, color: bodyC }}>{med.pills_remaining} pills remaining</Text>
            )}
            {med.refill_date && (
              <Text style={{ fontSize: 12, color: bodyC }}>Refill: {fmtDateDisplay(new Date(med.refill_date + 'T00:00:00'))}</Text>
            )}
            {med.instructions && (
              <Text style={{ fontSize: 12, color: bodyC, fontStyle: 'italic' }}>{med.instructions}</Text>
            )}

            {/* Mark taken — one button per real dose time, same
                markTaken(med, time) handler as the glass version, just
                flat chrome. */}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
              {doseTimes.map((time, idx) => {
                const doseTaken = multiDose ? takenSet.has(encodeTakenEntry(todayStr, time)) : isTakenToday;
                return (
                  <TouchableOpacity key={time ?? idx} onPress={() => markTaken(med, multiDose ? time : null)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
                      backgroundColor: doseTaken ? colors.success + '15' : BLUE + '12',
                      borderWidth: 1, borderColor: doseTaken ? colors.success + '50' : BLUE + '40' }}>
                    <Check size={13} color={doseTaken ? colors.success : BLUE} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: doseTaken ? colors.success : BLUE }}>
                      {multiDose ? `${formatDoseTime(time as string)}${doseTaken ? ' ✓' : ''}` : (doseTaken ? 'Taken today' : 'Mark taken')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity onPress={() => setHistoryMed(med)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
                  borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
                <History size={13} color={bodyC} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: bodyC }}>History</Text>
              </TouchableOpacity>
              {!kidView && (
                <>
                  {onEditMed && (
                    <TouchableOpacity onPress={() => onEditMed(med)}
                      style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: bodyC }}>Edit</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => toggleMedActive(med)}
                    style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1,
                      borderColor: med.is_active ? colors.danger + '50' : colors.success + '50',
                      backgroundColor: med.is_active ? colors.danger + '10' : colors.success + '10' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: med.is_active ? colors.danger : colors.success }}>
                      {med.is_active ? 'Deactivate' : 'Reactivate'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteMed(med.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.danger + '40', backgroundColor: colors.danger + '10' }}>
                    <Trash2 size={14} color={colors.danger} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    );
  }

  function VaxRow({ vax, isLast }: { vax: Vaccine; isLast: boolean }) {
    const isSelected = selectedIds.has(vax.id);
    const noteLine = [
      vax.vaccine_type ? vax.vaccine_type.toUpperCase() : null,
      vax.series_total > 1 ? `Dose ${vax.series_current}/${vax.series_total}` : null,
      vax.done ? 'Recorded' : 'Scheduled',
    ].filter(Boolean).join(' · ');
    return (
      <View style={{ borderTopWidth: isLast ? 0 : 1, borderTopColor: border, paddingTop: isLast ? 0 : 12, marginTop: isLast ? 0 : 12 }}>
        <TouchableOpacity
          onPress={() => selectMode ? toggleSelected(vax.id) : onEditVax?.(vax)}
          onLongPress={() => !selectMode && onEditVax?.(vax)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            {selectMode ? (
              <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                {isSelected ? <CheckSquare size={18} color={BLUE} /> : <Square size={18} color={bodyC} />}
              </View>
            ) : (
              <TouchableOpacity onPress={() => toggleVax(vax)} hitSlop={8}
                style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: vax.done ? colors.teal + '18' : cardBg,
                  borderWidth: 1.5, borderColor: vax.done ? colors.teal + '60' : border,
                  alignItems: 'center', justifyContent: 'center' }}>
                <Syringe size={15} color={vax.done ? colors.teal : bodyC} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>{vax.title}</Text>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 2 }}>
                {fmtDateDisplay(new Date(vax.date + 'T00:00:00'))}{vax.location ? ` · ${vax.location}` : ''}
              </Text>
              <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>
                {noteLine}{vax.next_due_date ? ` · Next due ${fmtDateDisplay(new Date(vax.next_due_date + 'T00:00:00'))}` : ''}
              </Text>
              {!selectMode && (
                <TouchableOpacity onPress={() => onEditVax?.(vax)} style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: LINK_BLUE }}>View vaccine</Text>
                  <ChevronRight size={13} color={LINK_BLUE} />
                </TouchableOpacity>
              )}
            </View>
            {!selectMode && <MemberAvatar name={memberName(vax.member_id)} color={memberColor(vax.member_id)} size={26} />}
            {!selectMode && (
              <TouchableOpacity onPress={() => deleteVax(vax.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 4 }}>
                <Trash2 size={14} color={colors.danger + 'AA'} />
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {/* ── Search + member pill + filters pill ── */}
      <View style={{ gap: 8 }}>
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: border,
          backgroundColor: cardBg, paddingHorizontal: 14, paddingVertical: 14,
          minHeight: 52, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              value={healthTab === 'meds' ? medSearch : vaxSearch}
              onChangeText={healthTab === 'meds' ? setMedSearch : setVaxSearch}
              placeholder={healthTab === 'meds' ? 'Search by name, category or doctor…' : 'Search by name or type…'}
              placeholderTextColor={bodyC}
              style={{ flex: 1, fontSize: 15, color: titleC, fontWeight: '500',
                height: 24, paddingVertical: 0 }}
            />
            {(healthTab === 'meds' ? medSearch : vaxSearch).length > 0 && (
              <TouchableOpacity onPress={() => (healthTab === 'meds' ? setMedSearch : setVaxSearch)('')}>
                <X size={14} color={bodyC} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          <TouchableOpacity onPress={() => setShowMemberPicker(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: border,
              backgroundColor: cardBg, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: titleC }}>{memberPillLabel}</Text>
            <ChevronDown size={13} color={bodyC} />
          </TouchableOpacity>
          <TouchableOpacity onPress={openFilterSheet}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: border,
              backgroundColor: cardBg, paddingHorizontal: 12, paddingVertical: 9 }}>
            <SlidersHorizontal size={13} color={LINK_BLUE} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: LINK_BLUE }}>Filters</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {!kidView && healthTab === 'vax' && filteredVaxes.length > 0 && (
            <TouchableOpacity onPress={onSharePdf} disabled={exportingPdf} style={{ padding: 8, opacity: exportingPdf ? 0.5 : 1 }}>
              <Share2 size={16} color={colors.teal} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={load} style={{ padding: 8 }}>
            <RefreshCw size={14} color={bodyC} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Member identity card — rich per-person context card shown when a
          single member is selected. Shows avatar, name, role/sub-role, age
          derived from dateOfBirth, and a live count of their meds + vaccines
          so the user knows at a glance whose records they're viewing. ── */}
      {memberFilter.length === 1 && (() => {
        const m = members.find(x => x.id === memberFilter[0]);
        const roleLabel = m?.subRole ?? (m?.role === 'parent' ? 'Parent' : m?.role === 'teen' ? 'Teen' : m?.role === 'senior' ? 'Senior' : 'Kid');
        const relLabel  = m?.relationship ?? roleLabel;
        const accentC   = m?.role === 'parent' ? colors.teal : m?.role === 'senior' ? colors.pink : colors.amber;
        const accentLt  = m?.role === 'parent' ? colors.tealLight : m?.role === 'senior' ? colors.pinkLight : colors.amberLight;

        let ageLabel = '';
        if (m?.dateOfBirth) {
          const dob   = new Date(m.dateOfBirth);
          const today = new Date();
          let age     = today.getFullYear() - dob.getFullYear();
          if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
          ageLabel = `${age} yrs`;
        }

        const memberMedCount = meds.filter(x => x.member_id === memberFilter[0]).length;
        const memberVaxCount = vaxes.filter(x => x.member_id === memberFilter[0]).length;

        return (
          <View style={[contentGroupStyle(cardBg, isDark, border), { gap: 0, padding: 14 }]}>
            {/* Top row: avatar + name block */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <MemberAvatar name={memberName(memberFilter[0])} color={memberColor(memberFilter[0])} size={48} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: titleC, lineHeight: 22 }}>
                  {memberName(memberFilter[0])}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ backgroundColor: accentLt, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: accentC }}>{relLabel}</Text>
                  </View>
                  {ageLabel ? (
                    <Text style={{ fontSize: 12, color: bodyC, fontWeight: '500' }}>{ageLabel}</Text>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: border, marginVertical: 12 }} />

            {/* Stats row */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: isDark ? colors.surface : '#F4F7FF', borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: BLUE }}>{memberMedCount}</Text>
                <Text style={{ fontSize: 11, color: bodyC, fontWeight: '600' }}>Medications</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: isDark ? colors.surface : '#F2FBF6', borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.teal }}>{memberVaxCount}</Text>
                <Text style={{ fontSize: 11, color: bodyC, fontWeight: '600' }}>Vaccines</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: isDark ? colors.surface : '#FBF8FF', borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.pink }}>
                  {meds.filter(x => x.member_id === memberFilter[0] && x.is_active !== false).length}
                </Text>
                <Text style={{ fontSize: 11, color: bodyC, fontWeight: '600' }}>Active Rx</Text>
              </View>
            </View>

            {/* Ownership line */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}>
              <Shield size={12} color={bodyC} />
              <Text style={{ fontSize: 11, color: bodyC }}>{recordOwnerLine} · permitted records only</Text>
            </View>
          </View>
        );
      })()}

      {/* ── Select-mode bar ── */}
      {selectMode && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: cardBg, paddingHorizontal: 14, paddingVertical: 10 }}>
          <TouchableOpacity onPress={exitSelectMode}><Text style={{ fontSize: 12, fontWeight: '700', color: bodyC }}>Cancel</Text></TouchableOpacity>
          <Text style={{ fontSize: 12, fontWeight: '700', color: titleC }}>{selectedIds.size} selected</Text>
          <TouchableOpacity onPress={confirmBulkDelete} disabled={selectedIds.size === 0}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: selectedIds.size === 0 ? 0.4 : 1 }}>
            <Trash2 size={14} color={colors.danger} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
      {!selectMode && !kidView && ((healthTab === 'meds' && filteredMeds.length > 0) || (healthTab === 'vax' && filteredVaxes.length > 0)) && (
        <TouchableOpacity onPress={enterSelectMode} style={{ alignSelf: 'flex-end' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: LINK_BLUE }}>Select</Text>
        </TouchableOpacity>
      )}

      {/* ── Medications: Current + Past cards ── */}
      {healthTab === 'meds' && (
        <>
          <View style={contentGroupStyle(cardBg, isDark, border)}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 4 }}>
              Current · {currentMeds.length}
            </Text>
            {currentMeds.length === 0 ? (
              <Text style={{ fontSize: 13, color: bodyC, paddingVertical: 8 }}>
                {meds.length === 0 ? 'No medications yet' : 'No current medications match this view'}
              </Text>
            ) : currentMeds.map((med, i) => <MedRow key={med.id} med={med} isLast={i === 0} />)}
          </View>

          {pastMeds.length > 0 && (
            <View style={contentGroupStyle(cardBg, isDark, border)}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 4 }}>Past records</Text>
              {pastMeds.map((med, i) => <MedRow key={med.id} med={med} isLast={i === 0} isPast />)}
            </View>
          )}
        </>
      )}

      {/* ── Vaccines: single "Recorded vaccines" card ── */}
      {!kidView && healthTab === 'vax' && (
        <>
          <View style={contentGroupStyle(cardBg, isDark, border)}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 4 }}>
              Recorded vaccines · {filteredVaxes.length}
            </Text>
            {filteredVaxes.length === 0 ? (
              <Text style={{ fontSize: 13, color: bodyC, paddingVertical: 8 }}>
                {vaxes.length === 0 ? 'No vaccine records yet' : 'No results — adjust filters'}
              </Text>
            ) : filteredVaxes.map((vax, i) => <VaxRow key={vax.id} vax={vax} isLast={i === 0} />)}
          </View>

          {/* Genuine "we don't infer medical advice" disclaimer — teal/mint
              info card, vaccines segment only. */}
          <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.tealLight, borderRadius: 14, padding: 14 }}>
            <Shield size={16} color={colors.teal} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12, color: isDark ? colors.textSecondary : '#265C44', lineHeight: 17 }}>
              No due-date or treatment recommendation is inferred. Ask a clinician to confirm your vaccination history.
            </Text>
          </View>
        </>
      )}

      {/* ── Adherence history — full page, not a bottom sheet, per the
          app-wide "no bottom sheets" rule [live-requested: "full page"].
          Same underlying medicationAdherenceHistory/groupHistoryByDay data
          and STATUS_META rendering, just a pinned Figma header instead of
          a drawer. ── */}
      <FullPageOverlay visible={!!historyMed} onDismiss={() => setHistoryMed(null)} zIndex={58}>
        <View style={{ flex: 1, backgroundColor: pageBg }}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8 }}>
            <TouchableOpacity onPress={() => setHistoryMed(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Health records</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 10, lineHeight: 36 }}>
              {historyMed?.name} history
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '500', color: bodyC, marginTop: 4 }}>
              {historyMed ? memberName(historyMed.member_id) : ''}
            </Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 10, paddingBottom: insets.bottom + 24, gap: 14 }}>
            {historyDays.length === 0 ? (
              <View style={contentGroupStyle(cardBg, isDark, border)}>
                <Text style={{ fontSize: 13, color: bodyC, textAlign: 'center', paddingVertical: 24 }}>No history yet</Text>
              </View>
            ) : historyDays.map(({ date, doses }) => (
              <View key={date} style={contentGroupStyle(cardBg, isDark, border)}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: titleC }}>
                  {fmtDateDisplay(new Date(date + 'T00:00:00'))}
                </Text>
                {doses.map((dose, idx) => {
                  const meta = STATUS_META[dose.status];
                  const tint = dose.status === 'taken' ? colors.success : dose.status === 'missed' ? colors.danger : bodyC;
                  return (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8,
                      borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: border }}>
                      <meta.Icon size={14} color={tint} />
                      <Text style={{ flex: 1, fontSize: 14, color: titleC }}>{dose.time ? formatDoseTime(dose.time) : 'Dose'}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: tint }}>{meta.label}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </FullPageOverlay>

      {/* ── Member picker (drives the real medMemberFilter/vaxMemberFilter
          state — HealthFilterSheet owns the full multi-select UI; this is
          a quick single-tap shortcut matching the mockup's "Ruth ▾" pill). ── */}
      <Modal visible={showMemberPicker} transparent animationType="fade" onRequestClose={() => setShowMemberPicker(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
          activeOpacity={1} onPress={() => setShowMemberPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: cardBg, paddingBottom: 24, paddingTop: 14, paddingHorizontal: 18 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: border, alignSelf: 'center', marginBottom: 14 }} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 10 }}>Show records for</Text>
            <TouchableOpacity onPress={openFilterSheet} style={{ paddingVertical: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: LINK_BLUE }}>Open full filters →</Text>
            </TouchableOpacity>
            {members.map(m => {
              const sel = memberFilter.includes(m.id);
              return (
                <TouchableOpacity key={m.id} onPress={() => setShowMemberPicker(false)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                  <MemberAvatar name={m.name} color={memberColor(m.id)} size={30} />
                  <Text style={{ fontSize: 14, fontWeight: sel ? '700' : '500', color: titleC, flex: 1 }}>{m.name}</Text>
                  {sel && <Check size={16} color={BLUE} />}
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
