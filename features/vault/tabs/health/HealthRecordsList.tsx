import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import {
  Pill, Syringe, Trash2, Check, Clock, ChevronDown, ChevronUp,
  User, Calendar, AlertCircle, RefreshCw, History, X, XCircle, Square, CheckSquare, Share2,
} from 'lucide-react-native';
import { StatusPill, MemberAvatar, EmptyState } from '../shared';
import { Medication, Vaccine, FREQ_LABELS, getCatColors, today, encodeTakenEntry, formatDoseTime, medicationAdherenceHistory, fmtDateDisplay, DoseAdherence, groupHistoryByDay } from './types';
import { fmtDate } from '@/lib/dates';
import { hf, h } from './styles';
import { showAlert } from '@/components/AppAlert';
import { shareVaccineRecordsPdf } from './vaxPdfExport';

const STATUS_META: Record<DoseAdherence['status'], { label: string; Icon: any }> = {
  taken: { label: 'Taken', Icon: Check },
  missed: { label: 'Missed', Icon: XCircle },
  upcoming: { label: 'Upcoming', Icon: Clock },
};

export default function HealthRecordsList({
  colors, isDark, kidView,
  meds, vaxes, filteredMeds, filteredVaxes,
  healthTab, setHealthTab,
  medSearch, setMedSearch, vaxSearch, setVaxSearch,
  medActiveFilterCount, vaxActiveFilterCount,
  openFilterSheet,
  setShowMedModal, setShowVaxModal,
  medStatusFilter, medMemberFilter, medCatFilter, medRefillSoon, medEscalationOnly,
  vaxStatusFilter, vaxMemberFilter, vaxDueSoonDays,
  clearMedFilters, clearVaxFilters,
  familyName,
  memberName, memberColor, isOverdue,
  expandedId, setExpandedId,
  markTaken, toggleMedActive, deleteMed, deleteMedsBulk,
  toggleVax, deleteVax, deleteVaxesBulk,
  onEditMed, onEditVax,
  load,
  onOpenHistory,
}: {
  colors: any; isDark: boolean; kidView: boolean;
  meds: Medication[]; vaxes: Vaccine[];
  filteredMeds: Medication[]; filteredVaxes: Vaccine[];
  healthTab: 'meds' | 'vax'; setHealthTab: (t: 'meds' | 'vax') => void;
  medSearch: string; setMedSearch: (v: string) => void;
  vaxSearch: string; setVaxSearch: (v: string) => void;
  medActiveFilterCount: number; vaxActiveFilterCount: number;
  openFilterSheet: () => void;
  setShowMedModal: (v: boolean) => void; setShowVaxModal: (v: boolean) => void;
  medStatusFilter: string; medMemberFilter: string[]; medCatFilter: string[];
  medRefillSoon: boolean; medEscalationOnly: boolean;
  vaxStatusFilter: string; vaxMemberFilter: string[]; vaxDueSoonDays: number;
  clearMedFilters: () => void; clearVaxFilters: () => void;
  // Used as the PDF's header title [live-requested: "export or share the
  // vax to a PDF with the nice header and details"]. Optional so a caller
  // that doesn't pass it (none currently) just falls back to a generic
  // title rather than a hard prop-type error.
  familyName?: string;
  memberName: (id: string) => string; memberColor: (id: string) => string;
  isOverdue: (med: Medication) => boolean;
  expandedId: string | null; setExpandedId: (id: string | null) => void;
  markTaken: (med: Medication, time: string | null) => void;
  toggleMedActive: (med: Medication) => void;
  deleteMed: (id: string) => void;
  // Selection-mode bulk delete [live-requested: "implement the multi
  // delete"] — optional so a caller without a bulk handler (none
  // currently) just doesn't get the selection-mode entry point.
  deleteMedsBulk?: (ids: string[]) => void;
  toggleVax: (vax: Vaccine) => void;
  deleteVax: (id: string) => void;
  deleteVaxesBulk?: (ids: string[]) => void;
  // Opens AddMedModal/AddVaxModal seeded with this record for editing
  // [live-requested: "we should have vacc edit feature also once we add"]
  // — optional so a caller that doesn't support editing (none currently,
  // but matches onOpenHistory's own optional pattern) degrades to no tap
  // action rather than a hard prop-type error.
  onEditMed?: (med: Medication) => void;
  onEditVax?: (vax: Vaccine) => void;
  load: () => void;
  // Kiosk overrides this to open its own side KioskFormDrawer instead of
  // this component's own bottom Modal — a phone bottom sheet doesn't fit
  // kiosk's wall-display shell, same reason the Find page's location
  // history got its own kiosk-native drawer shell around the identical
  // real data [live-requested: "show that history side bar"]. Mobile
  // (HealthTab.tsx's real screen) never passes this, so its own Modal
  // below is completely unchanged there.
  onOpenHistory?: (med: Medication) => void;
}) {
  const catColors = getCatColors(colors);
  // Which medication's adherence-history drawer is open, if any — real
  // taken/missed/upcoming log built from taken_dates via
  // medicationAdherenceHistory() [live-requested: "we must show the
  // active medication history like day and take and missing.."].
  const [historyMed, setHistoryMed] = useState<Medication | null>(null);
  const historyDays = historyMed ? groupHistoryByDay(medicationAdherenceHistory(historyMed)) : [];

  // Multi-select delete mode — long-press any row to enter, tap toggles
  // selection, a bottom bar shows "Delete N" [live-requested: "implement
  // the multi delete"]. Tracked per-tab (meds vs vax use separate id sets)
  // so switching tabs doesn't carry over a stale selection into the other
  // list's delete call.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelectedIds(new Set());
    setExpandedId(null);
  };
  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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

  // Grouped vaccine view: Person → Vaccine name → dose dates
  // [live-requested: "we can show by grouping Persona name / Vac name /
  // Date"] — replaces the flat card list per the chosen design.
  const groupedVaxes = useMemo(() => {
    const byMember = new Map<string, Vaccine[]>();
    for (const v of filteredVaxes) {
      const list = byMember.get(v.member_id) ?? [];
      list.push(v);
      byMember.set(v.member_id, list);
    }
    return Array.from(byMember.entries()).map(([memberId, vaxList]) => {
      const byName = new Map<string, Vaccine[]>();
      for (const v of vaxList) {
        const list = byName.get(v.title) ?? [];
        list.push(v);
        byName.set(v.title, list);
      }
      const vaccines = Array.from(byName.entries()).map(([title, doses]) => ({
        title,
        doses: doses.slice().sort((a, b) => b.date.localeCompare(a.date)),
      }));
      return { memberId, vaccines };
    });
  }, [filteredVaxes]);

  const [exportingPdf, setExportingPdf] = useState(false);
  const onSharePdf = async () => {
    if (exportingPdf || filteredVaxes.length === 0) return;
    setExportingPdf(true);
    try {
      await shareVaccineRecordsPdf({
        familyName: familyName ?? 'Family Cube',
        members: groupedVaxes.map(g => ({
          memberId: g.memberId,
          memberName: memberName(g.memberId),
          vaccines: g.vaccines.flatMap(v => v.doses),
        })),
      });
    } catch (e: any) {
      showAlert('Could not share PDF', e?.message ?? 'Something went wrong generating the file.');
    } finally {
      setExportingPdf(false);
    }
  };
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      {/* Flat — no card shell/title/tab-switcher here; "Health & Records"
          and the Medications/Immunizations/Records 3-way switch already
          live in the screen header above this (HealthRecordsScreen.tsx) —
          this component previously duplicated a SECOND Medications/
          Immunizations switch here, stacking two switches on one screen
          (live-reported as confusing). Result count + refresh share one
          row instead of the count sitting far below the refresh icon with
          a dead gap between them (live-reported). No paddingTop here —
          HealthTab.tsx's own AI-pill/search row above this already ends
          with marginBottom, and HealthRecordsScreen.tsx's ScrollView
          already has paddingTop — stacking a third top padding here on
          top of both left a large dead gap before "X of Y" (live-reported). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {selectMode ? (
          <>
            <TouchableOpacity onPress={exitSelectMode} style={{ padding: 8, margin: -8 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }}>
              {selectedIds.size} selected
            </Text>
            <TouchableOpacity
              onPress={confirmBulkDelete}
              disabled={selectedIds.size === 0}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, margin: -8, opacity: selectedIds.size === 0 ? 0.4 : 1 }}
            >
              <Trash2 size={14} color={colors.danger} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.danger }}>Delete</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '700' }}>
              {healthTab === 'meds'
                ? `${filteredMeds.length} of ${meds.length} medications`
                : `${filteredVaxes.length} of ${vaxes.length} immunizations`}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {!kidView && healthTab === 'vax' && filteredVaxes.length > 0 && (
                <TouchableOpacity onPress={onSharePdf} disabled={exportingPdf} style={{ padding: 8, margin: -8, opacity: exportingPdf ? 0.5 : 1 }}>
                  <Share2 size={15} color={colors.teal} />
                </TouchableOpacity>
              )}
              {!kidView && ((healthTab === 'meds' && filteredMeds.length > 0) || (healthTab === 'vax' && filteredVaxes.length > 0)) && (
                <TouchableOpacity onPress={enterSelectMode} style={{ padding: 8, margin: -8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>Select</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={load} style={{ padding: 8, margin: -8 }}>
                <RefreshCw size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* ── Active-filter pill summary (compact, dismissable) ── */}
      {healthTab === 'meds' && medActiveFilterCount > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {medStatusFilter !== 'active' && (
              <View style={[hf.activePill, { borderColor: colors.danger + '60', backgroundColor: colors.danger + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger, textTransform: 'capitalize' }}>{medStatusFilter}</Text>
              </View>
            )}
            {medMemberFilter.map(id => (
              <View key={id} style={[hf.activePill, { borderColor: colors.info + '60', backgroundColor: colors.info + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.info }}>{memberName(id)}</Text>
              </View>
            ))}
            {medCatFilter.map(cat => (
              <View key={cat} style={[hf.activePill, { borderColor: (catColors[cat] ?? colors.danger) + '60', backgroundColor: (catColors[cat] ?? colors.danger) + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: catColors[cat] ?? colors.danger, textTransform: 'capitalize' }}>{cat}</Text>
              </View>
            ))}
            {medRefillSoon && (
              <View style={[hf.activePill, { borderColor: colors.danger + '60', backgroundColor: colors.danger + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger }}>Refill Soon</Text>
              </View>
            )}
            {medEscalationOnly && (
              <View style={[hf.activePill, { borderColor: colors.danger + '60', backgroundColor: colors.danger + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger }}>Escalation</Text>
              </View>
            )}
            <TouchableOpacity onPress={clearMedFilters}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.danger }}>Clear all</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {healthTab === 'vax' && vaxActiveFilterCount > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {vaxStatusFilter !== 'pending' && (
              <View style={[hf.activePill, { borderColor: colors.teal + '60', backgroundColor: colors.teal + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.teal, textTransform: 'capitalize' }}>
                  {vaxStatusFilter === 'due_soon' ? `Due ≤${vaxDueSoonDays}d` : vaxStatusFilter}
                </Text>
              </View>
            )}
            {vaxMemberFilter.map(id => (
              <View key={id} style={[hf.activePill, { borderColor: colors.info + '60', backgroundColor: colors.info + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.info }}>{memberName(id)}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={clearVaxFilters}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.danger }}>Clear all</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Med list */}
      {healthTab === 'meds' && (filteredMeds.length === 0
        ? <EmptyState Icon={Pill} label={meds.length === 0 ? 'No medications yet' : 'No results — adjust filters'} colors={colors} />
        : filteredMeds.map(med => {
          const isTakenToday = med.taken_date === today();
          const overdue     = isOverdue(med);
          const expanded    = expandedId === med.id;
          const catColor    = catColors[med.category] ?? colors.danger;
          const mc          = memberColor(med.member_id);

          const isSelected = selectedIds.has(med.id);

          return (
            <View key={med.id} style={[h.medCard, {
              backgroundColor: isDark ? colors.card + 'CC' : colors.surface,
              borderColor: isSelected ? colors.primary : (isTakenToday ? colors.success + '60' : colors.border),
              borderWidth: isSelected ? 2 : undefined,
              opacity: med.is_active === false ? 0.55 : 1,
            }]}>
              {/* Long-press opens Edit directly — the fastest path to fix a
                  typo/dosage without expanding the card first
                  [live-requested: "make the med and vaccine long press for
                  edit"]. Multi-select for bulk delete has its own explicit
                  "Select" entry point instead (see the count row above). */}
              <TouchableOpacity
                onPress={() => selectMode ? toggleSelected(med.id) : setExpandedId(expanded ? null : med.id)}
                onLongPress={() => !kidView && !selectMode && onEditMed?.(med)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  {selectMode ? (
                    <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                      {isSelected
                        ? <CheckSquare size={20} color={colors.primary} />
                        : <Square size={20} color={colors.textTertiary} />}
                    </View>
                  ) : (
                    <View style={[h.pillIcon, { backgroundColor: catColor + '20' }]}>
                      <Pill size={16} color={catColor} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                      {med.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      {med.dosage} {med.dosage_unit} · {FREQ_LABELS[med.frequency] ?? med.frequency}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                      {/* Avatar only — the name was redundant next to it
                          [live-requested: "we dont need the name right just
                          need the avtar on the card"]. */}
                      <MemberAvatar name={memberName(med.member_id)} color={mc} size={20} />
                      <StatusPill
                        label={med.category}
                        color={catColor}
                      />
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {expanded ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
                    {isTakenToday && <StatusPill label="Taken" color={colors.success} Icon={Check} />}
                    {!isTakenToday && overdue && <StatusPill label="Overdue" color={colors.danger} Icon={AlertCircle} />}
                    {!med.is_active && <StatusPill label="Inactive" color={colors.textTertiary} />}
                  </View>
                </View>
              </TouchableOpacity>

              {expanded && (
                <View style={{ marginTop: 12, gap: 6, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border }}>
                  {med.prescribing_doctor && (
                    <View style={h.detailRow}>
                      <User size={12} color={colors.textTertiary} />
                      <Text style={[h.detailText, { color: colors.textSecondary }]}>Dr. {med.prescribing_doctor}</Text>
                    </View>
                  )}
                  {med.pharmacy && (
                    <View style={h.detailRow}>
                      <AlertCircle size={12} color={colors.textTertiary} />
                      <Text style={[h.detailText, { color: colors.textSecondary }]}>{med.pharmacy}</Text>
                    </View>
                  )}
                  {med.refill_date && (
                    <View style={h.detailRow}>
                      <Calendar size={12} color={colors.textTertiary} />
                      <Text style={[h.detailText, { color: colors.textSecondary }]}>Refill: {med.refill_date}</Text>
                    </View>
                  )}
                  {med.pills_remaining != null && (
                    <View style={h.detailRow}>
                      <Pill size={12} color={colors.textTertiary} />
                      <Text style={[h.detailText, { color: colors.textSecondary }]}>{med.pills_remaining} pills remaining</Text>
                    </View>
                  )}
                  {med.instructions && (
                    <Text style={{ fontSize: 11, color: colors.textTertiary, fontStyle: 'italic' }}>
                      {med.instructions}
                    </Text>
                  )}

                  {/* Audit trail */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {med.assigned_by && (
                      <Text style={h.auditText}>
                        Added by {memberName(med.assigned_by)}
                      </Text>
                    )}
                    {med.modified_by && (
                      <Text style={h.auditText}>
                        · Last updated by {memberName(med.modified_by)}
                        {med.updated_at ? ` on ${new Date(med.updated_at).toLocaleDateString()}` : ''}
                      </Text>
                    )}
                  </View>

                  {/* Action buttons */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {/* Kids can mark taken; parents/seniors get all controls.
                        One button per dose time for a multi-dose med (e.g.
                        twice_daily) instead of one button for the whole day
                        [live-requested: "add extensive like which time slot
                        / part of day they missed", confirmed: "Add one
                        button per dose time"]. */}
                    {(() => {
                      const doseTimes = med.frequency_times?.length ? med.frequency_times : [null];
                      const multiDose = doseTimes.length > 1;
                      const takenSet = new Set(med.taken_dates ?? []);
                      const todayStr = today();
                      return doseTimes.map((time, idx) => {
                        const doseTaken = multiDose
                          ? takenSet.has(encodeTakenEntry(todayStr, time))
                          : isTakenToday;
                        return (
                          <TouchableOpacity key={time ?? idx} onPress={() => markTaken(med, multiDose ? time : null)}
                            style={[h.actionBtn, {
                              borderColor: doseTaken ? colors.success + '60' : colors.danger + '60',
                              backgroundColor: doseTaken ? colors.success + '15' : colors.danger + '10',
                              flex: multiDose ? undefined : 1,
                            }]}>
                            <Check size={14} color={doseTaken ? colors.success : colors.danger} />
                            <Text style={{ fontSize: 12, fontWeight: '800',
                              color: doseTaken ? colors.success : colors.danger }}>
                              {multiDose
                                ? `${formatDoseTime(time as string)}${doseTaken ? ' ✓' : ''}`
                                : (doseTaken ? 'Taken Today' : 'Mark Taken')}
                            </Text>
                          </TouchableOpacity>
                        );
                      });
                    })()}
                    {/* History — real adherence log (taken/missed/upcoming,
                        per dose time), open to kids too since it's
                        read-only, just like the parent-controlled edit
                        buttons below are gated instead. */}
                    <TouchableOpacity onPress={() => onOpenHistory ? onOpenHistory(med) : setHistoryMed(med)}
                      style={[h.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
                      <History size={14} color={colors.textSecondary} />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary }}>History</Text>
                    </TouchableOpacity>
                    {!kidView && (
                      <>
                        {onEditMed && (
                          <TouchableOpacity onPress={() => onEditMed(med)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={[h.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary }}>Edit</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => toggleMedActive(med)}
                          style={[h.actionBtn, {
                            borderColor: med.is_active ? colors.danger + '60' : colors.success + '60',
                            backgroundColor: med.is_active ? colors.danger + '10' : colors.success + '10',
                          }]}>
                          <Text style={{ fontSize: 11, fontWeight: '800',
                            color: med.is_active ? colors.danger : colors.success }}>
                            {med.is_active ? 'Deactivate' : 'Reactivate'}
                          </Text>
                        </TouchableOpacity>
                        {/* hitSlop + extra horizontal padding — was a bare
                            14px icon with no slop, an easy mis-tap target
                            [live-requested: "increase the delete touch
                            area"]. */}
                        <TouchableOpacity onPress={() => deleteMed(med.id)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={[h.actionBtn, { borderColor: colors.danger + '50', backgroundColor: colors.danger + '10', paddingHorizontal: 14 }]}>
                          <Trash2 size={16} color={colors.danger} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}

      {/* Grouped: Person → Vaccine name → dose dates [live-requested: "we
          can show by grouping Persona name / Vac name / Date"] — replaces
          the previous flat one-card-per-dose list. */}
      {!kidView && healthTab === 'vax' && (filteredVaxes.length === 0
        ? <EmptyState Icon={Syringe} label={vaxes.length === 0 ? 'No vaccine records yet' : 'No results — adjust filters'} colors={colors} />
        : groupedVaxes.map(({ memberId, vaccines }) => {
          const mc = memberColor(memberId);
          return (
            <View key={memberId} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <MemberAvatar name={memberName(memberId)} color={mc} size={24} />
                <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary }}>
                  {memberName(memberId)}
                </Text>
              </View>

              {vaccines.map(({ title, doses }) => (
                <View key={title} style={[h.medCard, {
                  backgroundColor: isDark ? colors.card + 'CC' : colors.tealLight,
                  borderColor: colors.border, marginBottom: 8,
                }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <View style={[h.pillIcon, { width: 26, height: 26, backgroundColor: colors.teal + '20' }]}>
                      <Syringe size={13} color={colors.teal} />
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary, flex: 1 }}>
                      {title}
                    </Text>
                    {doses[0]?.vaccine_type && (
                      <Text style={{ fontSize: 10, color: colors.teal, fontWeight: '700' }}>
                        {doses[0].vaccine_type!.toUpperCase()}
                      </Text>
                    )}
                  </View>

                  {doses.map((vax, idx) => {
                    const isSelected = selectedIds.has(vax.id);
                    return (
                      <TouchableOpacity
                        key={vax.id}
                        activeOpacity={onEditVax ? 0.7 : 1}
                        onPress={() => selectMode ? toggleSelected(vax.id) : onEditVax?.(vax)}
                        onLongPress={() => !selectMode && onEditVax?.(vax)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingVertical: 8,
                          borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: colors.border,
                          backgroundColor: isSelected ? colors.primary + '12' : undefined,
                          borderRadius: isSelected ? 8 : undefined,
                        }}
                      >
                        {selectMode ? (
                          <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                            {isSelected
                              ? <CheckSquare size={18} color={colors.primary} />
                              : <Square size={18} color={colors.textTertiary} />}
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => toggleVax(vax)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={[h.pillIcon, {
                              width: 26, height: 26,
                              backgroundColor: vax.done ? colors.teal + '20' : colors.card,
                              borderWidth: 1.5,
                              borderColor: vax.done ? colors.teal + '60' : colors.border,
                            }]}>
                            <Check size={12} color={vax.done ? colors.teal : colors.textTertiary} />
                          </TouchableOpacity>
                        )}

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <View style={h.detailRow}>
                              <Calendar size={11} color={colors.textTertiary} />
                              <Text style={[h.detailText, { color: colors.textTertiary }]}>{fmtDate(vax.date)}</Text>
                            </View>
                            {vax.next_due_date && (
                              <View style={h.detailRow}>
                                <Clock size={11} color={colors.amber} />
                                <Text style={[h.detailText, { color: colors.amber }]}>Next: {fmtDate(vax.next_due_date)}</Text>
                              </View>
                            )}
                            {vax.series_total > 1 && (
                              <StatusPill label={`Dose ${vax.series_current}/${vax.series_total}`} color={colors.info} />
                            )}
                          </View>
                          {vax.administered_by && (
                            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 3 }}>
                              {vax.administered_by}{vax.location ? ` · ${vax.location}` : ''}
                            </Text>
                          )}
                        </View>

                        {!selectMode && (
                          /* hitSlop + extra padding — same bigger-touch-area
                             fix as the medication delete button
                             [live-requested: "increase the delete touch
                             area"]. */
                          <TouchableOpacity onPress={() => deleteVax(vax.id)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={{ padding: 6 }}>
                            <Trash2 size={16} color={colors.danger + 'AA'} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })
      )}

      {/* Adherence history drawer — taken/missed/upcoming per day, broken
          down by dose time for a multi-dose med. Built from the real
          taken_dates column via medicationAdherenceHistory(); "missed"
          only applies once a dose's scheduled time has genuinely passed
          [live-requested: "we must show the active medication history
          like day and take and missing.. I know today we show overdue bit
          for yestdays one we should show missd right if they really
          missed"]. */}
      <Modal visible={!!historyMed} transparent animationType="slide" onRequestClose={() => setHistoryMed(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{
            maxHeight: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            backgroundColor: colors.card, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 24,
          }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary }}>
                  {historyMed?.name} History
                </Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                  {historyMed ? memberName(historyMed.member_id) : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setHistoryMed(null)}
                style={{ padding: 6, borderRadius: 16, backgroundColor: colors.surface }}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {historyDays.length === 0 ? (
                <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingVertical: 24 }}>
                  No history yet
                </Text>
              ) : historyDays.map(({ date, doses }) => (
                <View key={date} style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textTertiary, marginBottom: 6 }}>
                    {fmtDateDisplay(new Date(date + 'T00:00:00'))}
                  </Text>
                  {doses.map((dose, idx) => {
                    const meta = STATUS_META[dose.status];
                    const tint = dose.status === 'taken' ? colors.success
                      : dose.status === 'missed' ? colors.danger
                      : colors.textTertiary;
                    return (
                      <View key={idx} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingVertical: 8, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: colors.border,
                      }}>
                        <meta.Icon size={14} color={tint} />
                        <Text style={{ flex: 1, fontSize: 13, color: colors.textSecondary }}>
                          {dose.time ? formatDoseTime(dose.time) : 'Dose'}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: tint }}>{meta.label}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
