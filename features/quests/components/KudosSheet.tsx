import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, Modal,
  KeyboardAvoidingView, ScrollView, Platform, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';
import type { Quest } from '@/store/questStore';
import { aq } from './AddQuestModal';

interface Props {
  kudosTarget: Quest | null;
  closeKudosSheet: () => void;
  members: any[];
  kudosNote: string;
  setKudosNote: (v: string) => void;
  isSenior: boolean;
  kudosIncludeCoins: boolean;
  setKudosIncludeCoins: (v: boolean | ((p: boolean) => boolean)) => void;
  kudosCoinAmount: number;
  setKudosCoinAmount: (v: number) => void;
  kudosCustomCoins: boolean;
  setKudosCustomCoins: (v: boolean) => void;
  kudosCustomText: string;
  setKudosCustomText: (v: string) => void;
  handleSendKudos: () => void;
  colors: any;
  isDark: boolean;
}

// Kudos sheet — note + (GP-only) optional bonus coins.
// Save button lives inside the scroll body (not a sticky footer) to
// match AddQuestModal/EditQuestModal — that's the pattern AppBottomSheet
// keyboard-avoids correctly; a fixed footer fights the keyboard instead.
export function KudosSheet({
  kudosTarget, closeKudosSheet, members, kudosNote, setKudosNote, isSenior,
  kudosIncludeCoins, setKudosIncludeCoins, kudosCoinAmount, setKudosCoinAmount,
  kudosCustomCoins, setKudosCustomCoins, kudosCustomText, setKudosCustomText,
  handleSendKudos, colors, isDark,
}: Props) {
  const dismiss = () => { Keyboard.dismiss(); closeKudosSheet(); };
  const accent = '#00BBA4';

  return (
    <Modal visible={!!kudosTarget} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12,
            maxHeight: '90%', backgroundColor: colors.card }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>
                  {`🎉 Kudos for ${members.find(m => m.id === kudosTarget?.assignedToId)?.name?.split(' ')[0] ?? 'them'}`}
                </Text>
                {kudosTarget?.title ? (
                  <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 2, color: accent }}>{kudosTarget.title}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}>
              <Text style={[aq.label, { color: colors.textSecondary }]}>Kudos note (optional)</Text>
              <TextInput
                value={kudosNote}
                onChangeText={setKudosNote}
                placeholder="Great job on this one!"
                placeholderTextColor={colors.textTertiary}
                multiline maxLength={140}
                style={[aq.input, { color: colors.textPrimary, borderColor: colors.border,
                  backgroundColor: colors.surface, minHeight: 80, textAlignVertical: 'top' }]}
              />

              {isSenior && (
                <>
                  <Pressable onPress={() => setKudosIncludeCoins(v => !v)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      padding: 12, borderRadius: 14, borderWidth: 1.5, marginBottom: 12,
                      borderColor: kudosIncludeCoins ? '#F59E0B' : colors.border,
                      backgroundColor: kudosIncludeCoins ? '#F59E0B18' : 'transparent' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: kudosIncludeCoins ? '#F59E0B' : colors.textPrimary }}>
                        🪙 Include bonus coins
                      </Text>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary, marginTop: 1 }}>Optional — paid from your GP wallet</Text>
                    </View>
                    <View style={{ width: 40, height: 24, borderRadius: 12,
                      backgroundColor: kudosIncludeCoins ? '#F59E0B' : (isDark ? '#334155' : '#CBD5E1'),
                      justifyContent: 'center', paddingHorizontal: 3 }}>
                      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                        alignSelf: kudosIncludeCoins ? 'flex-end' : 'flex-start' }} />
                    </View>
                  </Pressable>
                  {kudosIncludeCoins && (
                    <View style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {([5, 10, 20] as const).map(amt => (
                          <Pressable key={amt} onPress={() => { setKudosCoinAmount(amt); setKudosCustomCoins(false); }}
                            style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                              borderWidth: 1.5,
                              borderColor: !kudosCustomCoins && kudosCoinAmount === amt ? '#F59E0B' : colors.border,
                              backgroundColor: !kudosCustomCoins && kudosCoinAmount === amt ? '#F59E0B' : 'transparent' }}>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '900',
                              color: !kudosCustomCoins && kudosCoinAmount === amt ? '#fff' : colors.textSecondary }}>+{amt} 🪙</Text>
                          </Pressable>
                        ))}
                        <Pressable onPress={() => setKudosCustomCoins(true)}
                          style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                            borderWidth: 1.5,
                            borderColor: kudosCustomCoins ? '#F59E0B' : colors.border,
                            backgroundColor: kudosCustomCoins ? '#F59E0B' : 'transparent' }}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '900',
                            color: kudosCustomCoins ? '#fff' : colors.textSecondary }}>Custom</Text>
                        </Pressable>
                      </View>
                      {kudosCustomCoins && (
                        <TextInput
                          style={[aq.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, marginTop: 10, marginBottom: 0 }]}
                          keyboardType="number-pad"
                          placeholder="Enter coin amount"
                          placeholderTextColor={colors.textTertiary}
                          value={kudosCustomText}
                          onChangeText={t => setKudosCustomText(t.replace(/[^0-9]/g, ''))}
                          autoFocus
                        />
                      )}
                    </View>
                  )}
                </>
              )}

              <TouchableOpacity onPress={handleSendKudos}
                style={{ backgroundColor: '#00BBA4', borderRadius: 14, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '900' }}>
                  Send Kudos {isSenior && kudosIncludeCoins && (kudosCustomCoins ? kudosCustomText : kudosCoinAmount)
                    ? `· +${kudosCustomCoins ? (parseInt(kudosCustomText, 10) || 0) : kudosCoinAmount} 🪙` : '🎉'}
                </Text>
              </TouchableOpacity>
            </ScrollView>

          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
