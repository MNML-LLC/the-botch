import { create } from 'zustand';

type ScrollRestorationState = {
  positions: Record<string, number>;
  savePosition: (key: string, y: number) => void;
  getPosition: (key: string) => number | undefined;
};

export const useScrollRestorationStore = create<ScrollRestorationState>((set, get) => ({
  positions: {},
  savePosition: (key, y) =>
    set((state) => ({ positions: { ...state.positions, [key]: y } })),
  getPosition: (key) => get().positions[key],
}));
