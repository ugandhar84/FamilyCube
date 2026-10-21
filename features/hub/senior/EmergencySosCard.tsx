import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { AlertOctagon } from 'lucide-react-native';
import { GP } from './seniorTheme';

// Emergency SOS — onTriggerSos actually dispatches a real notification
// (SeniorView.tsx's triggerSos, routed through sendRequest →
// notifyKidRequest → family-notifier, same path every other kid request
// uses) fanned out to parents + grandparents with the sender's live
// location. Previously sosActive only ever flipped local component state
// while the copy below claimed family had been notified with location —
// a real false promise for a safety-critical feature.
export function EmergencySosCard({ sosActive, setSosActive, onTriggerSos, sosSending, colors, isDark, sos, helperName, acceptedAt, onCancelSos }: {
  sosActive: boolean;
  setSosActive: (v: boolean) => void;
  onTriggerSos: () => void;
  sosSending: boolean;
  colors: any; isDark: boolean;
  /** This person's open SOS (pending or accepted), from the request table. */
  sos?: { id: string; status: string } | null;
  /** Who accepted it, and when (12-hour text), once someone has. */
  helperName?: string; acceptedAt?: string;
  onCancelSos?: (id: string) => void;
}) {
  const accepted = sos?.status === 'approved';
  const showActive = sosActive || !!sos;
  const cancel = () => { if (sos && onCancelSos) onCancelSos(sos.id); setSosActive(false); };
  return (
    <View style={{ paddingHorizontal: 16 }}>
      {showActive ? (
        <View style={{ borderRadius: 20, backgroundColor: '#450A0A', borderWidth: 2, borderColor: colors.danger, padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AlertOctagon size={16} color={colors.danger} />
            <Text style={{ fontSize: GP.body, fontWeight: '900', color: '#FCA5A5', flex: 1 }}>{accepted ? `${helperName ?? 'Someone'} is coming to help` : 'SOS sent to your family'}</Text>
            <Pressable onPress={cancel} style={{ backgroundColor: colors.danger + '30', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: colors.danger }}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: GP.sub, color: '#F87171', lineHeight: 19 }}>
            {accepted
              ? `${helperName ?? 'A family member'} accepted your SOS${acceptedAt ? ` at ${acceptedAt}` : ''} and is on the way.\nStay where you are.`
              : 'Your family has been alerted. Waiting for someone to accept. If it is urgent, call them now.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={cancel} style={{ flex: 1, borderRadius: 12, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '40', paddingVertical: 14, alignItems: 'center' }}>
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
