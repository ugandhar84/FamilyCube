// Shared types + constants for the Medical Records feature

import { FlaskConical, Stethoscope, Pill, FileText, Shield, File } from 'lucide-react-native';
import { BRAND } from '../tabs/shared';
import { todayLocal } from '@/lib/dates';

export type RecordTag  = 'lab' | 'discharge' | 'prescription' | 'imaging' | 'insurance' | 'vaccination' | 'other';
export type Urgency    = 'routine' | 'attention' | 'urgent';

export interface AiAnalysis {
  summary:         string;
  key_findings:    string[];
  follow_up_items: string[];
  tags:            string[];
  doc_type:        string;
  urgency:         Urgency;
  urgency_reason:  string | null;
}

export interface MedRecord {
  id:               string;
  family_id:        string;
  member_id:        string;
  uploaded_by:      string | null;
  title:            string;
  tag:              RecordTag;
  record_date:      string;
  file_path:        string | null;
  file_name:        string | null;
  file_size:        number | null;
  notes:            string | null;
  ai_summary:       string | null;
  ai_tags:          string[];
  ai_analysis_json: AiAnalysis | null;
  ai_analyzed:      boolean;
  created_at:       string;
}

export interface RecordForm {
  title:       string;
  tag:         RecordTag;
  record_date: string;
  notes:       string;
}

export const TAGS: { id: RecordTag; label: string; Icon: any; color: string }[] = [
  { id: 'lab',          label: 'Lab',          Icon: FlaskConical, color: BRAND.teal   },
  { id: 'discharge',    label: 'Discharge',    Icon: Stethoscope,  color: BRAND.rose   },
  { id: 'prescription', label: 'Prescription', Icon: Pill,         color: BRAND.purple },
  { id: 'imaging',      label: 'Imaging',      Icon: FileText,     color: BRAND.blue   },
  { id: 'insurance',    label: 'Insurance',    Icon: Shield,       color: BRAND.amber  },
  { id: 'vaccination',  label: 'Vaccination',  Icon: Shield,       color: '#10B981'    },
  { id: 'other',        label: 'Other',        Icon: File,         color: '#64748B'    },
];

export const TAG_MAP = Object.fromEntries(TAGS.map(t => [t.id, t]));

export const URGENCY_META: Record<Urgency, { color: string; label: string }> = {
  routine:   { color: '#64748B',  label: 'Routine'   },
  attention: { color: BRAND.amber, label: 'Attention' },
  urgent:    { color: BRAND.rose,  label: 'Urgent'    },
};

export const MEMBER_COLORS = [BRAND.purple, BRAND.teal, BRAND.amber, '#10B981', BRAND.rose, BRAND.blue];
export const memberColor   = (idx: number) => MEMBER_COLORS[idx % MEMBER_COLORS.length];

export const BLANK_FORM: RecordForm = {
  title: '', tag: 'lab',
  record_date: todayLocal(),
  notes: '',
};

export function fmtSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
