import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { makeStyles, type EditState } from './insuranceStyles';

type Styles = ReturnType<typeof makeStyles>;

interface PolicyViewSheetProps {
  editing: EditState;
  s: Styles;
  accent: string;
  colors: any;
  canLogHealth: boolean;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

export const PolicyViewSheet = React.memo(function PolicyViewSheet({
  editing, s, accent, colors, canLogHealth, onClose, onDelete, onEdit,
}: PolicyViewSheetProps) {
  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={s.viewRow}>
          <Text style={s.viewLabel}>Provider</Text>
          <Text style={s.viewValue}>{editing.provider || '—'}</Text>
        </View>
        <View style={s.viewRow}>
          <Text style={s.viewLabel}>Policy number</Text>
          <Text style={s.viewValue}>{editing.policy_number || '—'}</Text>
        </View>
        <View style={s.viewRow}>
          <Text style={s.viewLabel}>Coverage type</Text>
          <Text style={s.viewValue}>{editing.coverage_type || '—'}</Text>
        </View>
        <View style={s.viewRow}>
          <Text style={s.viewLabel}>Monthly premium</Text>
          <Text style={s.viewValue}>{editing.premium_amount != null ? `$${editing.premium_amount}` : '—'}</Text>
        </View>
        <View style={s.viewRow}>
          <Text style={s.viewLabel}>Start date</Text>
          <Text style={s.viewValue}>{editing.start_date ? format(parseISO(editing.start_date), 'MMMM d, yyyy') : '—'}</Text>
        </View>
        <View style={s.viewRow}>
          <Text style={s.viewLabel}>End / renewal date</Text>
          <Text style={s.viewValue}>{editing.end_date ? format(parseISO(editing.end_date), 'MMMM d, yyyy') : '—'}</Text>
        </View>
        {editing.file_url && (
          <View style={s.viewRow}>
            <Text style={s.viewLabel}>Policy document</Text>
            <TouchableOpacity onPress={() => Linking.openURL(editing.file_url!)}>
              <Text style={[s.viewValue, { color: accent }]}>View document</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={s.viewRow}>
          <Text style={s.viewLabel}>Notes</Text>
          <Text style={s.viewValue}>{editing.notes || '—'}</Text>
        </View>
      </ScrollView>
      <View style={s.footer}>
        <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
          <Text style={s.cancelText}>Close</Text>
        </TouchableOpacity>
        {canLogHealth && (
          <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.danger, flex: 0.7 }]} onPress={onDelete}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        )}
        {canLogHealth && (
          <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent, flexDirection: 'row', gap: 6 }]} onPress={onEdit}>
            <Ionicons name="pencil" size={15} color="#fff" />
            <Text style={s.saveText}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
});
