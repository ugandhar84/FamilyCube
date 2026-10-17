// homeownerDocumentsStore — raw document uploads for Home Care's "House
// documents" section (insurance, deeds, manuals, warranty cards). No AI
// analysis, no redaction — just camera/library/file upload with a
// user-given name and document type, parent-only like homeownerNotesStore.
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type HomeownerDocType = 'insurance' | 'deed' | 'manual' | 'warranty' | 'other';

export interface HomeownerDocument {
  id: string;
  familyId: string;
  name: string;
  docType: HomeownerDocType;
  filePath: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy: string;
  createdAt: string;
}

interface HomeownerDocumentsState {
  documents: HomeownerDocument[];
  isLoading: boolean;
  loadDocuments: (familyId: string) => Promise<void>;
  addDocument: (params: {
    familyId: string; name: string; docType: HomeownerDocType; filePath: string; fileName: string;
    fileSize?: number; mimeType?: string; uploadedBy: string;
  }) => Promise<{ error?: string }>;
  deleteDocument: (id: string) => Promise<{ error?: string }>;
}

function mapDoc(row: any): HomeownerDocument {
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    docType: row.doc_type ?? 'other',
    filePath: row.file_path,
    fileName: row.file_name,
    fileSize: row.file_size ?? undefined,
    mimeType: row.mime_type ?? undefined,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export const useHomeownerDocumentsStore = create<HomeownerDocumentsState>((set) => ({
  documents: [],
  isLoading: false,

  loadDocuments: async (familyId: string) => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('homeowner_documents')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[homeownerDocumentsStore] loadDocuments failed:', error.message);
      set({ isLoading: false });
      return;
    }
    set({ documents: (data ?? []).map(mapDoc), isLoading: false });
  },

  addDocument: async ({ familyId, name, docType, filePath, fileName, fileSize, mimeType, uploadedBy }) => {
    const { data, error } = await supabase.from('homeowner_documents').insert({
      family_id: familyId, name, doc_type: docType, file_path: filePath, file_name: fileName,
      file_size: fileSize ?? null, mime_type: mimeType ?? null, uploaded_by: uploadedBy,
    }).select().single();
    if (error) return { error: error.message };
    set(s => ({ documents: [mapDoc(data), ...s.documents] }));
    return {};
  },

  deleteDocument: async (id: string) => {
    const doc = useHomeownerDocumentsStore.getState().documents.find(d => d.id === id);
    if (doc) await supabase.storage.from('homeowner-documents').remove([doc.filePath]);
    const { error } = await supabase.from('homeowner_documents').delete().eq('id', id);
    if (error) return { error: error.message };
    set(s => ({ documents: s.documents.filter(d => d.id !== id) }));
    return {};
  },
}));
