/**
 * CallReminderToggle — the alertCall / alertCallLeadMinutes control.
 *
 * Was three separate hand-maintained copies (AddEventModal's Switch-row
 * variant, AddQuestModal's icon+Switch variant, EditQuestModal's byte-
 * identical copy of AddQuestModal's). Same two fields, same [0,10,15,30]
 * lead-time chips, same semantics everywhere — a VoIP-style ringing
 * reminder fired by the call-reminder-sweeper cron, distinct from ordinary
 * push notifications.
 *
 * `variant` preserves the one real visual difference between the two shapes
 * so this is a pure de-duplication with no user-visible change: 'switch'
 * (Schedule form — plain label + Switch) and 'icon' (Chores forms — a
 * tappable call icon + label, plus the Switch).
 */
import React from 'react';
import { View, Text, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

const LEAD_OPTIONS = [0, 10, 15, 30];

export function CallReminderToggle({
  alertCall, setAlertCall,
  alertCallLeadMinutes, setAlertCallLeadMinutes,
  accentColor, colors, isDark,
  variant = 'switch',
  pillStyle,
  containerPaddingHorizontal = 0,
}: {
  alertCall: boolean;
  setAlertCall: React.Dispatch<React.SetStateAction<boolean>>;
  alertCallLeadMinutes: number;
  setAlertCallLeadMinutes: (v: number) => void;
  accentColor: string;
  colors: any; isDark: boolean;
  variant?: 'switch' | 'icon';
  // The chores forms style their lead-time chips with aq.datePill; the
  // schedule form uses f.dateBtn. Passed in so neither changes appearance.
  pillStyle?: any;
  containerPaddingHorizontal?: number;
}) {
  const pillBg  = isDark ? colors.surface : '#F1F5F9';
  const pillBdr = isDark ? colors.border  : '#E2E8F0';

  return (
    <>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: alertCall ? 8 : (variant === 'icon' ? 14 : 16),
        paddingHorizontal: containerPaddingHorizontal,
      }}>
        {variant === 'icon' ? (
          <TouchableOpacity onPress={() => setAlertCall(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name={alertCall ? 'call' : 'call-outline'} size={18} color={alertCall ? accentColor : colors.textSecondary} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>Call to remind</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>📞 Call to remind</Text>
        )}
        <Switch
          value={alertCall}
          onValueChange={setAlertCall}
          trackColor={variant === 'icon' ? { true: accentColor } : { false: colors.border, true: accentColor + '80' }}
          thumbColor={variant === 'icon' ? undefined : (alertCall ? accentColor : colors.textTertiary)}
        />
      </View>

      {alertCall && (
        <View style={{
          flexDirection: 'row', gap: 8,
          marginBottom: variant === 'icon' ? 14 : 16,
          paddingHorizontal: containerPaddingHorizontal,
        }}>
          {LEAD_OPTIONS.map(mins => {
            const active = alertCallLeadMinutes === mins;
            return (
              <TouchableOpacity
                key={mins}
                onPress={() => setAlertCallLeadMinutes(mins)}
                style={[
                  pillStyle,
                  variant === 'switch' ? { flex: 1 } : null,
                  {
                    backgroundColor: active ? accentColor + '20' : pillBg,
                    borderColor: active ? accentColor : pillBdr,
                  },
                ]}
              >
                <Text style={{
                  fontSize: variant === 'icon' ? TYPO.label : TYPO.caption,
                  fontWeight: '700',
                  color: active ? accentColor : colors.textPrimary,
                }}>
                  {mins === 0 ? 'On time' : `${mins} min before`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </>
  );
}
