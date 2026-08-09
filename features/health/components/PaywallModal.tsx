import React, { memo } from 'react';
import { Modal, View, Text, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { showUpgradeAlert } from '@/lib/subscription';
import { TYPO } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  accent: string;
  colors: any;
}

const PaywallModal = memo(function PaywallModal({ visible, onClose, accent, colors }: Props) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 28 }}>
          <TouchableWithoutFeedback>
            <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: TYPO.hero }}>🐾</Text>
              </View>
              <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.5 }}>
                Ultimate Feature
              </Text>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>
                AI receipt scanning is exclusive to Ultimate members. Snap a photo of any vet bill, pet store receipt, or grooming invoice — AI extracts and categorizes every line item instantly.
              </Text>
              <View style={{ backgroundColor: colors.border + '88', borderRadius: 14, padding: 14, width: '100%', gap: 8, marginTop: 4 }}>
                {['📄 Auto-extract line items from receipts', '🏷 AI categorizes food, meds, vet & more', '🐕 Assign items to any of your pets', '✏️ Edit anything before saving'].map(f => (
                  <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>{f}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => { onClose(); showUpgradeAlert({ requiredTier: 'ultimate', title: 'Unlock Ultimate', message: 'AI receipt scanning is exclusive to Ultimate members.' }); }}
                style={{ backgroundColor: accent, borderRadius: 14, paddingVertical: 14, width: '100%', alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: '#fff' }}>Unlock Ultimate</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose}>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' }}>Maybe later</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
});

export default PaywallModal;
