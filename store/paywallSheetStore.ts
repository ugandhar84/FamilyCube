import { create } from 'zustand';

interface PaywallSheetState {
  visible: boolean;
  headline: string;
  body: string;
  perks?: string[];
  onClose?: () => void;
  show: (opts: { headline: string; body: string; perks?: string[]; onClose?: () => void }) => void;
  hide: () => void;
}

export const usePaywallSheetStore = create<PaywallSheetState>((set) => ({
  visible: false,
  headline: '',
  body: '',
  perks: undefined,
  onClose: undefined,
  show: ({ headline, body, perks, onClose }) =>
    set({ visible: true, headline, body, perks, onClose }),
  hide: () => set({ visible: false, onClose: undefined }),
}));
