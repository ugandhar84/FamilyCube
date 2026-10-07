/**
 * DispatchRideSheet — bottom-sheet modal for dispatching a new pickup/ride.
 *
 * Figma node 90:10318 "Dispatch new pickup · Mobile", re-skinned in the
 * Kinfolk palette. Uses AppBottomSheet for consistent keyboard handling.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useTripStore } from '@/store/tripStore';
import { useEventStore } from '@/store/eventStore';
import { TYPO, RADIUS } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DispatchRideSeed {
  title: string;
  memberId?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onDispatched?: (tripId: string) => void;
  onConvertToChore?: (seed: DispatchRideSeed) => void;
  seedMemberId?: string;
  seedEventId?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function memberInitial(name: string): string {
  return (name ?? '?').charAt(0).toUpperCase();
}

function formatDateChip(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTimeChip(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60000);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface MemberChipProps {
  name: string;
  selected: boolean;
  roleColor: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}

function MemberChip({ name, selected, roleColor, onPress, colors }: MemberChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.memberChip,
        {
          borderColor: selected ? roleColor : `rgba(223,97,60,0.10)`,
          borderWidth: selected ? 2 : 1,
          backgroundColor: selected ? colors.primaryLight : colors.surface,
        },
      ]}>
      <View
        style={[
          styles.memberChipAvatar,
          { backgroundColor: selected ? roleColor : colors.border },
        ]}>
        <Text style={[styles.memberChipInitial, { color: '#FFFFFF' }]}>
          {memberInitial(name)}
        </Text>
      </View>
      <Text
        style={[
          styles.memberChipName,
          { color: selected ? roleColor : colors.textSecondary },
        ]}
        numberOfLines={1}>
        {name.split(' ')[0]}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DispatchRideSheet({
  visible,
  onClose,
  onDispatched,
  onConvertToChore,
  seedMemberId,
  seedEventId,
}: Props) {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const familyName = useFamilyStore(s => s.familyName);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const activeMember = members.find(m => m.id === activeMemberId);
  const events = useEventStore(s => s.events);

  // Member role groups
  const ridableKids = members.filter(m => (m.role === 'kid' || m.role === 'teen') && !m.deletedAt);
  const driverCandidates = members.filter(m => m.role === 'parent' && !m.deletedAt);

  // Linked event (if seedEventId provided)
  const linkedEvent = seedEventId ? events.find(e => e.id === seedEventId) : undefined;
  const eventPending = linkedEvent?.approvalPending ?? false;

  // Form state
  const [selectedChildId, setSelectedChildId] = useState<string | null>(seedMemberId ?? null);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState(linkedEvent?.location ?? '');
  const [rideDate, setRideDate] = useState(new Date());
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedHelperId, setSelectedHelperId] = useState<string | null>(null);
  const [etaMins, setEtaMins] = useState('15');
  const [notes, setNotes] = useState('');
  const [dispatching, setDispatching] = useState(false);

  // Seed defaults when props change
  useEffect(() => {
    if (visible) {
      setSelectedChildId(seedMemberId ?? null);
      setToText(linkedEvent?.location ?? '');
      setRideDate(new Date());
      setSelectedDriverId(null);
      setSelectedHelperId(null);
      setFromText('');
      setEtaMins('15');
      setNotes('');
    }
  }, [visible, seedMemberId, seedEventId]);

  const selectedChild = members.find(m => m.id === selectedChildId);
  const selectedDriver = members.find(m => m.id === selectedDriverId);
  const selectedHelper = members.find(m => m.id === selectedHelperId);

  // Helper candidates = anyone not selected as driver (and not the child)
  const helperCandidates = members.filter(
    m => m.id !== selectedDriverId && !m.deletedAt,
  );

  // CTA readiness
  const canDispatch = !!selectedDriverId && !eventPending;

  // familyId derived from any member
  const familyId = members.find(m => m.familyId)?.familyId ?? '';

  async function handleDispatch() {
    if (!canDispatch || !selectedDriverId) return;
    setDispatching(true);
    try {
      const tripStore = useTripStore.getState();
      const parsedEta = parseInt(etaMins, 10);
      await tripStore.dispatch({
        familyId,
        driverMemberId: selectedDriverId,
        pickupMemberId: selectedChildId ?? undefined,
        etaMinutes: isNaN(parsedEta) ? 15 : parsedEta,
        eventId: seedEventId,
      });
      // Get the newly created trip id (most recent for this driver)
      const createdTrip = useTripStore.getState().activeTrips
        .filter(t => t.driverMemberId === selectedDriverId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
      onDispatched?.(createdTrip?.id ?? '');
      onClose();
    } finally {
      setDispatching(false);
    }
  }

  function handleConvert() {
    onConvertToChore?.({
      title: toText || 'Pickup ride',
      memberId: selectedChildId ?? undefined,
    });
    onClose();
  }

  // ── Derived display strings ────────────────────────────────────────────────

  const driverName = selectedDriver?.name ?? 'the driver';
  const helperName = selectedHelper?.name;
  const childName = selectedChild?.name ?? 'the child';

  // ── Color helpers ─────────────────────────────────────────────────────────

  const cardBorder = isDark
    ? `rgba(223,97,60,0.12)`
    : `rgba(223,97,60,0.10)`;

  const cardStyle = [
    styles.card,
    {
      backgroundColor: colors.card,
      borderColor: cardBorder,
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  const footer = (
    <View style={{ gap: 10, paddingTop: 4 }}>
      {/* Primary CTA */}
      <TouchableOpacity
        onPress={handleDispatch}
        disabled={!canDispatch || dispatching}
        activeOpacity={0.82}
        style={[
          styles.ctaPrimary,
          {
            backgroundColor: canDispatch ? colors.primary : colors.surface,
            borderWidth: canDispatch ? 0 : 1,
            borderColor: colors.border,
          },
        ]}>
        <Text
          style={[
            styles.ctaPrimaryText,
            { color: canDispatch ? '#FFFFFF' : colors.textTertiary },
          ]}>
          {canDispatch
            ? dispatching
              ? 'Dispatching…'
              : 'Dispatch ride →'
            : 'Dispatch after event approval'}
        </Text>
      </TouchableOpacity>

      {/* Secondary CTA */}
      <TouchableOpacity
        onPress={handleConvert}
        activeOpacity={0.82}
        style={[
          styles.ctaSecondary,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}>
        <Text style={[styles.ctaSecondaryText, { color: colors.teal }]}>
          Convert to a chore instead →
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>

        {/* ── Fixed page header ── */}
        <View style={[styles.pageHeader, { borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)' }]}>
          <View style={styles.householdRow}>
            <Text style={[styles.householdFamily, { color: colors.textTertiary }]}>
              {familyName?.toUpperCase() ?? 'FAMILY'}
            </Text>
            {activeMember ? (
              <Text style={[styles.householdMember, { color: colors.teal }]}>
                {activeMember.name} · {activeMember.role}
              </Text>
            ) : null}
          </View>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <TouchableOpacity onPress={onClose} style={{ alignSelf: 'flex-start' }}>
                <Text style={[styles.backLink, { color: colors.teal }]}>← Rides</Text>
              </TouchableOpacity>
              <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Arrange a ride</Text>
            </View>
            <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surface }]}>
              <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

      {/* ── Field 1: Who needs a ride? ── */}
      <View style={[cardStyle, { marginTop: 8 }]}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
          Who needs a ride?
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled">
          {ridableKids.map(kid => (
            <MemberChip
              key={kid.id}
              name={kid.name}
              selected={selectedChildId === kid.id}
              roleColor={colors.primary}
              onPress={() =>
                setSelectedChildId(prev => (prev === kid.id ? null : kid.id))
              }
              colors={colors}
            />
          ))}
          {ridableKids.length === 0 && (
            <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
              No kids or teens in this family
            </Text>
          )}
        </ScrollView>

        {/* Linked event chip */}
        {linkedEvent ? (
          <View style={styles.linkedEventRow}>
            <View
              style={[
                styles.linkedEventChip,
                { backgroundColor: colors.amberLight },
              ]}>
              <Text style={[styles.linkedEventText, { color: colors.amber }]}>
                {linkedEvent.title}
              </Text>
            </View>
            {eventPending && (
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: colors.primaryLight },
                ]}>
                <Text style={[styles.statusPillText, { color: colors.primary }]}>
                  Held until event is approved
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {/* ── Field 2: Where and when? ── */}
      <View style={[cardStyle, { marginTop: 12 }]}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
          Where and when?
        </Text>
        <TextInput
          value={fromText}
          onChangeText={setFromText}
          placeholder="Pickup location"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.locationInput,
            { color: colors.textPrimary, borderColor: colors.border },
          ]}
        />
        <View style={styles.arrowRow}>
          <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
        </View>
        <TextInput
          value={toText}
          onChangeText={setToText}
          placeholder="Drop-off destination"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.locationInput,
            { color: colors.textPrimary, borderColor: colors.border },
          ]}
        />
        <View style={styles.timeChipRow}>
          <View
            style={[
              styles.timeChip,
              { backgroundColor: colors.surface },
            ]}>
            <Text style={[styles.timeChipText, { color: colors.textPrimary }]}>
              {formatDateChip(rideDate)}
            </Text>
          </View>
          <View
            style={[
              styles.timeChip,
              { backgroundColor: colors.surface },
            ]}>
            <Text style={[styles.timeChipText, { color: colors.textPrimary }]}>
              {formatTimeChip(rideDate)}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Detail card: Who can drive? ── */}
      <View
        style={[
          styles.detailCard,
          {
            backgroundColor: colors.card,
            borderColor: cardBorder,
          },
        ]}>
        <Text style={[styles.detailCardTitle, { color: colors.textPrimary }]}>
          Who can drive?
        </Text>
        {driverCandidates.map(parent => {
          const isSelected = selectedDriverId === parent.id;
          return (
            <TouchableOpacity
              key={parent.id}
              onPress={() =>
                setSelectedDriverId(prev => (prev === parent.id ? null : parent.id))
              }
              activeOpacity={0.8}
              style={[
                styles.driverRow,
                {
                  backgroundColor: isSelected ? colors.tealLight : colors.tealLight,
                  borderRadius: RADIUS.md,
                  borderWidth: isSelected ? 2 : 0,
                  borderColor: isSelected ? colors.teal : 'transparent',
                },
              ]}>
              <View
                style={[
                  styles.driverAvatar,
                  {
                    backgroundColor: isSelected ? colors.teal : colors.border,
                  },
                ]}>
                <Text style={styles.driverAvatarInitial}>
                  {memberInitial(parent.name)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverName, { color: colors.textPrimary }]}>
                  {parent.name}
                </Text>
                <Text
                  style={[
                    styles.driverAvailText,
                    { color: colors.textSecondary },
                  ]}>
                  Available · tap to select
                </Text>
              </View>
              {isSelected && (
                <View
                  style={[
                    styles.selectedChip,
                    { backgroundColor: colors.tealLight },
                  ]}>
                  <Text style={[styles.selectedChipText, { color: colors.teal }]}>
                    Selected ✓
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        {driverCandidates.length === 0 && (
          <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
            No parents available
          </Text>
        )}
      </View>

      {/* ── Field 3: Helper ── */}
      <View style={[cardStyle, { marginTop: 12 }]}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
          Helper (optional)
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled">
          {helperCandidates.map(m => (
            <MemberChip
              key={m.id}
              name={m.name}
              selected={selectedHelperId === m.id}
              roleColor={colors.teal}
              onPress={() =>
                setSelectedHelperId(prev => (prev === m.id ? null : m.id))
              }
              colors={colors}
            />
          ))}
          {helperCandidates.length === 0 && (
            <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
              No other members available
            </Text>
          )}
        </ScrollView>
      </View>

      {/* ── Field 4: ETA & notes ── */}
      <View style={[cardStyle, { marginTop: 12 }]}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
          ETA &amp; notes
        </Text>
        <View style={styles.etaRow}>
          <TextInput
            value={etaMins}
            onChangeText={setEtaMins}
            keyboardType="number-pad"
            placeholder="15"
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.etaInput,
              {
                color: colors.textPrimary,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          />
          <Text style={[styles.etaLabel, { color: colors.textSecondary }]}>
            mins
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Any notes for the driver?"
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.notesInput,
              {
                color: colors.textPrimary,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          />
        </View>
      </View>

      {/* ── Explanation text ── */}
      <Text style={[styles.explanationText, { color: colors.textSecondary }]}>
        Helper role does not grant driving eligibility. Check each person's
        availability before assigning.
      </Text>

      {/* ── Summary card ── */}
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: colors.tealLight, borderColor: cardBorder },
        ]}>
        <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
          Dispatch summary
        </Text>
        <Text style={[styles.summaryBody, { color: colors.textPrimary }]}>
          {`Once dispatched: assign ${driverName} as driver${helperName ? ` and ${helperName} as helper` : ''}. Notify ${childName} and the family.`}
        </Text>
        <Text style={[styles.summaryFooter, { color: colors.textSecondary }]}>
          Driver confirmation starts the trip. Live progress is visible to
          everyone.
        </Text>
      </View>

      {/* ── Signature ── */}
      <Text style={[styles.signature, { color: colors.textSecondary }]}>
        Connect. Organize. Care. Grow.
      </Text>

      {/* ── Footer CTAs (inline at bottom of scroll) ── */}
      {footer}

        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Page header
  pageHeader: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  pageTitle: {
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 34,
    marginTop: 4,
  },
  backLink: {
    fontSize: 13,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

  // Household chrome
  householdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  householdFamily: {
    fontSize: 11,
    fontWeight: '600',
  },
  householdMember: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Card / field wrapper
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 6,
  },

  // Member chip (child selector, helper selector)
  memberChip: {
    alignItems: 'center',
    borderRadius: 12,
    padding: 8,
    minWidth: 60,
  },
  memberChipAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberChipInitial: {
    fontSize: 16,
    fontWeight: '700',
  },
  memberChipName: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 56,
  },

  // Linked event
  linkedEventRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  linkedEventChip: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  linkedEventText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusPill: {
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Location inputs
  locationInput: {
    fontSize: 14,
    fontWeight: '400',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  arrowRow: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  timeChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  timeChip: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timeChipText: {
    fontSize: 14,
    fontWeight: '400',
  },

  // Driver detail card
  detailCard: {
    borderRadius: 22,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  detailCardTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  driverAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarInitial: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  driverName: {
    fontSize: 15,
    fontWeight: '600',
  },
  driverAvailText: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 1,
  },
  selectedChip: {
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  selectedChipText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // ETA row
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  etaInput: {
    width: 60,
    fontSize: 15,
    fontWeight: '500',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    textAlign: 'center',
  },
  etaLabel: {
    fontSize: 14,
    fontWeight: '400',
  },
  notesInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
  },

  // Explanation
  explanationText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 12,
    lineHeight: 18,
  },

  // Summary card
  summaryCard: {
    borderRadius: 22,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  summaryBody: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  summaryFooter: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },

  // CTAs
  ctaPrimary: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  ctaSecondary: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  ctaSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Misc
  emptyHint: {
    fontSize: 13,
    fontWeight: '400',
    paddingVertical: 8,
  },
  signature: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 4,
  },
});
