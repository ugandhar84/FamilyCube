import { create } from 'zustand';

interface PickerOption {
  label: string;
  onPress: () => void;
}

interface PickerOverlayState {
  visible: boolean;
  title: string;
  options: PickerOption[];
  show: (title: string, options: PickerOption[]) => void;
  hide: () => void;
}

export const usePickerOverlayStore = create<PickerOverlayState>((set) => ({
  visible: false,
  title: '',
  options: [],
  show: (title, options) => set({ visible: true, title, options }),
  hide: () => set({ visible: false }),
}));

export function showPickerOverlay(title: string, options: PickerOption[]) {
  usePickerOverlayStore.getState().show(title, options);
}
