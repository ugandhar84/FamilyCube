/**
 * HealthAiBanner — CubeAI Health Coach strip for HealthScreen.
 *
 * Collapsed: bot icon + title + pulse dot + Scan button
 * After scan: inline result panel (insights, overdue items, upcoming alerts)
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { supabase } from '@/lib/supabase';

const BotIcon = ({ c }: { c: string }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24">
    <Rect x={3} y={8} width={18} height={13} rx={2} stroke={c} strokeWidth={2} fill="none" />
    <Path d="M9,3 L12,3 M12,3 L15,3 M12,3 L12,8" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    <Circle cx={9} cy={14} r={1.5} fill={c} />
    <Circle cx={15} cy={14} r={1.5} fill={c} />
    <Path d="M9,18 C9,17 10.3,16 12,16 C13.7,16 15,17 15,18" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
  </Svg>
);
const XIcon = ({ c }: { c: string }) => (
  <Svg width={11} height={11} viewBox="0 0 24 24">
    <Path d="M18 6L6 18M6 6l12 12" stroke={c} strokeWidth={2.5} strokeLinecap="round" fill="none" />
  </Svg>
);
const AlertIcon = ({ c }: { c: string }) => (
  <Svg width={13} height={13} viewBox="0 0 24 24">
    <Path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const CheckIcon = ({ c }: { c: string }) => (
  <Svg width={13} height={13} viewBox="0 0 24 24">
    <Path d="M20 6L9 17l-5-5" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

export interface HealthInsight {
  type: 'overdue' | 'upcoming' | 'tip' | 'ok';
  message: string;
}

interface Props {
  petName?: string;
  petId?: string | null;
  overdueVax: number;
  dueSoonVax: number;
  activeMedsCount: number;
  nextApptDate?: string | null;
  colors: any;
  isDark: boolean;
}

export function HealthAiBanner({ petName, petId, overdueVax, dueSoonVax, activeMedsCount, nextApptDate, colors, isDark }: Props) {
  const [scanning, setScanning] = useState(false);
  const [insights, setInsights] = useState<HealthInsight[] | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const runScan = async () => {
    setScanning(true);
    setShowPanel(true);
    try {
      const context = [
        petName ? `Pet: ${petName}` : '',
        overdueVax > 0 ? `${overdueVax} overdue vaccine(s)` : '',
        dueSoonVax > 0 ? `${dueSoonVax} vaccine(s) due within 30 days` : '',
        activeMedsCount > 0 ? `${activeMedsCount} active medication(s)` : '',
        nextApptDate ? `Next appointment: ${nextApptDate}` : 'No upcoming appointments',
      ].filter(Boolean).join('. ');

      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: {
          action: 'health_coach',
          context,
          petId,
        },
      });

      if (error) throw error;
      setInsights(data?.insights ?? buildLocalInsights());
    } catch {
      // Fallback to local rule-based insights
      setInsights(buildLocalInsights());
    } finally {
      setScanning(false);
    }
  };

  const buildLocalInsights = (): HealthInsight[] => {
    const result: HealthInsight[] = [];
    if (overdueVax > 0)
      result.push({ type: 'overdue', message: `${overdueVax} vaccine${overdueVax > 1 ? 's are' : ' is'} overdue — schedule a vet visit soon.` });
    if (dueSoonVax > 0)
      result.push({ type: 'upcoming', message: `${dueSoonVax} vaccine${dueSoonVax > 1 ? 's are' : ' is'} due within 30 days.` });
    if (!nextApptDate)
      result.push({ type: 'upcoming', message: 'No upcoming appointments scheduled — consider a routine checkup.' });
    if (activeMedsCount > 0)
      result.push({ type: 'tip', message: `${activeMedsCount} active medication${activeMedsCount > 1 ? 's' : ''} — keep tracking dosage consistency.` });
    if (result.length === 0)
      result.push({ type: 'ok', message: `${petName ?? 'Your pet'} looks up to date — great job staying on top of their health!` });
    return result;
  };

  const insightColor = (type: HealthInsight['type']) => {
    if (type === 'overdue')  return '#F87171';
    if (type === 'upcoming') return '#FBBF24';
    if (type === 'tip')      return '#60A5FA';
    return '#34D399';
  };

  return (
    <View style={{ marginBottom: 16, borderRadius: 20, backgroundColor: isDark ? '#0D1B2A' : '#0F2027',
      borderWidth: 1, borderColor: isDark ? '#1E3A4A' : '#1A3346', overflow: 'hidden' }}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 10,
          backgroundColor: 'rgba(20,184,166,0.25)', borderWidth: 1, borderColor: 'rgba(20,184,166,0.4)',
          alignItems: 'center', justifyContent: 'center' }}>
          <BotIcon c="#5EEAD4" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>CubeAI Health Coach</Text>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' }} />
          </View>
          <Text style={{ fontSize: TYPO.micro, color: '#94A3B8', marginTop: 1 }}>
            Vaccine, medication & appointment alerts
          </Text>
        </View>
        <TouchableOpacity
          onPress={runScan}
          style={{ backgroundColor: 'rgba(20,184,166,0.2)', borderWidth: 1, borderColor: 'rgba(20,184,166,0.35)',
            borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7,
            flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {scanning
            ? <ActivityIndicator size={11} color="#5EEAD4" />
            : <AlertIcon c="#5EEAD4" />}
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#5EEAD4' }}>Scan</Text>
        </TouchableOpacity>
      </View>

      {/* Inline results panel */}
      {showPanel && (
        <View style={{ borderTopWidth: 1, borderTopColor: '#1E3A4A', padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <BotIcon c="#C4B5FD" />
            <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '900', color: '#C4B5FD' }}>
              Health Report — {petName ?? 'Your Pet'}
            </Text>
            <TouchableOpacity onPress={() => setShowPanel(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5,
                borderRadius: 12, backgroundColor: 'rgba(167,139,250,0.18)' }}>
              <XIcon c="#A78BFA" />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#A78BFA' }}>Close</Text>
            </TouchableOpacity>
          </View>
          {scanning ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
              <ActivityIndicator color={BRAND.teal ?? '#14B8A6'} size="small" />
              <Text style={{ fontSize: TYPO.label, color: '#94A3B8', fontWeight: '600' }}>
                Analysing health records…
              </Text>
            </View>
          ) : insights ? (
            <View style={{ gap: 8 }}>
              {insights.map((ins, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ marginTop: 2 }}>
                    {ins.type === 'ok'
                      ? <CheckIcon c={insightColor(ins.type)} />
                      : <AlertIcon c={insightColor(ins.type)} />}
                  </View>
                  <Text style={{ flex: 1, fontSize: TYPO.label, color: '#CBD5E1', lineHeight: 18 }}>
                    {ins.message}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
