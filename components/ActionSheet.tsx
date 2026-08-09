import {
  Modal, View, Text, TouchableOpacity, TouchableWithoutFeedback, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ActionSheetAction {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  actions: ActionSheetAction[];
}

export default function ActionSheet({ visible, onClose, actions }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // Same frosted card palette as AppAlert / PickerOverlay
  const panelBg  = isDark ? 'rgba(44,44,46,0.97)'  : 'rgba(242,242,247,0.97)';
  const pillBg   = isDark ? 'rgba(68,68,70,0.90)'  : 'rgba(210,210,220,0.80)';
  const cancelCol = isDark ? '#EBEBF5' : '#3C3C43';

  const regular    = actions.filter(a => !a.destructive);
  const destructive = actions.filter(a => a.destructive);

  const rows: ActionSheetAction[][] = [];
  for (let i = 0; i < regular.length; i += 2) rows.push(regular.slice(i, i + 2));

  const Pill = ({ a }: { a: ActionSheetAction }) => (
    <TouchableOpacity
      style={[ss.pill, { backgroundColor: pillBg }]}
      onPress={() => { onClose(); a.onPress(); }}
      activeOpacity={0.7}>
      {a.icon && (
        <Ionicons
          name={a.icon}
          size={18}
          color={a.destructive ? '#FF3B30' : colors.primary}
          style={ss.pillIcon}
        />
      )}
      <Text style={[ss.pillText, { color: a.destructive ? '#FF3B30' : colors.primary, fontWeight: '600' }]}>
        {a.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={ss.backdrop} />
      </TouchableWithoutFeedback>

      <View style={[ss.panel, { backgroundColor: panelBg, paddingBottom: Math.max(insets.bottom, 16) }]}>
        {rows.map((row, i) => (
          <View key={i} style={ss.row}>
            {row.map(a => <Pill key={a.label} a={a} />)}
          </View>
        ))}
        {destructive.map(a => (
          <View key={a.label} style={ss.row}>
            <Pill a={a} />
          </View>
        ))}
        <TouchableOpacity
          style={[ss.pill, ss.cancelPill, { backgroundColor: pillBg }]}
          onPress={onClose}
          activeOpacity={0.7}>
          <Text style={[ss.pillText, { color: cancelCol, fontWeight: '500' }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const ss = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 14, paddingHorizontal: 14,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: -4 }, shadowRadius: 16 },
      android: { elevation: 20 },
    }),
  },
  row:        { flexDirection: 'row', gap: 8, marginBottom: 8 },
  pill:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 15, gap: 7 },
  pillIcon:   {},
  pillText:   { fontSize: 15, textAlign: 'center' },
  cancelPill: { marginTop: 4, marginBottom: 4 },
});
