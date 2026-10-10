import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useFamilyStore } from '@/store/familyStore';
import { PageHeading } from '@/components/PageHeading';
import HomeownerNotesTab from './homeowner/HomeownerNotesTab';
import { AddHomeownerNoteSheet } from './homeowner/AddHomeownerNoteSheet';
import { EditHomeownerNoteSheet } from './homeowner/EditHomeownerNoteSheet';
import { CompleteNoteSheet } from './homeowner/CompleteNoteSheet';
import { NoteDetailSheet } from './homeowner/NoteDetailSheet';
import { HouseDocumentsSheet } from './homeowner/HouseDocumentsSheet';
import { useHomeownerNotesStore, type HomeownerNote } from '@/store/homeownerNotesStore';
import { showAlert } from '@/components/AppAlert';

const PAGE_BG = '#F3F5F2';

export default function HomeownerNotesScreen({ hideHeader = false, onClose }: { hideHeader?: boolean; onClose?: () => void; }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyId = (activeMember as any)?.familyId ?? (members[0] as any)?.familyId ?? '';

  const { notes, addNote, completeNote } = useHomeownerNotesStore();
  const [showAdd, setShowAdd] = useState(false);
  const [detailNoteId, setDetailNoteId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<HomeownerNote | null>(null);
  const [completingNote, setCompletingNote] = useState<HomeownerNote | null>(null);
  const [showDocuments, setShowDocuments] = useState(false);

  const detailNote = detailNoteId ? notes.find(n => n.id === detailNoteId) ?? null : null;

  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(true);
    hideTabBar();
    return () => {
      useUIStore.getState().setFullBleedScreenActive(false);
      showTabBar();
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.background : PAGE_BG }}>
      {!hideHeader && (
        <View style={{ backgroundColor: isDark ? colors.background : '#FFFFFF' }}>
          <PageHeading
            eyebrow="FAMILY CUBE · HOME CARE"
            title="Home Care"
            subtitle="Track maintenance, repairs, and home tasks"
            accent="teal"
            Icon={Home}
            topInset={insets.top}
          />
        </View>
      )}
      <HomeownerNotesTab
        colors={colors}
        isDark={isDark}
        onAdd={() => setShowAdd(true)}
        onOpenNote={note => setDetailNoteId(note.id)}
        onOpenDocuments={() => setShowDocuments(true)}
      />

      <HouseDocumentsSheet
        visible={showDocuments}
        colors={colors}
        isDark={isDark}
        onClose={() => setShowDocuments(false)}
        zIndex={60}
      />

      <AddHomeownerNoteSheet
        visible={showAdd}
        colors={colors}
        isDark={isDark}
        onClose={() => setShowAdd(false)}
        onSave={async (params) => {
          if (!activeMemberId) return;
          const { error } = await addNote({ familyId, createdBy: activeMemberId, ...params });
          if (error) showAlert('Could not save', error);
          else setShowAdd(false);
        }}
      />

      <NoteDetailSheet
        visible={!!detailNote}
        note={detailNote}
        colors={colors}
        isDark={isDark}
        onClose={() => setDetailNoteId(null)}
        onEdit={() => { if (detailNote) setEditNote(detailNote); }}
        onComplete={() => { if (detailNote) setCompletingNote(detailNote); }}
        zIndex={60}
      />

      {editNote && (
        <EditHomeownerNoteSheet
          visible
          note={editNote}
          colors={colors}
          isDark={isDark}
          onClose={() => setEditNote(null)}
          zIndex={61}
        />
      )}

      <CompleteNoteSheet
        visible={!!completingNote}
        note={completingNote}
        colors={colors}
        isDark={isDark}
        onClose={() => setCompletingNote(null)}
        onConfirm={async (comment) => {
          if (!completingNote) return;
          const { error } = await completeNote(completingNote.id, comment);
          setCompletingNote(null);
          setDetailNoteId(null);
          if (error) showAlert('Could not complete', error);
        }}
        zIndex={61}
      />
    </View>
  );
}
