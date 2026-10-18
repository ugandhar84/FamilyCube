/**
 * LinkCalendarScreen — link a school calendar (an .ics / webcal address) or add a country's public holidays.
 * School links are reviewed before anything is added (the next screen lets you pick the children and the events), and a saved
 * link can be synced again later to bring in only what is new. Children at the same school share one link; children at
 * different schools each get their own.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { PUBLIC_HOLIDAY_FEEDS } from '@/lib/icsParse';
import FlyerScreenHeader from './FlyerScreenHeader';

export interface SchoolCalendarLink { id: string; name: string; url: string; member_ids: string[]; last_synced_at: string | null; last_error: string | null }

export default function LinkCalendarScreen({
  colors, isDark, links, kids, busy, errorMsg, onPreview, onSync, onRemove, onHolidays, onClose,
}: {
  colors: any; isDark: boolean;
  links: SchoolCalendarLink[];
  kids: { id: string; name: string }[];
  busy: boolean; errorMsg: string;
  onPreview: (url: string, name: string) => void;
  onSync: (link: SchoolCalendarLink) => void;
  onRemove: (link: SchoolCalendarLink) => void;
  onHolidays: (feed: { key: string; label: string; url: string }) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const border = isDark ? colors.border : GEMINI.border;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const pageBg = isDark ? colors.background : GEMINI.canvas;
  const BLUE = GEMINI.blue;
  const card = { backgroundColor: cardBg, borderRadius: 18, padding: RHYTHM.card, gap: RHYTHM.item, borderWidth: isDark ? 1 : 0, borderColor: border } as const;
  const heading = (t: string) => <Text style={{ fontSize: 14, fontWeight: '800', color: titleC }}>{t}</Text>;
  const firstNames = (ids: string[]) => ids.map(id => kids.find(k => k.id === id)?.name.split(' ')[0]).filter(Boolean).join(', ') || 'No one yet';

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <FlyerScreenHeader colors={colors} isDark={isDark} backLabel="Back" onBack={onClose} title="Link a calendar" subtitle="School dates and public holidays, kept up to date" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingBottom: insets.bottom + RHYTHM.section, gap: RHYTHM.section }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={card}>
          {heading('School calendar link')}
          <Text style={{ fontSize: 13, lineHeight: 19, color: bodyC }}>
            Paste the calendar link from the school or district website (it starts with webcal:// or https:// and often ends in .ics). You choose which children it is for next, so children at different schools each get their own link.
          </Text>
          <TextInput value={url} onChangeText={setUrl} placeholder="Calendar link" placeholderTextColor={bodyC} autoCapitalize="none" autoCorrect={false} keyboardType="url"
            style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: border, paddingHorizontal: 14, color: titleC, backgroundColor: pageBg, fontSize: 14 }} />
          <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. Reynolds Middle School" placeholderTextColor={bodyC}
            style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: border, paddingHorizontal: 14, color: titleC, backgroundColor: pageBg, fontSize: 14 }} />
          <View style={{ flexDirection: 'row', gap: RHYTHM.item }}>
            <TouchableOpacity onPress={async () => { const t = await Clipboard.getStringAsync(); if (t) setUrl(t.trim()); }}
              style={{ flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>Paste</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy || !url.trim()} onPress={() => onPreview(url.trim(), name.trim())}
              style={{ flex: 2, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: BLUE, opacity: busy || !url.trim() ? 0.5 : 1 }}>
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{busy ? 'Reading…' : 'Preview calendar'}</Text>
            </TouchableOpacity>
          </View>
          {!!errorMsg && <Text style={{ fontSize: 13, color: colors.danger }}>{errorMsg}</Text>}
        </View>

        <View style={card}>
          {heading('Public holidays')}
          <Text style={{ fontSize: 13, lineHeight: 19, color: bodyC }}>Adds the country’s public holidays for the next year to the family calendar. Nothing is added until you confirm.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: RHYTHM.inline }}>
            {PUBLIC_HOLIDAY_FEEDS.map(f => (
              <Pressable key={f.key} disabled={busy} onPress={() => onHolidays(f)}
                style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: border, backgroundColor: pageBg, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {links.length > 0 && (
          <View style={card}>
            {heading('Linked calendars')}
            {links.map(l => (
              <View key={l.id} style={{ gap: 6, paddingTop: RHYTHM.inline, borderTopWidth: 1, borderTopColor: border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>{l.name}</Text>
                <Text style={{ fontSize: 12, color: bodyC }}>For {firstNames(l.member_ids)}{l.last_synced_at ? ` · synced ${new Date(l.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</Text>
                {!!l.last_error && <Text style={{ fontSize: 12, color: colors.danger }}>{l.last_error}</Text>}
                <View style={{ flexDirection: 'row', gap: RHYTHM.item }}>
                  <TouchableOpacity disabled={busy} onPress={() => onSync(l)} style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE, opacity: busy ? 0.5 : 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Sync now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={busy} onPress={() => onRemove(l)} style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger }}>Remove link</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <Text style={{ fontSize: 12, color: bodyC }}>Removing a link keeps what was already added.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
