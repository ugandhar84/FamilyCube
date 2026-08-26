import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { AlertOctagon } from 'lucide-react-native';
import { router } from 'expo-router';
import { GP } from './seniorTheme';

// Emergency SOS — onTriggerSos actually dispatches a real notification
// (SeniorView.tsx's triggerSos, routed through sendRequest →
// notifyKidRequest → family-notifier, same path every other kid request
// uses) fanned out to parents + grandparents with the sender's live
// location. Previously sosActive only ever flipped local component state
// while the copy below claimed family had been notified with location —
// a real false promise for a safety-critical feature.
export function EmergencySosCard({ sosActive, setSosActive, onTriggerSos, sosSending, colors, isDark }: {
  sosActive: boolean;
  setSosActive: (v: boolean) => void;
  onTriggerSos: () => void;
  sosSending: boolean;
  colors: any; isDark: boolean;
}) {
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
      {sosActive ? (
        <View style={{ borderRadius: 20, backgroundColor: '#450A0A', borderWidth: 2, borderColor: colors.danger, padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AlertOctagon size={16} color={colors.danger} />
            <Text style={{ fontSize: GP.body, fontWeight: '900', color: '#FCA5A5', flex: 1 }}>SOS Alert Sent to Family</Text>
            <Pressable onPress={() => setSosActive(false)} style={{ backgroundColor: colors.danger + '30', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: colors.danger }}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: GP.sub, color: '#F87171', lineHeight: 19 }}>
            Parents have been notified with your location. Help is on the way.{'\n'}Stay where you are.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => router.push('/(tabs)/chat')} style={{ flex: 1, borderRadius: 12, backgroundColor: colors.danger, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              <Text style={{ fontSize: GP.sub, fontWeight: '800', color: '#fff' }}>Call Family</Text>
            </Pressable>
            <Pressable onPress={() => setSosActive(false)} style={{ flex: 1, borderRadius: 12, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '40', paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: GP.sub, fontWeight: '800', color: '#F87171' }}>I'm OK Now</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable disabled={sosSending} onPress={() => Alert.alert(
          'Send Emergency SOS?',
          'This will immediately alert all family members with your location.',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Send SOS', style: 'destructive', onPress: onTriggerSos }]
        )} style={{ borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: isDark ? '#1A0000' : '#FFF1F1', borderWidth: 2, borderColor: colors.danger + '50', opacity: sosSending ? 0.7 : 1 }}>
          <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
            {sosSending ? <ActivityIndicator color="#fff" /> : <AlertOctagon size={24} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: GP.sub, fontWeight: '900', color: colors.danger }}>Emergency SOS</Text>
            <Text style={{ fontSize: GP.tiny, color: colors.textSecondary, marginTop: 2 }}>Alert family + share location instantly</Text>
          </View>
          <View style={{ backgroundColor: colors.danger + '20', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: colors.danger }}>{sosSending ? 'Sending…' : 'Hold'}</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
