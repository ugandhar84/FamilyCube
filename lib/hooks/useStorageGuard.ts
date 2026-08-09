import { checkStorageQuota, fmtBytes } from '@/lib/storageGuard';
import { showAlert } from '@/components/AppAlert';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { usePaywallSheetStore } from '@/store/paywallSheetStore';

export function useStorageGuard() {
  const { tier } = useSubscriptionStore();
  const showPaywall = usePaywallSheetStore(s => s.show);

  const guardUpload = async (fileSizeBytes: number): Promise<boolean> => {
    const result = await checkStorageQuota(fileSizeBytes);
    if (result.allowed) return true;

    const tierName = tier === 'ultimate' ? 'Ultimate' : tier === 'pro' ? 'Pro' : 'Free';

    if (tier !== 'ultimate') {
      showPaywall({
        headline: 'Storage full',
        body: `You've used ${fmtBytes(result.used)} of your ${fmtBytes(result.cap)} ${tierName} allowance. Upgrade for more storage.`,
        perks: [
          'More photo & video storage',
          'Unlimited health records',
          'Unlimited posts & memories',
          'Up to 5 pets',
        ],
      });
    } else {
      showAlert(
        'Storage full',
        `You've used ${fmtBytes(result.used)} of your ${fmtBytes(result.cap)} ${tierName} allowance. Delete some photos or videos to free up space.`,
        [{ text: 'OK', style: 'cancel' }],
      );
    }
    return false;
  };

  return { guardUpload };
}
