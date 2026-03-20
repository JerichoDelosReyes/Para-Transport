import { create } from 'zustand';

interface User {
  name: string;
  email: string;
  points: number;
  streak_count: number;
  total_km: number;
  total_fare_spent: number;
  saved_routes?: string[];
  badges?: string[];
}

interface StoreState {
  user: User;
  insightDismissed: boolean;
  selectedTransitRoute: any | null;
  setUser: (user: User) => void;
  dismissInsight: () => void;
  addPoints: (points: number) => void;
  setSelectedTransitRoute: (route: any | null) => void;
}

export const useStore = create<StoreState>((set) => ({
  user: {
    name: "Komyuter",
    email: "guest@para.ph",
    points: 0,
    streak_count: 0,
    total_km: 0,
    total_fare_spent: 0,
    saved_routes: [],
    badges: [],
  },
  insightDismissed: false,
  selectedTransitRoute: null,
  setUser: (user) => set({ user }),
  dismissInsight: () => set({ insightDismissed: true }),
  addPoints: (points) => set((state) => ({ user: { ...state.user, points: state.user.points + points } })),
  setSelectedTransitRoute: (route) => set({ selectedTransitRoute: route }),
}));
