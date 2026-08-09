import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { usePickerOverlayStore } from '@/store/pickerOverlayStore';
import { useTheme } from '@/lib/ThemeContext';

export default function PickerOverlay() {
  const { visible, title, options, hide } = usePickerOverlayStore();
  const { colors, isDark } = useTheme();

  if (!visible) return null;

  // Same frosted card style as AppAlert
  const cardBg  = isDark ? 'rgba(44,44,46,0.97)'  : 'rgba(242,242,247,0.97)';
  const pillBg  = isDark ? 'rgba(68,68,70,0.90)'  : 'rgba(210,210,220,0.80)';
  const titleCol = isDark ? '#FFFFFF' : '#000000';
  const cancelCol = isDark ? '#EBEBF5' : '#3C3C43';

  return (
    <View style={ss.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={hide} />
      <View style={[ss.card, { backgroundColor: cardBg }]}>
        <View style={ss.header}>
          <Text style={[ss.title, { color: titleCol }]}>{title}</Text>
        </View>
        <View style={ss.btnArea}>
          {/* Action options side-by-side */}
          <View style={ss.row}>
            {options.map((opt, i) => (
              <TouchableOpacity
                key={i}
                style={[ss.pill, { flex: 1, marginLeft: i > 0 ? 8 : 0, backgroundColor: pillBg }]}
                activeOpacity={0.7}
                onPress={() => { opt.onPress(); setTimeout(hide, 600); }}>
                <Text style={[ss.pillText, { color: colors.primaryText ?? colors.primary, fontWeight: '700' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Cancel — same pill bg, dark text */}
          <TouchableOpacity
            style={[ss.pill, ss.cancel, { backgroundColor: pillBg }]}
            activeOpacity={0.7}
            onPress={hide}>
            <Text style={[ss.pillText, { color: cancelCol, fontWeight: '500' }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    zIndex: 9999,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 22,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24 },
      android: { elevation: 20 },
    }),
  },
  header:   { paddingTop: 26, paddingBottom: 20, paddingHorizontal: 22 },
  title:    { fontSize: 17, fontWeight: '700', textAlign: 'center', lineHeight: 22 },
  btnArea:  { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 0 },
  row:      { flexDirection: 'row' },
  pill:     { borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  cancel:   { marginTop: 8 },
  pillText: { fontSize: 15, textAlign: 'center' },
});
