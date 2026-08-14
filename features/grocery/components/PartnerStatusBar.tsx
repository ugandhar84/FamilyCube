import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';

interface PresencePayload {
  memberId: string;
  name: string;
  store?: string;
}

interface PartnerStatusBarProps {
  familyId: string;
  currentMemberId: string;
  colors: any;
  isDark: boolean;
}

export function PartnerStatusBar({ familyId, currentMemberId, colors, isDark }: PartnerStatusBarProps) {
  const [onlinePartners, setOnlinePartners] = useState<PresencePayload[]>([]);
  const channelRef = useRef<any>(null);
  const members = useFamilyStore(s => s.members);

  const me = members.find(m => m.id === currentMemberId);

  useEffect(() => {
    if (!familyId || !currentMemberId) return;

    const channel = supabase.channel(`grocery_presence:${familyId}`, {
      config: { presence: { key: currentMemberId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePayload>();
        const others = Object.entries(state)
          .filter(([key]) => key !== currentMemberId)
          .flatMap(([, presences]) => presences)
          .slice(0, 3);
        setOnlinePartners(others);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            memberId: currentMemberId,
            name: me?.name ?? 'Someone',
            store: undefined,
          } as PresencePayload);
        }
      });

    channelRef.current = channel;
    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [familyId, currentMemberId]);

  if (onlinePartners.length === 0) return null;

  const bg = isDark ? '#052E16' : '#F0FDF4';
  const border = isDark ? '#14532D' : '#A7F3D0';

  return (
    <View
      style={{
        marginHorizontal: 14,
        marginBottom: 10,
        borderRadius: 10,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 12 }}>🟢</Text>
      <Text style={{ fontSize: 13, color: isDark ? '#86EFAC' : '#15803D', fontWeight: '600', flex: 1 }}>
        {onlinePartners.map(p => {
          const firstName = p.name?.split(' ')[0] ?? 'Partner';
          return p.store ? `${firstName} is shopping at ${p.store}` : `${firstName} is online`;
        }).join(' · ')}
      </Text>
    </View>
  );
}
