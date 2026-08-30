import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image, Modal,
  KeyboardAvoidingView, ScrollView, Platform, Keyboard, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import type { Quest } from '@/store/questStore';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

interface Props {
  submitTarget: Quest | null;
  closeSubmitSheet: () => void;
  submissionNote: string;
  setSubmissionNote: (v: string) => void;
  submissionPhotoUri: string | null;
  setSubmissionPhotoUri: (v: string | null) => void;
  selectProofPhoto: (fromCamera: boolean) => void;
  submitWithProof: () => void;
  isUploadingProof?: boolean;
  proofPhotoViewerUri: string | null;
  setProofPhotoViewerUri: (v: string | null) => void;
  colors: any;
  isDark: boolean;
}

// Submit-proof bottom sheet + full-screen photo viewer modal.
export function SubmitQuestSheet({
  submitTarget, closeSubmitSheet, submissionNote, setSubmissionNote,
  submissionPhotoUri, setSubmissionPhotoUri, selectProofPhoto, submitWithProof, isUploadingProof,
  proofPhotoViewerUri, setProofPhotoViewerUri, colors, isDark,
}: Props) {
  const dismiss = () => { Keyboard.dismiss(); closeSubmitSheet(); };
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(90);

  return (
    <>
      <Modal visible={!!submitTarget} transparent animationType="slide" onRequestClose={dismiss}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
            <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, overflow: 'hidden',
              maxHeight: keyboardAwareMaxHeight ?? '90%', backgroundColor: colors.card }}>

              {/* Drag handle */}
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

              {/* Fixed header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
                borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>Submit quest</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 2, color: BRAND.purple }}>
                    {submitTarget?.photoRequired ? 'A photo is required for this chore.' : 'Add a completion note or photo if helpful.'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={dismiss}
                  hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Scrollable body */}
              <ScrollView
                keyboardShouldPersistTaps="always"
                contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}>
                <View style={{ gap: 14 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
                    {submitTarget?.title}
                  </Text>

                  <View>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                      Completion note (optional)
                    </Text>
                    <TextInput
                      value={submissionNote}
                      onChangeText={setSubmissionNote}
                      placeholder="Tell your family what you finished…"
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      style={{ minHeight: 80, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
                        backgroundColor: isDark ? colors.surface : '#F8FAFC', padding: 13,
                        fontSize: TYPO.body, color: colors.textPrimary, textAlignVertical: 'top' }}
                    />
                  </View>

                  <View>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                      Photo proof {submitTarget?.photoRequired ? '(required)' : '(optional)'}
                    </Text>
                    {submissionPhotoUri ? (
                      <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                        <Image source={{ uri: submissionPhotoUri }} style={{ width: '100%', height: 180 }} resizeMode="cover" />
                        <TouchableOpacity onPress={() => setSubmissionPhotoUri(null)}
                          style={{ alignItems: 'center', paddingVertical: 10, backgroundColor: isDark ? colors.surface : '#F8FAFC' }}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>Remove photo</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ borderRadius: 14, padding: 13, borderWidth: 1.5, borderStyle: 'dashed', borderColor: submitTarget?.photoRequired ? '#F59E0B' : colors.border,
                        backgroundColor: submitTarget?.photoRequired ? '#FEF3C710' : 'transparent' }}>
                        <Text style={{ fontSize: TYPO.label, color: submitTarget?.photoRequired ? '#D97706' : colors.textTertiary, textAlign: 'center' }}>
                          {submitTarget?.photoRequired ? 'Attach a photo to unlock submission.' : 'No photo attached yet.'}
                        </Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <TouchableOpacity onPress={() => selectProofPhoto(true)}
                        style={{ flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingVertical: 12 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>📷 Camera</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => selectProofPhoto(false)}
                        style={{ flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingVertical: 12 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>🖼️ Gallery</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </ScrollView>

              {/* Sticky footer */}
              <View style={{ padding: 16, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <TouchableOpacity
                  onPress={submitWithProof}
                  disabled={(submitTarget?.photoRequired && !submissionPhotoUri) || isUploadingProof}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    borderRadius: 14, paddingVertical: 14,
                    backgroundColor: (submitTarget?.photoRequired && !submissionPhotoUri) || isUploadingProof ? colors.border : BRAND.purple }}>
                  {isUploadingProof && <ActivityIndicator color={colors.textTertiary} size="small" />}
                  <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: (submitTarget?.photoRequired && !submissionPhotoUri) || isUploadingProof ? colors.textTertiary : '#fff' }}>
                    {isUploadingProof ? 'Uploading photo…' : 'Submit for review'}
                  </Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full-screen review of a submitted photo proof */}
      <Modal
        visible={!!proofPhotoViewerUri}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setProofPhotoViewerUri(null)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setProofPhotoViewerUri(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center', alignItems: 'center' }}>
          {proofPhotoViewerUri && (
            <Image source={{ uri: proofPhotoViewerUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          )}
          <View style={{ position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>Close ✕</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
