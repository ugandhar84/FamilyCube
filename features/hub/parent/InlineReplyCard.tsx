import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { ChevronUp, ChevronDown, Pill, Unlock, HelpCircle, MessageSquare, Check, X } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';

// Money-green — "approve/allow" accent for this card's action button,
// distinct from brand teal used elsewhere in the hub. Not colors.success
// (which IS brand teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

// Question/permission/medical kid request — collapsed row that expands into a
// reply box. Kept generic across all three so the parent has one consistent
// pattern to learn instead of three slightly different card shapes.
export function InlineReplyCard({ req, kidName, isPermission, isQuestion, isMedical, accent, colors, isDark, onApprove, onDecline }: {
  req: any; kidName: string;
  isPermission: boolean; isQuestion: boolean; isMedical: boolean;
  accent: string; colors: any; isDark: boolean;
  onApprove: (reply: string) => void;
  onDecline: (reply: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState('');
  const canSubmit = !isQuestion || reply.trim().length > 0;

  const TypeIcon = isMedical ? Pill : isPermission ? Unlock : HelpCircle;
  const typeLabel = isMedical ? 'Medical Alert' : isPermission ? 'Permission' : 'Question';

  return (
    <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: accent + '40', backgroundColor: isDark ? colors.card : accent + '06', overflow: 'hidden' }}>
      <Pressable onPress={() => setExpanded(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
          <TypeIcon size={16} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: accent }}>{typeLabel} — {kidName}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
            {req.detail.length > 55 ? req.detail.slice(0, 55) + '…' : req.detail}
          </Text>
        </View>
        <View style={{ backgroundColor: accent + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4 }}>
          <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: accent }}>Pending</Text>
        </View>
        {expanded ? <ChevronUp size={16} color={colors.textTertiary} /> : <ChevronDown size={16} color={colors.textTertiary} />}
      </Pressable>

      {expanded && (
        <>
          <View style={{ height: 1, backgroundColor: accent + '20', marginHorizontal: 14 }} />

          <View style={{ marginHorizontal: 14, marginTop: 10, borderRadius: 12, padding: 12,
            backgroundColor: isDark ? '#1e293b' : '#fff',
            borderLeftWidth: 3, borderLeftColor: accent }}>
            <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary, lineHeight: 19 }}>
              "{req.detail}"
            </Text>
          </View>

          <View style={{ marginHorizontal: 14, marginTop: 10, borderRadius: 12, borderWidth: 1.5,
            borderColor: reply.trim() ? accent + '60' : colors.border,
            backgroundColor: isDark ? colors.surface : '#fff',
            flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10 }}>
            <MessageSquare size={14} color={reply.trim() ? accent : colors.textTertiary} style={{ marginTop: 2 }} />
            <TextInput
              style={{ flex: 1, fontSize: TYPO.caption, color: colors.textPrimary, minHeight: 36 }}
              placeholder={isQuestion ? 'Type your reply… (required)' : 'Add a reply (optional)'}
              placeholderTextColor={colors.textTertiary}
              value={reply}
              onChangeText={setReply}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, padding: 14 }}>
            <Pressable
              onPress={() => onApprove(reply.trim())}
              disabled={!canSubmit}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: canSubmit ? MONEY_GREEN : (isDark ? '#374151' : '#D1D5DB'),
                paddingVertical: 11, borderRadius: 12 }}>
              <Check size={14} color="#fff" />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                {isPermission ? 'Allow' : isMedical ? 'Acknowledged' : 'Reply'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onDecline(reply.trim())}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: isDark ? `${colors.danger}20` : colors.dangerLight,
                borderWidth: 1.5, borderColor: `${colors.danger}30`,
                paddingVertical: 11, borderRadius: 12 }}>
              <X size={14} color={colors.danger} />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.danger }}>
                {isPermission ? 'No' : 'Dismiss'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
