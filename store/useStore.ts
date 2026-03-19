import { create } from 'zustand';

interface User {
  name: string;
  email: string;
  points: number;
  streak_count: number;
  total_km: number;
  total_fare_spent: number;
}

interface StoreState {
  user: User;
  insightDismissed: boolean;
  selectedTransitRoute: any | null;
  dismissInsight: () => void;
  addPoints: (points: number) => void;
  setSelectedTransitRoute: (route: any | null) => void;
}

export const useStore = create<StoreState>((set) => ({
  user: {
    name: "Juan",
    email: "juan@para.ph",
    points: 120,
    streak_count: 3,
    total_km: 24.5,
    total_fare_spent: 580,
  },
  insightDismissed: false,
  selectedTransitRoute: null,
  dismissInsight: () => set({ insightDismissed: true }),
  addPoints: (points) => set((state) => ({ user: { ...state.user, points: state.user.points + points } })),
  setSelectedTransitRoute: (route) => set({ selectedTransitRoute: route }),
}));
