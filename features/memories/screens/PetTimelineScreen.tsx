import { showAlert } from '@/components/AppAlert';
import { TYPO } from '@/constants/theme';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, Share, StyleSheet, Dimensions, Platform,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { showUpgradeAlert } from '@/lib/subscription';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { FeatureUnavailable } from '@/components/FeatureGate';
import { supabase } from '@/lib/supabase';
import {
  getTimelineEntries,
  generatePetTimeline,
  getGenerationCountsPerYear,
} from '@/lib/db/timeline';
import { DocumentPreview } from '@/features/memories/components/DocumentPreview';
import {
  getTemplateTheme,
  getAvailableYears,
  yearSublabel,
  TimelineTemplate,
} from '@/features/memories/utils';

interface TimelineEntry {
  id: string;
  title: string;
  description: string;
  event_date: string;
  category: 'milestone' | 'health' | 'achievement' | 'moment';
  is_pinned: boolean;
}

const MAX_ATTEMPTS = 4;
const SCREEN_W = Dimensions.get('window').width;

type Range    = 'first_year' | 'year' | 'lifetime';

const TEMPLATES: { id: TimelineTemplate; label: string; colors: [string, string] }[] = [
  { id: 'pastel',    label: 'Mini-Pastel',    colors: ['#B8E8C8', '#C8D8F0'] },
  { id: 'minimal',   label: 'Modern Minimal', colors: ['#F5F5FF', '#EEEEFF'] },
  { id: 'scrapbook', label: 'Bold Scrapbook', colors: ['#2C2C3E', '#1A1A2E'] },
];

