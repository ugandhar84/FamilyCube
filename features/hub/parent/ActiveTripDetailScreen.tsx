import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useEventStore } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { RADIUS } from '@/constants/theme';

const STAGES = ['Assigned', 'En route', 'Picked up', 'Arrived'] as const;
type RideStage = typeof STAGES[number];

function stageIndex(driverStatus?: string): number {
  switch (driverStatus) {
    case 'confirmed': return 1;
    case 'picked_up': return 2;
    case 'arrived':   return 3;
    default:          return 0;
  }
}

function MemberAvatar({ name, size, bg, colors }: { name: string; size: number; bg: string; colors: any }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.4, fontWeight: '700' }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function ActiveTripDetailScreen({ eventId, onClose }: {
  eventId: string;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const events = useEventStore(s => s.events);
  const members = useFamilyStore(s => s.members);
  const [etaNote, setEtaNote] = useState('');

  const event = Object.values(events).flat().find(e => e.id === eventId);

  const cardBorder = {
    borderWidth: 1,
    borderColor: isDark ? colors.border : 'rgba(223,97,60,0.10)',
  };

  if (!event) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.textTertiary, fontSize: 15 }}>Trip not found</Text>
        <Pressable onPress={onClose} style={{ marginTop: 20 }}>
          <Text style={{ color: colors.teal, fontSize: 15, fontWeight: '600' }}>← Go back</Text>
        </Pressable>
      </View>
    );
  }

  const driver = members.find(m => m.id === event.driverId);
  const driverName = driver?.name ?? event.driverName ?? 'Unassigned';
  const driverInitial = driverName.charAt(0).toUpperCase();

  const helper = members.find(m => m.id === event.helperId);
  const helperName = helper?.name ?? event.helper ?? null;

  const activeStage = stageIndex(event.driverStatus);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 24, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back link */}
      <Pressable onPress={onClose}>
        <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '500' }}>← Active trip</Text>
      </Pressable>

      {/* Title + status */}
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 29, fontWeight: '700', letterSpacing: -0.5, lineHeight: 36 }}>
          {event.title}
        </Text>
        <View style={{
          alignSelf: 'flex-start',
          backgroundColor: colors.primaryLight,
          borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5,
        }}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Active now</Text>
        </View>
      </View>

      {/* Route schematic card */}
      <View style={{
        backgroundColor: colors.tealLight, borderRadius: RADIUS.xxl,
        padding: 20, gap: 16, ...cardBorder,
      }}>
        <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '600' }}>Route</Text>

        {/* From */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal }} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '400' }}>
            Departure
          </Text>
        </View>

        {/* Connector */}
        <View style={{ width: 2, height: 20, backgroundColor: colors.border, marginLeft: 3 }} />

        {/* To */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.primary }} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '400' }}>
            {event.location ?? 'Destination'}
          </Text>
        </View>

        {/* ETA */}
        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '500', marginTop: 4 }}>
          ETA: {event.time ?? 'Updating...'}
        </Text>
      </View>

      {/* Progress track */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {STAGES.map((_, i) => (
            <View key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              backgroundColor: i < activeStage
                ? colors.teal
                : i === activeStage
                  ? colors.primary
                  : colors.surface,
            }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row' }}>
          {STAGES.map((stage, i) => (
            <Text key={i} style={{
              flex: 1, textAlign: 'center',
              fontSize: 9, fontWeight: '400',
              color: i <= activeStage ? colors.textSecondary : colors.textTertiary,
            }}>
              {stage}
            </Text>
          ))}
        </View>
      </View>

      {/* People card */}
      <View style={{
        backgroundColor: colors.card, borderRadius: RADIUS.xxl,
        padding: 18, gap: 12, ...cardBorder,
      }}>
        {/* Driver row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <MemberAvatar name={driverName} size={36} bg={colors.primary} colors={colors} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{driverName}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '400' }}>Driver</Text>
          </View>
          <View style={{
            backgroundColor: colors.primaryLight, borderRadius: 100,
            paddingHorizontal: 8, paddingVertical: 3,
          }}>
            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>Driver</Text>
          </View>
        </View>

        {/* Divider */}
        {(helperName ?? false) && (
          <View style={{ height: 1, backgroundColor: isDark ? colors.border : 'rgba(44,39,34,0.06)' }} />
        )}

        {/* Helper row */}
        {helperName ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MemberAvatar name={helperName} size={28} bg={colors.surface} colors={colors} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '500' }}>{helperName}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '400' }}>Helper</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* ETA update field */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '500' }}>Update ETA</Text>
        <TextInput
          value={etaNote}
          onChangeText={setEtaNote}
          placeholder="e.g. 5 minutes away"
          placeholderTextColor={colors.textTertiary}
          style={{
            backgroundColor: colors.surface, borderRadius: RADIUS.md,
            padding: 12, fontSize: 15, color: colors.textPrimary,
            ...cardBorder,
          }}
        />
      </View>

      {/* Primary action */}
      <Pressable
        onPress={onClose}
        style={{
          backgroundColor: colors.primary, borderRadius: RADIUS.md,
          paddingVertical: 16, alignItems: 'center',
          shadowColor: colors.primary, shadowOpacity: 0.25,
          shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>
          Mark as picked up →
        </Text>
      </Pressable>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}
