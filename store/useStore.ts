import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';

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

type SessionMode = 'guest' | 'auth' | null;

const DEFAULT_GUEST_USER: User = {
  name: 'Komyuter',
  email: 'guest@para.ph',
  points: 0,
  streak_count: 0,
  total_km: 0,
  total_fare_spent: 0,
  saved_routes: [],
  badges: [],
};

interface StoreState {
  user: User;
  sessionMode: SessionMode;
  hasHydrated: boolean;
  insightDismissed: boolean;
  selectedTransitRoute: any | null;
  setUser: (user: User) => void;
  beginGuestSession: () => void;
  beginAuthSession: (user: User) => void;
  clearSession: () => void;
  setHasHydrated: (value: boolean) => void;
  dismissInsight: () => void;
  addPoints: (points: number) => void;
  setSelectedTransitRoute: (route: any | null) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      user: DEFAULT_GUEST_USER,
      sessionMode: null,
      hasHydrated: false,
      insightDismissed: false,
      selectedTransitRoute: null,
      setUser: (user) => set({ user }),
      beginGuestSession: () =>
        set({
          user: DEFAULT_GUEST_USER,
          sessionMode: 'guest',
        }),
      beginAuthSession: (user) =>
        set({
          user,
          sessionMode: 'auth',
        }),
      clearSession: () =>
        set({
          user: DEFAULT_GUEST_USER,
          sessionMode: null,
          selectedTransitRoute: null,
        }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
      dismissInsight: () => set({ insightDismissed: true }),
      addPoints: (points) => set((state) => ({ user: { ...state.user, points: state.user.points + points } })),
      setSelectedTransitRoute: (route) => set({ selectedTransitRoute: route }),
    }),
    {
      name: 'para-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        sessionMode: state.sessionMode,
        insightDismissed: state.insightDismissed,
        selectedTransitRoute: state.selectedTransitRoute,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