export default function PetTimelineScreen() {
  const { colors, isDark } = useTheme();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const timelineEnabled = useFeatureFlag('pet_timeline_enabled', true);

  const [pet, setPet] = useState<{ name: string; avatar_url?: string | null; photo_url?: string | null; emoji?: string | null } | null>(null);
  const [userTier, setUserTier] = useState<'free' | 'pro' | 'ultimate'>('free');
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [genCounts, setGenCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [logoBase64, setLogoBase64] = useState('');
  const [template, setTemplate] = useState<TimelineTemplate>('minimal');
  const [range, setRange] = useState<Range>('year');

  const years = getAvailableYears();
  const [selectedYear, setSelectedYear] = useState(years[0]);

  const load = useCallback(async () => {
    if (!petId) return;
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const [petRow, tierRow, data, counts] = await Promise.all([
        supabase.from('pets').select('name, avatar_url, photo_url, emoji').eq('id', petId).maybeSingle(),
        user
          ? supabase.from('subscriptions').select('tier, status').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        getTimelineEntries(petId, range === 'lifetime' ? undefined : selectedYear),
        getGenerationCountsPerYear(petId),
      ]);
      if (petRow.data) setPet(petRow.data);
      const sub = (tierRow as any)?.data;
      if (sub && (sub.status === 'active' || sub.status === 'grace_period')) {
        setUserTier((sub.tier ?? 'free') as any);
      }
      setEntries(data);
      setGenCounts(counts);
    } catch (err) {
      console.error('[PetTimeline]', err);
    } finally {
      setLoading(false);
    }
  }, [petId, selectedYear, range]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const { Asset } = await import('expo-asset');
        const { readAsStringAsync } = await import('expo-file-system');
        const [asset] = await Asset.loadAsync(require('../../../assets/icon.png'));
        if (asset.localUri) {
          const b64 = await readAsStringAsync(asset.localUri, { encoding: 'base64' });
          setLogoBase64(`data:image/png;base64,${b64}`);
        }
      } catch {}
    })();
  }, []);

  const isProUser    = userTier !== 'free';
  const attemptsUsed = genCounts[selectedYear] ?? 0;
  const isExhausted  = attemptsUsed >= MAX_ATTEMPTS;
  const hasEntries   = entries.length > 0;

  const handleGenerate = useCallback(async () => {
    if (!isProUser) { showUpgradeAlert({ message: 'Upgrade to Pro to generate timelines.' }); return; }
    if (isExhausted) return;
    const doGen = async () => {
      try {
        setGenerating(true);
        await generatePetTimeline(petId!, selectedYear);
        await load();
      } catch (err: any) {
        showAlert('Error', err.message ?? 'Failed to generate');
      } finally { setGenerating(false); }
    };
    if (attemptsUsed === MAX_ATTEMPTS - 1) {
      showAlert('Last attempt', `This is your final generation for ${selectedYear}.`,
        [{ text: 'Cancel', style: 'cancel' }, { text: hasEntries ? 'Regenerate' : 'Generate', onPress: doGen }]);
    } else { doGen(); }
  }, [isProUser, isExhausted, hasEntries, attemptsUsed, selectedYear, petId, load]);

  const buildTimelinePdf = useCallback(async (): Promise<Print.FilePrintResult> => {
    try {
      const th = getTemplateTheme(template);
      const { bg: cream, textColor, subColor, lineColor, dotBg, purple, accent, catColors: CAT_COLORS } = th;

      const dotSvg = (category: string, color: string, hasConnector: boolean) => {
        const iconContent = (() => {
          switch (category) {
            case 'milestone':
              return `<path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" fill="${color}"/><path d="M9 21V12h6v9" fill="white" fill-opacity="0.6"/>`;
            case 'health':
              return `<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" fill="${color}"/>`;
            case 'achievement':
              return `<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" fill="${color}"/>`;
            default:
              return `<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" fill="${color}"/><circle cx="12" cy="13" r="4" fill="white" fill-opacity="0.5"/>`;
          }
        })();
        const connector = hasConnector
          ? `<line x1="13" y1="27" x2="13" y2="2000" stroke="${lineColor}" stroke-width="1"/>`
          : '';
        return `<svg width="26" height="26" overflow="visible" xmlns="http://www.w3.org/2000/svg">
          <rect width="26" height="26" rx="8" fill="${dotBg}"/>
          ${connector}
          <svg x="6" y="6" width="14" height="14" viewBox="0 0 24 24">${iconContent}</svg>
        </svg>`;
      };

      const petTitle = pet?.name ? `${pet.name.toUpperCase()}'S` : "PET'S";
      const yearLabel2 = range === 'lifetime'
        ? 'FULL LIFETIME'
        : selectedYear === new Date().getFullYear()
          ? `${selectedYear} SO FAR`
          : String(selectedYear);

      let avatarDataUri = '';
      if (pet?.avatar_url) {
        try {
          const resp = await fetch(pet.avatar_url);
          const blob = await resp.blob();
          avatarDataUri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch { /* no avatar */ }
      }

      const totalEntries = entries.length;
      const CAT_LABELS: Record<string, string> = {
        milestone: 'Milestone', health: 'Health', achievement: 'Achievement', moment: 'Moment',
      };

      const highlightDesc = (text: string, name: string): string => {
        if (!text) return '';
        const nameParts = text.split(new RegExp(`(${name})`, 'gi'));
        let out = nameParts.map(p =>
          p.toLowerCase() === name.toLowerCase()
            ? `<strong style="font-weight:700;">${p}</strong>`
            : p
        ).join('');
        out = out.replace(
          /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}\b/g,
          m => `<em>${m}</em>`
        );
        return out;
      };

      const petName = pet?.name ?? '';

      const rows = entries.map((e, idx) => {
        const color = CAT_COLORS[e.category] ?? '#7B8FA1';
        const isLast = idx === totalEntries - 1;
        const dateStr = new Date(e.event_date + 'T00:00:00')
          .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const catLabel = CAT_LABELS[e.category] ?? e.category;
        const descHtml = e.description ? highlightDesc(e.description, petName) : '';
        return `
        <tr>
          <td style="width:34px;vertical-align:top;padding:0 8px 18px 0;">
            ${dotSvg(e.category, color, !isLast)}
          </td>
          <td style="width:72px;vertical-align:top;padding:4px 10px 18px 0;white-space:nowrap;font-size:10px;font-weight:700;color:${color};">
            <div>${dateStr}</div>
            <div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background-color:${color}1A;color:${color};border:1px solid ${color}44;border-radius:4px;padding:2px 5px;margin-top:5px;display:inline-block;font-size:7px;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;">${catLabel}</div>
          </td>
          <td style="vertical-align:top;padding:3px 0 18px;">
            <div style="font-size:13px;font-weight:800;color:${color};line-height:1.35;margin-bottom:4px;">${e.title}</div>
            ${descHtml ? `<div style="font-size:10.5px;line-height:1.65;color:${textColor};">${descHtml}</div>` : ''}
          </td>
        </tr>`;
      }).join('');

      const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const white = '#FFFFFF';

      const svgLogo = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="8" fill="rgba(255,255,255,0.2)"/>
        <text x="5" y="29" font-size="25" font-weight="900" fill="white" font-family="Helvetica,Arial,sans-serif">P</text>
        <circle cx="29" cy="10" r="3.2" fill="rgba(255,255,255,0.85)"/>
        <circle cx="34.5" cy="16" r="2.7" fill="rgba(255,255,255,0.85)"/>
        <circle cx="23.5" cy="16" r="2.7" fill="rgba(255,255,255,0.85)"/>
        <path d="M29 25 C29 25 24 21.5 24 19 C24 17 25.2 16 26.8 16 C27.8 16 28.5 16.6 29 17.3 C29.5 16.6 30.2 16 31.2 16 C32.8 16 34 17 34 19 C34 21.5 29 25 29 25 Z" fill="#F4A261"/>
      </svg>`;

      const logoImg = logoBase64
        ? `<img src="${logoBase64}" width="40" height="40" style="-webkit-print-color-adjust:exact;border-radius:8px;display:block;"/>`
        : svgLogo;

      const avatarEl = avatarDataUri
        ? `<img src="${avatarDataUri}" style="-webkit-print-color-adjust:exact;width:70px;height:70px;border-radius:35px;object-fit:cover;display:block;border:3px solid rgba(255,255,255,0.8);margin-left:auto;"/>`
        : `<div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;width:70px;height:70px;border-radius:35px;border:3px solid rgba(255,255,255,0.8);text-align:center;line-height:64px;font-size:28px;font-family:'Apple Color Emoji','Segoe UI Emoji',sans-serif;margin-left:auto;">${pet?.emoji ?? '🐾'}</div>`;

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: auto; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body {
    background-color:${cream};
    font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }
</style>
</head>
<body>

<div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background-color:${purple};width:100%;padding:0;">
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="width:148px;padding:26px 0 26px 30px;vertical-align:middle;">
        ${logoImg}
        <div style="color:${white};font-size:14px;font-weight:900;letter-spacing:0.5px;margin-top:10px;">PawBond</div>
        <div style="color:#C4A8E8;font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-top:3px;">Pet Memories</div>
      </td>
      <td style="width:1px;padding:20px 0;">
        <div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background-color:rgba(255,255,255,0.2);width:1px;height:68px;"></div>
      </td>
      <td style="padding:26px 0 26px 26px;vertical-align:middle;">
        <div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background-color:rgba(255,255,255,0.15);display:inline-block;border-radius:9px;padding:3px 11px;font-size:8px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${white};margin-bottom:9px;">${yearLabel2}</div>
        <div style="color:${white};font-size:27px;font-weight:900;font-style:italic;line-height:1.1;">${petName ? petName + "'s" : "My Pet's"} Story</div>
        <div style="color:rgba(255,255,255,0.62);font-size:10px;font-weight:600;margin-top:7px;">${totalEntries} milestone${totalEntries !== 1 ? 's' : ''} &nbsp;·&nbsp; ${selectedYear}</div>
      </td>
      <td style="width:106px;padding:26px 30px 26px 0;vertical-align:middle;text-align:right;">
        ${avatarEl}
      </td>
    </tr>
  </table>
</div>

<div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background-color:${accent};height:5px;width:100%;"></div>

<div style="padding:26px 40px 0;background-color:${cream};-webkit-print-color-adjust:exact;print-color-adjust:exact;">

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
    <tr>
      <td style="padding-bottom:10px;border-bottom:1px solid ${purple}22;">
        <span style="display:inline-block;width:12px;height:3px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background-color:${accent};border-radius:2px;vertical-align:middle;margin-right:7px;"></span>
        <span style="font-size:8px;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:${subColor};vertical-align:middle;">Timeline of Memories</span>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;">
    <tbody>${rows}</tbody>
  </table>

  <table style="width:100%;border-collapse:collapse;margin-top:20px;padding-top:12px;border-top:1px solid ${lineColor};">
    <tr>
      <td style="vertical-align:middle;padding-top:12px;border-top:1px solid ${lineColor};">
        <div style="font-size:12px;font-weight:900;color:${purple};">PawBond</div>
        <div style="font-size:8.5px;color:${subColor};margin-top:2px;">Your pet's story, beautifully told</div>
      </td>
      <td style="vertical-align:middle;text-align:right;padding-top:12px;border-top:1px solid ${lineColor};">
        <div style="font-size:8.5px;color:${subColor};">Generated ${generatedDate}</div>
      </td>
    </tr>
  </table>

</div>
<script>
  (function() {
    function applyPageSize() {
      var h = document.body ? document.body.scrollHeight : 0;
      if (h < 100) { setTimeout(applyPageSize, 50); return; }
      var s = document.createElement('style');
      s.textContent = '@page { size: 595pt ' + (h + 8) + 'pt; margin: 0; }';
      document.head.appendChild(s);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyPageSize);
    } else {
      applyPageSize();
    }
    window.addEventListener('load', applyPageSize);
  })();
</script>
</body>
</html>`;

      const CHROME = 206;
      const DESC_LINE = 15;
      const entryHeight = entries.reduce((sum, e) => {
        let h = 36;
        if (e.description) h += Math.ceil(e.description.length / 68) * DESC_LINE;
        return sum + h;
      }, 0);
      const pageHeight = CHROME + entryHeight + 8;

      const result = await Print.printToFileAsync({ html, base64: true, width: 595, height: pageHeight });
      return result;
    } catch (err: any) {
      throw err;
    }
  }, [entries, pet, selectedYear, range, template, logoBase64]);

  const handleDownloadPDF = useCallback(async () => {
    if (!isProUser) { showUpgradeAlert({ message: 'Upgrade to Pro to download PDF.' }); return; }
    if (!hasEntries) { showAlert('No timeline', 'Generate a timeline first.'); return; }
    try {
      setGenerating(true);
      const result = await buildTimelinePdf();
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${pet?.name ?? 'Pet'}'s ${selectedYear} Timeline`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        showAlert('Saved', `PDF saved to: ${result.uri}`);
      }
    } catch (err: any) {
      showAlert('Error', err.message ?? 'Failed to generate PDF');
    } finally {
      setGenerating(false);
    }
  }, [isProUser, hasEntries, buildTimelinePdf, pet, selectedYear]);

  const handleShare = useCallback(async () => {
    if (!isProUser) { showUpgradeAlert({ message: 'Upgrade to Pro to share your timeline.' }); return; }
    if (!hasEntries) return;
    try {
      setGenerating(true);
      const pdfResult = await buildTimelinePdf();

      if (!pdfResult.base64) throw new Error('PDF base64 data missing');
      const bytes = Uint8Array.from(atob(pdfResult.base64), c => c.charCodeAt(0));
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const fileName = `${user.id}/${petId}_${selectedYear}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from('timelines')
        .upload(fileName, bytes, { contentType: 'application/pdf', upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('timelines').getPublicUrl(fileName);
      const url = urlData.publicUrl;
      await Share.share({ message: `Check out ${pet?.name}'s ${selectedYear} timeline! 🐾\n\n${url}`, url });
    } catch (err: any) {
      showAlert('Error', err.message ?? 'Failed to share');
    } finally { setGenerating(false); }
  }, [isProUser, hasEntries, buildTimelinePdf, petId, pet, selectedYear]);

  if (!timelineEnabled) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={[s.headerBack, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={s.headerBack} />
        </View>
        <FeatureUnavailable label="Pet Timeline" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[s.headerBack, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
            {pet?.name ? `${pet.name}'s Timeline` : 'Pet Timeline'}
          </Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>Memory Book · {selectedYear}</Text>
        </View>
        <View style={s.headerBack} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        alwaysBounceVertical={false}
        overScrollMode="never"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#7C5CBF" />}>

        {/* Document preview */}
        <View style={s.previewWrap}>
          {loading ? (
            <View style={[s.previewCard, { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', minHeight: 280 }]}>
              <PawBondLoader size={48} isDark={isDark} />
            </View>
          ) : !hasEntries ? (
            <View style={[s.previewCard, { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', minHeight: 280, borderStyle: 'dashed', borderColor: colors.border, borderWidth: 1 }]}>
              <Ionicons name="sparkles-outline" size={36} color={colors.textTertiary} />
              <Text style={{ color: colors.textSecondary, fontSize: TYPO.body, fontWeight: '600', marginTop: 10 }}>No {selectedYear} timeline yet</Text>
              <Text style={{ color: colors.textSecondary, fontSize: TYPO.body, textAlign: 'center', marginTop: 6, maxWidth: 200 }}>
                {isProUser ? 'Generate one below to see the preview.' : 'Upgrade to Pro to generate a timeline.'}
              </Text>
            </View>
          ) : (
            <View style={s.previewCard}>
              <DocumentPreview
                entries={entries}
                petName={pet?.name ?? ''}
                petPhotoUrl={pet?.photo_url}
                year={selectedYear}
                template={template}
              />
            </View>
          )}

          <Text style={[s.pageIndicator, { color: colors.textSecondary }]}>
            {'< Swipe for Pages >'}
          </Text>
        </View>

        {/* Generate / Regenerate */}
        <View style={[s.generateRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[
              s.generateBtn,
              isExhausted
                ? { backgroundColor: colors.background }
                : { backgroundColor: '#7C5CBF' },
            ]}
            onPress={handleGenerate}
            disabled={generating || isExhausted}
            activeOpacity={0.8}>
            {generating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : isExhausted ? (
              <>
                <Ionicons name="lock-closed" size={14} color={colors.textTertiary} />
                <Text style={[s.generateBtnText, { color: colors.textSecondary }]}>Locked for {selectedYear}</Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={14} color="#fff" />
                <Text style={s.generateBtnText}>
                  {hasEntries ? `Regenerate ${selectedYear}` : `Generate ${selectedYear}`}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <View style={s.attemptsChip}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[s.attDot, { backgroundColor: i < attemptsUsed ? '#7C5CBF' : colors.border }]} />
            ))}
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '500' }}>
              {isExhausted ? 'Max used' : `${MAX_ATTEMPTS - attemptsUsed} left`}
            </Text>
          </View>
        </View>

        {/* Year selector */}
        <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>CHOOSE YEAR</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.yearRow}>
          {years.map(yr => {
            const used = genCounts[yr] ?? 0;
            const isActive = yr === selectedYear;
            const isCurrent = yr === new Date().getFullYear();
            return (
              <TouchableOpacity
                key={yr}
                onPress={() => setSelectedYear(yr)}
                style={[s.yearBtn, { borderColor: isActive ? '#7C5CBF' : colors.border, backgroundColor: isActive ? '#EEEDFE' : colors.card }]}>
                {isCurrent && (
                  <Text style={[s.yearBadge, { color: isActive ? '#534AB7' : colors.textTertiary }]}>THIS YEAR</Text>
                )}
                <Text style={[s.yearLabel, { color: isActive ? '#534AB7' : colors.textPrimary }]}>{yr}</Text>
                <Text style={[s.yearSub, { color: isActive ? '#7C5CBF' : colors.textTertiary }]}>
                  {yearSublabel(yr, used)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Template picker */}
        <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>CHOOSE TEMPLATE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.templateRow}>
          {TEMPLATES.map(t => (
            <TouchableOpacity key={t.id} onPress={() => setTemplate(t.id)} style={s.templateItem}>
              <LinearGradient
                colors={t.colors}
                style={[s.templateSwatch, template === t.id && s.templateSwatchActive]}>
                {template === t.id && (
                  <Text style={s.templateSwatchLabel}>✦ {t.label} ✦</Text>
                )}
              </LinearGradient>
              <Text style={[s.templateLabel, { color: template === t.id ? '#534AB7' : colors.textSecondary }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Range picker */}
        <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>CHOOSE RANGE</Text>
        <View style={s.rangeRow}>
          {([
            { id: 'first_year', label: 'First Year' },
            { id: 'year',       label: `Year ${selectedYear}` },
            { id: 'lifetime',   label: 'Full Lifetime' },
          ] as { id: Range; label: string }[]).map(r => (
            <TouchableOpacity key={r.id} onPress={() => setRange(r.id)} style={s.rangeOption}>
              <View style={[s.radioOuter, { borderColor: range === r.id ? '#7C5CBF' : colors.border }]}>
                {range === r.id && <View style={s.radioInner} />}
              </View>
              <Text style={[s.rangeLabel, { color: range === r.id ? colors.textPrimary : colors.textSecondary }]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Download button */}
        <TouchableOpacity
          onPress={handleDownloadPDF}
          disabled={generating}
          style={s.downloadBtn}
          activeOpacity={0.85}>
          {isProUser ? (
            <LinearGradient colors={['#7C5CBF', '#534AB7']} style={s.downloadGradient}>
              {generating
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="download-outline" size={16} color="#fff" />}
              <Text style={s.downloadText}>
                {generating ? 'Generating PDF…' : 'Download PDF'}
              </Text>
            </LinearGradient>
          ) : (
            <LinearGradient colors={['#C9A84C', '#B8972A']} style={s.downloadGradient}>
              <Ionicons name="lock-closed" size={14} color="#FFF8E1" />
              <Text style={s.downloadText}>Download PDF (Pro Feature)</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBack:    { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { textAlign: 'center', fontSize: TYPO.body, fontWeight: '800', letterSpacing: 0.3 },
  headerSub:     { textAlign: 'center', fontSize: TYPO.body, fontWeight: '500', marginTop: 1, opacity: 0.7 },
  previewWrap:   { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 28 },
  previewCard:   { width: SCREEN_W - 56, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 6, overflow: 'hidden' },
  pageIndicator: { fontSize: TYPO.body, marginTop: 10, letterSpacing: 0.3 },
  generateRow:    { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, borderWidth: 1 },
  generateBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9 },
  generateBtnText:{ color: '#fff', fontSize: TYPO.body, fontWeight: '700' },
  attemptsChip:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  attDot:         { width: 7, height: 7, borderRadius: 3.5 },
  sectionLabel:  { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.8, marginLeft: 16, marginTop: 20, marginBottom: 10 },
  yearRow:       { paddingHorizontal: 16, gap: 8 },
  yearBtn:       { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', minWidth: 100 },
  yearBadge:     { fontSize: TYPO.body, fontWeight: '800', letterSpacing: 0.6, marginBottom: 2 },
  yearLabel:     { fontSize: TYPO.body, fontWeight: '700' },
  yearSub:       { fontSize: TYPO.body, fontWeight: '500', marginTop: 2 },
  templateRow:   { paddingHorizontal: 16, gap: 10 },
  templateItem:  { alignItems: 'center', gap: 6 },
  templateSwatch: { width: 100, height: 70, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  templateSwatchActive: { borderColor: '#7C5CBF', borderWidth: 2 },
  templateSwatchLabel:  { fontSize: TYPO.body, fontWeight: '700', color: '#4B4B6B', textAlign: 'center', paddingHorizontal: 6 },
  templateLabel: { fontSize: TYPO.body, fontWeight: '600' },
  rangeRow:      { flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 16 },
  rangeOption:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  radioOuter:    { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioInner:    { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#7C5CBF' },
  rangeLabel:    { fontSize: TYPO.body, fontWeight: '500' },
  downloadBtn:   { marginHorizontal: 16, marginTop: 24, borderRadius: 14, overflow: 'hidden' },
  downloadGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  downloadText:  { color: '#FFF8E1', fontSize: TYPO.body, fontWeight: '700' },
});
