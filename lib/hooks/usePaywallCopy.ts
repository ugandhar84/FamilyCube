import { useState, useEffect } from 'react';
import { getAppSetting } from '@/lib/db/appSettings';

export interface PaywallCopy {
  trial_subtitle: string;
  anchor_text: string;
  annual_save_label: string;
  pro_feature_note: string;
  ultimate_feature_note: string;
  trial_cta_text: string;
  micro_copy: string;
}

export const DEFAULT_PAYWALL_COPY: PaywallCopy = {
  trial_subtitle:      '7-day free trial · cancel anytime',
  anchor_text:         'Skip the $150 emergency clinic waiting room. Get expert triage in seconds — any time, any night.',
  annual_save_label:   '🔥 Annual · save 44%',
  pro_feature_note:    'Multi-pet · family sharing',
  ultimate_feature_note: '+ PetDoc AI · Symptom scan',
  trial_cta_text:      'Start 7-Day Free Trial',
  micro_copy:          'No payment until trial ends · cancel anytime in Settings',
};

let _cache: PaywallCopy | null = null;

export function usePaywallCopy(): PaywallCopy {
  const [copy, setCopy] = useState<PaywallCopy>(_cache ?? DEFAULT_PAYWALL_COPY);

  useEffect(() => {
    if (_cache) return;
    getAppSetting<PaywallCopy>('paywall_copy').then(saved => {
      if (saved) {
        const merged = { ...DEFAULT_PAYWALL_COPY, ...saved };
        _cache = merged;
        setCopy(merged);
      }
    }).catch(() => {});
  }, []);

  return copy;
}

export function invalidatePaywallCopyCache() {
  _cache = null;
}
