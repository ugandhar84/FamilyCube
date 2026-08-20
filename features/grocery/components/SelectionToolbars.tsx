import { View, Text, Pressable, Alert } from 'react-native';
import { GroceryItem } from '@/store/groceryStore';

// ─── Return mode toolbar ────────────────────────────────────────────────────

export function ReturnModeToolbar({ returnMode, returnIds, members, colors, handleCreateReturn }: {
  returnMode: boolean; returnIds: Set<string>;
  members: any[]; colors: any;
  handleCreateReturn: (assigneeId: string) => void;
}) {
  if (!returnMode || returnIds.size === 0) return null;
  return (
    <View style={{ position: 'absolute', bottom: 90, left: 16, right: 16,
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.warningDark, borderRadius: 20,
      paddingVertical: 12, paddingHorizontal: 16, gap: 10,
      shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, elevation: 10 }}>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.textInverse }}>
        {returnIds.size} item{returnIds.size !== 1 ? 's' : ''} to return
      </Text>
      <Pressable onPress={() => {
        Alert.alert(
          '↩️ Assign Return To',
          'Who will take these items back to the store?',
          [
            ...members.map(m => ({ text: m.name, onPress: () => handleCreateReturn(m.id) })),
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.warning }}>
        <Text style={{ color: colors.textInverse, fontSize: 13, fontWeight: '700' }}>↩️ Create Quest</Text>
      </Pressable>
    </View>
  );
}

// ─── List-item bulk action toolbar ──────────────────────────────────────────

export function BulkSelectToolbar({
  isSelecting, selectedIds, setSelectedIds, items, boughtItems, removeItem, isKid, colors, P,
}: {
  isSelecting: boolean;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  items: GroceryItem[];
  boughtItems: GroceryItem[];
  removeItem: (id: string) => void;
  isKid: boolean;
  colors: any; P: string;
}) {
  if (!isSelecting) return null;
  return (
    <View style={{ position: 'absolute', bottom: 90, left: 16, right: 16,
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: P, borderRadius: 20,
      paddingVertical: 10, paddingHorizontal: 16, gap: 10,
      shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 }}>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.textInverse }}>
        {selectedIds.size} selected
      </Text>
      <Pressable onPress={() => setSelectedIds(new Set(items.map(i => i.id)))}
        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
        <Text style={{ color: colors.textInverse, fontSize: 12, fontWeight: '600' }}>Select All</Text>
      </Pressable>
      {!isKid && (
        <Pressable onPress={() => {
          const deletable = Array.from(selectedIds).filter(id => {
            const bi = boughtItems.find(i => i.id === id);
            return !bi?.isReturning;
          });
          if (deletable.length === 0) {
            Alert.alert('Cannot delete', 'Items pending return cannot be deleted.'); return;
          }
          Alert.alert('Delete items?', `Remove ${deletable.length} item${deletable.length !== 1 ? 's' : ''} from the list?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: `Delete (${deletable.length})`, style: 'destructive', onPress: () => {
              deletable.forEach(id => removeItem(id));
              setSelectedIds(new Set());
            }},
          ]);
        }} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.danger }}>
          <Text style={{ color: colors.textInverse, fontSize: 12, fontWeight: '700' }}>Delete ({selectedIds.size})</Text>
        </Pressable>
      )}
      <Pressable onPress={() => setSelectedIds(new Set())}
        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
        <Text style={{ color: colors.textInverse, fontSize: 12, fontWeight: '600' }}>Cancel</Text>
      </Pressable>
    </View>
  );
}
