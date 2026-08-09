import { create } from 'zustand';

interface PickerLoadingStore {
  visible: boolean;
  message: string;
  show: (message: string) => void;
  hide: () => void;
}

export const usePickerLoadingStore = create<PickerLoadingStore>(set => ({
  visible: false,
  message: 'Opening Gallery…',
  show: (message) => set({ visible: true, message }),
  hide: () => set({ visible: false }),
}));

export const showPickerLoading = (message = 'Opening Gallery…'): Promise<void> => {
  usePickerLoadingStore.getState().show(message);
  return new Promise(r => setTimeout(r, 80));
};

export const hidePickerLoading = () => usePickerLoadingStore.getState().hide();
