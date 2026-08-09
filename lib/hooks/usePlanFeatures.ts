import { useState, useEffect } from 'react';
import { getAppSetting } from '@/lib/db/appSettings';
import { DEFAULT_PLAN_FEATURES, type PlanFeature } from '@/lib/planFeatures';

type PlanKey = 'free' | 'pro' | 'ultimate';
export type PlanFeaturesMap = Record<PlanKey, PlanFeature[]>;

let _cache: PlanFeaturesMap | null = null;

export function invalidatePlanFeaturesCache() { _cache = null; }

export function usePlanFeatures(): PlanFeaturesMap {
  const [features, setFeatures] = useState<PlanFeaturesMap>(_cache ?? DEFAULT_PLAN_FEATURES);

  useEffect(() => {
    if (_cache) return;
    getAppSetting<PlanFeaturesMap>('plan_features').then(saved => {
      if (saved) {
        const merged = { ...DEFAULT_PLAN_FEATURES, ...saved };
        _cache = merged;
        setFeatures(merged);
      }
    }).catch(() => {});
  }, []);

  return features;
}
