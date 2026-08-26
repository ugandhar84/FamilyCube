import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import {
  Pill, Syringe, Trash2, Check, Clock, ChevronDown, ChevronUp,
  User, Calendar, AlertCircle, RefreshCw,
} from 'lucide-react-native';
import { StatusPill, MemberAvatar, EmptyState } from '../shared';
import { Medication, Vaccine, FREQ_LABELS, getCatColors, today } from './types';
import { hf, h } from './styles';

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
  memberName, memberColor, isOverdue,
  expandedId, setExpandedId,
  markTaken, toggleMedActive, deleteMed,
  toggleVax, deleteVax,
  load,
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
  memberName: (id: string) => string; memberColor: (id: string) => string;
  isOverdue: (med: Medication) => boolean;
  expandedId: string | null; setExpandedId: (id: string | null) => void;
  markTaken: (med: Medication) => void;
  toggleMedActive: (med: Medication) => void;
  deleteMed: (id: string) => void;
  toggleVax: (vax: Vaccine) => void;
  deleteVax: (id: string) => void;
  load: () => void;
}) {
  const catColors = getCatColors(colors);
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
        <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '700' }}>
          {healthTab === 'meds'
            ? `${filteredMeds.length} of ${meds.length} medications`
            : `${filteredVaxes.length} of ${vaxes.length} immunizations`}
        </Text>
        <TouchableOpacity onPress={load} style={{ padding: 8, margin: -8 }}>
          <RefreshCw size={14} color={colors.textTertiary} />
        </TouchableOpacity>
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

          return (
            <View key={med.id} style={[h.medCard, {
              backgroundColor: isDark ? colors.card + 'CC' : colors.surface,
              borderColor: isTakenToday ? colors.success + '60' : colors.border,
              opacity: med.is_active === false ? 0.55 : 1,
            }]}>
              <TouchableOpacity onPress={() => setExpandedId(expanded ? null : med.id)}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={[h.pillIcon, { backgroundColor: catColor + '20' }]}>
                    <Pill size={16} color={catColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                      {med.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      {med.dosage} {med.dosage_unit} · {FREQ_LABELS[med.frequency] ?? med.frequency}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                      <MemberAvatar name={memberName(med.member_id)} color={mc} size={20} />
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>{memberName(med.member_id)}</Text>
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
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    {/* Kids can mark taken; parents/seniors get all controls */}
                    <TouchableOpacity onPress={() => markTaken(med)}
                      style={[h.actionBtn, {
                        borderColor: isTakenToday ? colors.success + '60' : colors.danger + '60',
                        backgroundColor: isTakenToday ? colors.success + '15' : colors.danger + '10',
                        flex: 1,
                      }]}>
                      <Check size={14} color={isTakenToday ? colors.success : colors.danger} />
                      <Text style={{ fontSize: 12, fontWeight: '800',
                        color: isTakenToday ? colors.success : colors.danger }}>
                        {isTakenToday ? 'Taken Today' : 'Mark Taken'}
                      </Text>
                    </TouchableOpacity>
                    {!kidView && (
                      <>
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
                        <TouchableOpacity onPress={() => deleteMed(med.id)}
                          style={[h.actionBtn, { borderColor: colors.danger + '50', backgroundColor: colors.danger + '10' }]}>
                          <Trash2 size={14} color={colors.danger} />
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

      {!kidView && healthTab === 'vax' && (filteredVaxes.length === 0
        ? <EmptyState Icon={Syringe} label={vaxes.length === 0 ? 'No vaccine records yet' : 'No results — adjust filters'} colors={colors} />
        : filteredVaxes.map(vax => {
          const mc = memberColor(vax.member_id);
          return (
            <View key={vax.id} style={[h.medCard, {
              backgroundColor: isDark ? colors.card + 'CC' : colors.tealLight,
              borderColor: vax.done ? colors.teal + '60' : colors.border,
            }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={[h.pillIcon, { backgroundColor: colors.teal + '20' }]}>
                  <Syringe size={16} color={colors.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                    {vax.title}
                  </Text>
                  {vax.vaccine_type && (
                    <Text style={{ fontSize: 11, color: colors.teal, fontWeight: '700', marginTop: 2 }}>
                      {vax.vaccine_type.toUpperCase()}
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                    <MemberAvatar name={memberName(vax.member_id)} color={mc} size={20} />
                    <Text style={{ fontSize: 11, color: colors.textTertiary }}>{memberName(vax.member_id)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <View style={h.detailRow}>
                      <Calendar size={11} color={colors.textTertiary} />
                      <Text style={[h.detailText, { color: colors.textTertiary }]}>{vax.date}</Text>
                    </View>
                    {vax.next_due_date && (
                      <View style={h.detailRow}>
                        <Clock size={11} color={colors.amber} />
                        <Text style={[h.detailText, { color: colors.amber }]}>Next: {vax.next_due_date}</Text>
                      </View>
                    )}
                    {vax.series_total > 1 && (
                      <StatusPill label={`Dose ${vax.series_current}/${vax.series_total}`} color={colors.info} />
                    )}
                  </View>
                  {vax.administered_by && (
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>
                      {vax.administered_by}{vax.location ? ` · ${vax.location}` : ''}
                    </Text>
                  )}
                </View>

                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <TouchableOpacity onPress={() => toggleVax(vax)}
                    style={[h.pillIcon, {
                      backgroundColor: vax.done ? colors.teal + '20' : colors.card,
                      borderWidth: 1.5,
                      borderColor: vax.done ? colors.teal + '60' : colors.border,
                    }]}>
                    <Check size={14} color={vax.done ? colors.teal : colors.textTertiary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteVax(vax.id)}>
                    <Trash2 size={14} color={colors.danger + 'AA'} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })
      )}

    </View>
  );
}
