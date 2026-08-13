import {
  View, Text, Modal, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, CheckCircle, AlertTriangle, Clock, Lock, Sparkles } from 'lucide-react-native';
import { BRAND } from '../tabs/shared';
import { MedRecord, AiAnalysis, URGENCY_META } from './types';

interface Props {
  rec:       MedRecord;
  analysis:  AiAnalysis;
  approving: boolean;
  onApprove: () => void;
  onDismiss: () => void;
}

export default function AiReviewSheet({ rec, analysis, approving, onApprove, onDismiss }: Props) {
  const insets  = useSafeAreaInsets();
  const urgMeta = URGENCY_META[analysis.urgency ?? 'routine'];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' }}>
        <View style={{
          backgroundColor: '#0F0F1A',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          maxHeight: '92%',
          paddingBottom: insets.bottom + 8,
        }}>
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#333' }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 20, paddingBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <Sparkles size={13} color={BRAND.teal} />
                <Text style={{ fontSize: 10, fontWeight: '900', color: BRAND.teal, letterSpacing: 0.8 }}>
                  AI ANALYSIS READY
                </Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff' }} numberOfLines={2}>
                {rec.title}
              </Text>
            </View>
            <TouchableOpacity onPress={onDismiss}
              style={{ padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <X size={16} color="#888" />
            </TouchableOpacity>
          </View>

          <View style={{ height: 1, backgroundColor: '#1E1E2E', marginHorizontal: 20 }} />

          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 14 }}>

            {/* Urgency banner */}
            {analysis.urgency !== 'routine' && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                backgroundColor: urgMeta.color + '18', borderRadius: 14, padding: 14,
                borderWidth: 1, borderColor: urgMeta.color + '50' }}>
                <AlertTriangle size={16} color={urgMeta.color} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: urgMeta.color, marginBottom: 3 }}>
                    {analysis.urgency === 'urgent' ? 'Urgent — action required' : 'Requires attention'}
                  </Text>
                  {analysis.urgency_reason ? (
                    <Text style={{ fontSize: 12, color: urgMeta.color + 'CC', lineHeight: 17 }}>
                      {analysis.urgency_reason}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}

            {/* Summary */}
            <View style={{ backgroundColor: '#1A1A2E', borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#666', letterSpacing: 0.8, marginBottom: 8 }}>
                SUMMARY
              </Text>
              <Text style={{ fontSize: 14, color: '#E0E0E0', lineHeight: 21 }}>
                {analysis.summary}
              </Text>
            </View>

            {/* Key findings */}
            {analysis.key_findings?.length > 0 && (
              <View style={{ backgroundColor: '#1A1A2E', borderRadius: 14, padding: 14, gap: 10 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: '#666', letterSpacing: 0.8 }}>
                  KEY FINDINGS
                </Text>
                {analysis.key_findings.map((f, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3,
                      backgroundColor: BRAND.teal, marginTop: 6 }} />
                    <Text style={{ fontSize: 13, color: '#C8C8D0', flex: 1, lineHeight: 19 }}>{f}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Follow-up */}
            {analysis.follow_up_items?.length > 0 && (
              <View style={{ backgroundColor: '#1A1A2E', borderRadius: 14, padding: 14, gap: 10 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: '#666', letterSpacing: 0.8 }}>
                  FOLLOW-UP ACTIONS
                </Text>
                {analysis.follow_up_items.map((f, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <Clock size={13} color={BRAND.amber} style={{ marginTop: 2 }} />
                    <Text style={{ fontSize: 13, color: '#C8C8D0', flex: 1, lineHeight: 19 }}>{f}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Tags */}
            {analysis.tags?.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {analysis.tags.map(t => (
                  <View key={t} style={{ borderRadius: 8, borderWidth: 1,
                    borderColor: BRAND.teal + '50', backgroundColor: BRAND.teal + '15',
                    paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.teal }}>{t}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Privacy */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Lock size={11} color="#555" />
              <Text style={{ fontSize: 11, color: '#555', fontStyle: 'italic', flex: 1 }}>
                Patient name anonymized before analysis · approving saves this encrypted to your vault
              </Text>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12,
            borderTopWidth: 1, borderTopColor: '#1E1E2E' }}>
            <TouchableOpacity onPress={onDismiss} disabled={approving}
              style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: '#333',
                paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#888' }}>Dismiss</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onApprove} disabled={approving}
              style={{ flex: 2, borderRadius: 14, backgroundColor: BRAND.teal,
                paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 8, opacity: approving ? 0.65 : 1 }}>
              {approving
                ? <ActivityIndicator size="small" color="#fff" />
                : <CheckCircle size={16} color="#fff" />}
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>
                {approving ? 'Saving…' : 'Approve & Save to Vault'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
