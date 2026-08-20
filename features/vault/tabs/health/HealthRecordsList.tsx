import { View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import {
  Pill, Syringe, Trash2, Check, Clock, ChevronDown, ChevronUp,
  User, Calendar, AlertCircle, X, RefreshCw, SlidersHorizontal,
} from 'lucide-react-native';
import { SCard, CardHeader, StatusPill, MemberAvatar, AddBtn, EmptyState, BRAND } from '../shared';
import { Medication, Vaccine, FREQ_LABELS, CAT_COLORS, today } from './types';
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
  return (
    <SCard colors={colors} isDark={isDark} accent={colors.primary}>
      {/* ── Card header row ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <CardHeader
            Icon={healthTab === 'meds' ? Pill : Syringe}
            iconColor={healthTab === 'meds' ? colors.primary : BRAND.teal}
            title="Health Records"
            colors={colors}
          />
        </View>
        <TouchableOpacity onPress={load} style={{ padding: 8 }}>
          <RefreshCw size={14} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* ── Inner tab switcher — hidden for kids (Medications only) ── */}
      {!kidView && (
      <View style={[hf.innerTabRow, { backgroundColor: isDark ? colors.card : '#F5F3FF', borderColor: colors.border }]}>
        {([
          { id: 'meds', label: 'Medications',   Icon: Pill,    color: colors.primary, count: meds.length },
          { id: 'vax',  label: 'Immunizations', Icon: Syringe, color: BRAND.teal,   count: vaxes.length },
        ] as const).map(t => (
          <TouchableOpacity key={t.id} onPress={() => setHealthTab(t.id)}
            style={[hf.innerTab, { backgroundColor: healthTab === t.id ? t.color : 'transparent', borderRadius: 10 }]}>
            <t.Icon size={13} color={healthTab === t.id ? '#fff' : colors.textSecondary} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: healthTab === t.id ? '#fff' : colors.textSecondary }}>
              {t.label}
            </Text>
            <View style={[hf.tabBadge, { backgroundColor: healthTab === t.id ? 'rgba(255,255,255,0.3)' : colors.border }]}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: healthTab === t.id ? '#fff' : colors.textTertiary }}>
                {t.count}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      )}

      {/* ── Search bar + filter icon ── */}
      {(() => {
        const activeCount = healthTab === 'meds' ? medActiveFilterCount : vaxActiveFilterCount;
        const accentColor = healthTab === 'meds' ? colors.primary : BRAND.teal;
        const placeholder = healthTab === 'meds' ? 'Search medications…' : 'Search vaccines…';
        const currentSearch = healthTab === 'meds' ? medSearch : vaxSearch;
        const setSearch = healthTab === 'meds'
          ? (v: string) => setMedSearch(v)
          : (v: string) => setVaxSearch(v);
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <View style={[hf.searchRow, { flex: 1, borderColor: colors.border,
              backgroundColor: isDark ? colors.card : (healthTab === 'meds' ? '#F5F3FF' : '#F0FDFA80') }]}>
              <TextInput
                value={currentSearch} onChangeText={setSearch}
                placeholder={placeholder} placeholderTextColor={colors.textTertiary}
                style={[hf.searchInput, { color: colors.textPrimary }]}
              />
              {currentSearch.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <X size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter icon button with active-count badge */}
            <TouchableOpacity onPress={openFilterSheet}
              style={[hf.filterIconBtn, {
                borderColor: activeCount ? accentColor : colors.border,
                backgroundColor: activeCount ? accentColor + '15' : 'transparent',
              }]}>
              <SlidersHorizontal size={17} color={activeCount ? accentColor : colors.textSecondary} />
              {activeCount > 0 && (
                <View style={[hf.filterBadge, { backgroundColor: accentColor }]}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: colors.textInverse }}>{activeCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* ── Add button — pinned right below search, not just at the end of
          a potentially long list, so it's reachable without scrolling. ── */}
      {!kidView && (
        <TouchableOpacity
          onPress={() => healthTab === 'meds' ? setShowMedModal(true) : setShowVaxModal(true)}
          style={[hf.topAddBtn, {
            backgroundColor: healthTab === 'meds' ? colors.primary : BRAND.teal,
            marginTop: 10,
          }]}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>
            {healthTab === 'meds' ? '+ Add Medication' : '+ Log Vaccine'}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Active-filter pill summary (compact, dismissable) ── */}
      {healthTab === 'meds' && medActiveFilterCount > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {medStatusFilter !== 'active' && (
              <View style={[hf.activePill, { borderColor: colors.primary + '60', backgroundColor: colors.primary + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'capitalize' }}>{medStatusFilter}</Text>
              </View>
            )}
            {medMemberFilter.map(id => (
              <View key={id} style={[hf.activePill, { borderColor: BRAND.blue + '60', backgroundColor: BRAND.blue + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.blue }}>{memberName(id)}</Text>
              </View>
            ))}
            {medCatFilter.map(cat => (
              <View key={cat} style={[hf.activePill, { borderColor: (CAT_COLORS[cat] ?? colors.primary) + '60', backgroundColor: (CAT_COLORS[cat] ?? colors.primary) + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: CAT_COLORS[cat] ?? colors.primary, textTransform: 'capitalize' }}>{cat}</Text>
              </View>
            ))}
            {medRefillSoon && (
              <View style={[hf.activePill, { borderColor: colors.primary + '60', backgroundColor: colors.primary + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Refill Soon</Text>
              </View>
            )}
            {medEscalationOnly && (
              <View style={[hf.activePill, { borderColor: colors.primary + '60', backgroundColor: colors.primary + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Escalation</Text>
              </View>
            )}
            <TouchableOpacity onPress={clearMedFilters}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>Clear all</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {healthTab === 'vax' && vaxActiveFilterCount > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {vaxStatusFilter !== 'all' && (
              <View style={[hf.activePill, { borderColor: BRAND.teal + '60', backgroundColor: BRAND.teal + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.teal, textTransform: 'capitalize' }}>
                  {vaxStatusFilter === 'due_soon' ? `Due ≤${vaxDueSoonDays}d` : vaxStatusFilter}
                </Text>
              </View>
            )}
            {vaxMemberFilter.map(id => (
              <View key={id} style={[hf.activePill, { borderColor: BRAND.blue + '60', backgroundColor: BRAND.blue + '12' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.blue }}>{memberName(id)}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={clearVaxFilters}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>Clear all</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ── Result count line ── */}
      <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '700', marginTop: 10 }}>
        {healthTab === 'meds'
          ? `${filteredMeds.length} of ${meds.length} medications`
          : `${filteredVaxes.length} of ${vaxes.length} immunizations`}
      </Text>

      {/* Med list */}
      {healthTab === 'meds' && (filteredMeds.length === 0
        ? <EmptyState Icon={Pill} label={meds.length === 0 ? 'No medications yet' : 'No results — adjust filters'} colors={colors} />
        : filteredMeds.map(med => {
          const isTakenToday = med.taken_date === today();
          const overdue     = isOverdue(med);
          const expanded    = expandedId === med.id;
          const catColor    = CAT_COLORS[med.category] ?? colors.primary;
          const mc          = memberColor(med.member_id);

          return (
            <View key={med.id} style={[h.medCard, {
              backgroundColor: isDark ? colors.card + 'CC' : '#F5F3FF80',
              borderColor: isTakenToday ? BRAND.emerald + '60' : colors.border,
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
                    {isTakenToday && <StatusPill label="Taken" color={BRAND.emerald} Icon={Check} />}
                    {!isTakenToday && overdue && <StatusPill label="Overdue" color={BRAND.rose} Icon={AlertCircle} />}
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
                        borderColor: isTakenToday ? BRAND.emerald + '60' : colors.primary + '60',
                        backgroundColor: isTakenToday ? BRAND.emerald + '15' : colors.primary + '10',
                        flex: 1,
                      }]}>
                      <Check size={14} color={isTakenToday ? BRAND.emerald : colors.primary} />
                      <Text style={{ fontSize: 12, fontWeight: '800',
                        color: isTakenToday ? BRAND.emerald : colors.primary }}>
                        {isTakenToday ? 'Taken Today' : 'Mark Taken'}
                      </Text>
                    </TouchableOpacity>
                    {!kidView && (
                      <>
                        <TouchableOpacity onPress={() => toggleMedActive(med)}
                          style={[h.actionBtn, {
                            borderColor: med.is_active ? colors.primary + '60' : BRAND.emerald + '60',
                            backgroundColor: med.is_active ? colors.primary + '10' : BRAND.emerald + '10',
                          }]}>
                          <Text style={{ fontSize: 11, fontWeight: '800',
                            color: med.is_active ? colors.primary : BRAND.emerald }}>
                            {med.is_active ? 'Deactivate' : 'Reactivate'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteMed(med.id)}
                          style={[h.actionBtn, { borderColor: BRAND.rose + '50', backgroundColor: BRAND.rose + '10' }]}>
                          <Trash2 size={14} color={BRAND.rose} />
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

      {healthTab === 'meds' && !kidView && <AddBtn label="Add Medication" onPress={() => setShowMedModal(true)} color={colors.primary} />}

      {!kidView && healthTab === 'vax' && (filteredVaxes.length === 0
        ? <EmptyState Icon={Syringe} label={vaxes.length === 0 ? 'No vaccine records yet' : 'No results — adjust filters'} colors={colors} />
        : filteredVaxes.map(vax => {
          const mc = memberColor(vax.member_id);
          return (
            <View key={vax.id} style={[h.medCard, {
              backgroundColor: isDark ? colors.card + 'CC' : '#F0FDFA80',
              borderColor: vax.done ? BRAND.teal + '60' : colors.border,
            }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={[h.pillIcon, { backgroundColor: BRAND.teal + '20' }]}>
                  <Syringe size={16} color={BRAND.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                    {vax.title}
                  </Text>
                  {vax.vaccine_type && (
                    <Text style={{ fontSize: 11, color: BRAND.teal, fontWeight: '700', marginTop: 2 }}>
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
                        <Clock size={11} color={BRAND.amber} />
                        <Text style={[h.detailText, { color: BRAND.amber }]}>Next: {vax.next_due_date}</Text>
                      </View>
                    )}
                    {vax.series_total > 1 && (
                      <StatusPill label={`Dose ${vax.series_current}/${vax.series_total}`} color={BRAND.blue} />
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
                      backgroundColor: vax.done ? BRAND.teal + '20' : colors.card,
                      borderWidth: 1.5,
                      borderColor: vax.done ? BRAND.teal + '60' : colors.border,
                    }]}>
                    <Check size={14} color={vax.done ? BRAND.teal : colors.textTertiary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteVax(vax.id)}>
                    <Trash2 size={14} color={BRAND.rose + 'AA'} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })
      )}

      {!kidView && healthTab === 'vax' && <AddBtn label="Log Vaccine" onPress={() => setShowVaxModal(true)} color={BRAND.teal} />}
    </SCard>
  );
}
