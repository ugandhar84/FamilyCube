export const URGENCY_CONFIG = {
  emergency:    { label: 'EMERGENCY',       color: '#DC2626', bg: 'rgba(220,38,38,0.15)',  icon: '🚨' },
  see_vet_soon: { label: 'SEE VET SOON',    color: '#D97706', bg: 'rgba(217,119,6,0.15)',  icon: '⚠️' },
  monitor:      { label: 'MONITOR AT HOME', color: '#2563EB', bg: 'rgba(37,99,235,0.12)',  icon: '👁️' },
  normal:       { label: 'LOOKS NORMAL',    color: '#16A34A', bg: 'rgba(22,163,74,0.12)',  icon: '✅' },
};

export interface ScanResult {
  urgency: keyof typeof URGENCY_CONFIG;
  urgency_label: string;
  summary: string;
  possible_causes: string[];
  what_to_watch: string[];
  home_care: string[];
  vet_needed: boolean;
  confidence: number;
  disclaimer: string;
}

export interface PastScan {
  id: string;
  urgency: string;
  symptoms_text: string | null;
  created_at: string;
  result: ScanResult;
  photo_url?: string | null;
}
