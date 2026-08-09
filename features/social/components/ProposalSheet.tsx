import React, { useState } from 'react';
import { TYPO } from '@/constants/theme';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { formatTime } from '@/lib/units';
import BottomSheet from '@/components/BottomSheet';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { NearbyPet } from '@/features/social/types';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

interface ProposalSheetProps {
  visible: boolean;
  target: NearbyPet | null;
  activePetId: string | null;
  myPet?: { species?: string; breed?: string | null } | null;
  onClose: () => void;
  ac: string;
  colors: any;
  setRequestedPets: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  setPlaydateStatuses: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  setOutgoingActiveReqs: React.Dispatch<React.SetStateAction<any[]>>;
}

const makeDefaultFrom = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; };
const makeDefaultTo   = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return d; };

export const ProposalSheet = React.memo(function ProposalSheet({
  visible, target, activePetId, myPet, onClose,
  ac, colors,
  setRequestedPets, setPlaydateStatuses, setOutgoingActiveReqs,
}: ProposalSheetProps) {
  const [proposalFrom,     setProposalFrom]     = useState<Date>(makeDefaultFrom);
  const [proposalTo,       setProposalTo]       = useState<Date>(makeDefaultTo);
  const [proposalLocation, setProposalLocation] = useState('');
  const [proposalNotes,    setProposalNotes]    = useState('');
  const [propPickerTarget, setPropPickerTarget] = useState<'fromDate' | 'fromTime' | 'toTime'>('fromDate');
  const [propShowPicker,   setPropShowPicker]   = useState(false);
  const [sending,          setSending]          = useState(false);

  const speciesMismatch = !!(myPet?.species && target?.species && target.species !== myPet.species);
  const breedMismatch   = !speciesMismatch && !!(myPet?.breed && target?.breed && target.breed !== myPet.breed);

  const sendProposal = async () => {
    if (!activePetId || !target) return;
    const proposed_date     = format(proposalFrom, 'yyyy-MM-dd');
    const proposed_time     = format(proposalFrom, 'HH:mm');
    const proposed_end_time = format(proposalTo,   'HH:mm');
    const proposed_location = proposalLocation.trim() || null;
    const message           = proposalNotes.trim() || null;
    onClose();
    setSending(true);
    setRequestedPets(s => new Map(s).set(target.id, ''));
    setPlaydateStatuses(m => new Map(m).set(target.id, 'pending'));
    try {
      const { data, error } = await supabase.functions.invoke('playdates', {
        body: { action: 'request', from_pet_id: activePetId, to_pet_id: target.id, proposed_date, proposed_time, proposed_end_time, proposed_location, message },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
      if (data?.request_id) {
        setRequestedPets(s => new Map(s).set(target.id, data.request_id));
        setOutgoingActiveReqs(prev => {
          if (prev.some(r => r.id === data.request_id)) return prev;
          return [{
            id: data.request_id,
            to_pet_id: target.id,
            to_pet: { id: target.id, name: target.name, emoji: target.emoji,
                      accent_color: target.accent_color, avatar_url: target.avatar_url, breed: target.breed },
            status: 'pending',
            proposed_date, proposed_time, proposed_end_time, proposed_location, message,
            agreed_date: null, agreed_time: null, agreed_location: null,
            created_at: new Date().toISOString(),
            responder_user_id: null,
          }, ...prev];
        });
      }
      showAlert('Playdate requested! 🐾', `${target.name}'s parent has been notified.`);
    } catch (e: any) {
      setRequestedPets(s => { const n = new Map(s); n.delete(target.id); return n; });
      setPlaydateStatuses(m => { const n = new Map(m); n.delete(target.id); return n; });
      showAlert('Error', e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={target ? `Playdate with ${target.emoji} ${target.name}` : 'Propose Playdate'}
      accent={ac}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, paddingTop: 4, paddingBottom: 8 }}>

        {/* Mismatch banners */}
        {speciesMismatch && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: '#FEF3C7', borderRadius: 12, borderWidth: 1, borderColor: '#FCD34D',
            paddingHorizontal: 14, paddingVertical: 12 }}>
            <Ionicons name="warning-outline" size={16} color="#D97706" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: TYPO.body, color: '#92400E', lineHeight: 20 }}>
              <Text style={{ fontWeight: '700' }}>Different species</Text>
              {' — '}{target?.name} is a {target?.species} and your pet is a {myPet?.species}. You can still send a playdate request!
            </Text>
          </View>
        )}
        {breedMismatch && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: '#FEF3C7', borderRadius: 12, borderWidth: 1, borderColor: '#FCD34D',
            paddingHorizontal: 14, paddingVertical: 12 }}>
            <Ionicons name="warning-outline" size={16} color="#D97706" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: TYPO.body, color: '#92400E', lineHeight: 20 }}>
              <Text style={{ fontWeight: '700' }}>Different breeds</Text>
              {' — '}{target?.name} is a {target?.breed} and your pet is a {myPet?.breed}. You can still send a playdate request!
            </Text>
          </View>
        )}

        {/* WHEN card */}
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: `${ac}30`, overflow: 'hidden', backgroundColor: `${ac}0A` }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 8 }}>
            <Ionicons name="calendar" size={13} color={ac} />
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac }}>WHEN</Text>
          </View>
          <TouchableOpacity onPress={() => { setPropPickerTarget('fromDate'); setPropShowPicker(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              marginHorizontal: 10, marginBottom: 8, backgroundColor: colors.inputBg,
              borderRadius: 12, borderWidth: 1.5,
              borderColor: propPickerTarget === 'fromDate' && propShowPicker ? ac : colors.border,
              paddingHorizontal: 14, paddingVertical: 12 }}>
            <Ionicons name="calendar-outline" size={16} color={ac} />
            <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{format(proposalFrom, 'EEEE, MMMM d, yyyy')}</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginBottom: 12 }}>
            <TouchableOpacity onPress={() => { setPropPickerTarget('fromTime'); setPropShowPicker(true); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                borderColor: propPickerTarget === 'fromTime' && propShowPicker ? ac : colors.border,
                paddingHorizontal: 12, paddingVertical: 12 }}>
              <Ionicons name="time-outline" size={15} color={ac} />
              <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{formatTime(proposalFrom)}</Text>
            </TouchableOpacity>
            <Ionicons name="arrow-forward" size={13} color={colors.textTertiary} />
            <TouchableOpacity onPress={() => { setPropPickerTarget('toTime'); setPropShowPicker(true); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                borderColor: propPickerTarget === 'toTime' && propShowPicker ? ac : colors.border,
                paddingHorizontal: 12, paddingVertical: 12 }}>
              <Ionicons name="time-outline" size={15} color={colors.textTertiary} />
              <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{formatTime(proposalTo)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Place with Apple Maps autocomplete */}
        <LocationAutocompleteInput
          value={proposalLocation}
          onChangeText={setProposalLocation}
          placeholder="Place (optional)"
          accent={ac}
          colors={colors}
        />

        {/* Note */}
        <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
          <TextInput style={{ fontSize: TYPO.body, color: colors.textPrimary, minHeight: 56, textAlignVertical: 'top' }}
            placeholder="Add a note (optional)" placeholderTextColor={colors.placeholder}
            value={proposalNotes} onChangeText={t => setProposalNotes(t.slice(0, 500))}
            multiline blurOnSubmit maxLength={500} />
          <Text style={{ fontSize: 11, color: proposalNotes.length >= 480 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: 2 }}>
            {proposalNotes.length}/500
          </Text>
        </View>

        {/* Summary strip */}
        {(() => {
          const sameDay = format(proposalFrom, 'yyyy-MM-dd') === format(proposalTo, 'yyyy-MM-dd');
          const preview = sameDay
            ? `${format(proposalFrom, 'EEE, MMM d')} · ${formatTime(proposalFrom)} – ${formatTime(proposalTo)}`
            : `${format(proposalFrom, 'MMM d')} · ${formatTime(proposalFrom)} – ${format(proposalTo, 'MMM d')} · ${formatTime(proposalTo)}`;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: `${ac}12`, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: `${ac}25` }}>
              <Text style={{ fontSize: 20 }}>📅</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{preview}</Text>
                {proposalLocation.trim() ? (
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>📍 {proposalLocation.trim()}</Text>
                ) : null}
              </View>
            </View>
          );
        })()}

        {/* Send button */}
        <TouchableOpacity onPress={sendProposal} disabled={sending}
          style={{ backgroundColor: ac, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>Send Proposal</Text>}
        </TouchableOpacity>

        <AppDateTimePicker
          visible={propShowPicker}
          value={propPickerTarget === 'toTime' ? proposalTo : proposalFrom}
          mode={propPickerTarget === 'fromDate' ? 'date' : 'time'}
          minimumDate={propPickerTarget === 'fromDate' ? new Date() : undefined}
          accent={ac}
          onCancel={() => setPropShowPicker(false)}
          onConfirm={(date) => {
            setPropShowPicker(false);
            if (propPickerTarget === 'fromDate') {
              setProposalFrom(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; });
              setProposalTo(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; });
            } else if (propPickerTarget === 'fromTime') {
              const newFrom = new Date(proposalFrom); newFrom.setHours(date.getHours(), date.getMinutes(), 0, 0);
              setProposalFrom(newFrom);
              setProposalTo(prev => { const n = new Date(prev); n.setFullYear(newFrom.getFullYear(), newFrom.getMonth(), newFrom.getDate()); n.setHours(newFrom.getHours() + 1, newFrom.getMinutes(), 0, 0); return n; });
            } else {
              setProposalTo(prev => { const n = new Date(prev); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; });
            }
          }}
        />
      </ScrollView>
    </BottomSheet>
  );
});
