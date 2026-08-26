import { useSubscriptionStore } from '@/store/subscriptionStore';
import { useAuthStore } from '@/store/authStore';
import { usePaywallSheetStore } from '@/store/paywallSheetStore';
import { canAccess, checkUsage, getLimit, FeatureKey } from '@/lib/subscription';

export function usePaywall() {
  const { tier } = useSubscriptionStore();
  const { user } = useAuthStore();
  const showPaywall = usePaywallSheetStore(s => s.show);

  /** Returns true if the action is allowed. Opens PaywallSheet in-place if not. */
  const gate = async (
    feature: FeatureKey,
    opts?: { title?: string; message?: string },
  ): Promise<boolean> => {
    if (!canAccess(tier, feature)) {
      showPaywall({
        headline: opts?.title ?? 'Pro feature',
        body: opts?.message ?? 'Upgrade to unlock this feature.',
      });
      return false;
    }

    const limit = getLimit(tier, feature);
    if (limit === -1) return true;
    if (!user?.id) return true;

    const { allowed, current } = await checkUsage(user.id, tier, feature);
    if (!allowed) {
      showPaywall({
        headline: opts?.title ?? 'Limit reached',
        body: opts?.message ?? `You've used ${current}/${limit} this month. Upgrade for unlimited access.`,
      });
      return false;
    }

    return true;
  };

  /** Increment usage after a successful action. */
  const consume = async (feature: FeatureKey) => {
    if (!user?.id) return;
    const limit = getLimit(tier, feature);
    if (limit === -1 || limit === 0) return;
    await useSubscriptionStore.getState().incrementUsage(user.id, feature);
  };

  return { gate, consume, tier };
}
