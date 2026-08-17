import { View, Text, Pressable, Alert } from 'react-native';
import { AlertOctagon } from 'lucide-react-native';
import { router } from 'expo-router';
import { GP } from './seniorTheme';

// Emergency SOS — UI-only today: sosActive just flips local state and
// "Call Family" routes to chat. There is no actual alert dispatch to other
// family members yet. Preserved exactly as the original behavior; wiring up
// a real dispatch is a product decision, not part of this refactor.
export function EmergencySosCard({ sosActive, setSosActive, colors, isDark }: {
  sosActive: boolean;
  setSosActive: (v: boolean) => void;
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
        <Pressable onPress={() => Alert.alert(
          'Send Emergency SOS?',
          'This will immediately alert all family members with your location.',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Send SOS', style: 'destructive', onPress: () => setSosActive(true) }]
        )} style={{ borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: isDark ? '#1A0000' : '#FFF1F1', borderWidth: 2, borderColor: colors.danger + '50' }}>
          <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
            <AlertOctagon size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: GP.sub, fontWeight: '900', color: colors.danger }}>Emergency SOS</Text>
            <Text style={{ fontSize: GP.tiny, color: colors.textSecondary, marginTop: 2 }}>Alert family + share location instantly</Text>
          </View>
          <View style={{ backgroundColor: colors.danger + '20', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: colors.danger }}>Hold</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
