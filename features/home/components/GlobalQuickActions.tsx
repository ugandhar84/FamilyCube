import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { showUpgradeAlert } from '@/lib/subscription';

interface GlobalQuickActionsProps {
  quickActions: any[];
  tier: string;
  setPendingActionRoute: (route: string) => void;
  setShowPetSelector: (show: boolean) => void;
  colors: any;
  s: any;
}

export const GlobalQuickActions = React.memo(function GlobalQuickActions({
  quickActions, tier, setPendingActionRoute, setShowPetSelector, colors, s,
}: GlobalQuickActionsProps) {
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
      <Text style={s.sectionTitle}>Quick actions</Text>
      <View style={s.actionsGrid}>
        {quickActions.map((a) => (
          <TouchableOpacity
            key={a.label}
            style={[s.actionGridCard, { backgroundColor: a.bg, borderColor: a.border }]}
            onPress={() => {
              if (a.ultimateOnly && tier !== 'ultimate') {
                showUpgradeAlert({ title: a.paywall?.headline, message: a.paywall?.body, perks: a.paywall?.perks, requiredTier: 'ultimate' });
                return;
              }
              setPendingActionRoute(a.route);
              setShowPetSelector(true);
            }}
            activeOpacity={0.8}
          >
            <View style={s.actionGridIcon}>{a.icon}</View>
            <Text style={[s.actionGridLabel, { color: colors.textPrimary }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});
