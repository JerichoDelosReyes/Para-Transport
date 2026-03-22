import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { RankMode } from '../services/routeSearch';

interface User {
  name: string;
  email: string;
  points: number;
  streak_count: number;
  total_km: number;
  total_fare_spent: number;
  saved_routes?: any[];
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
  pendingRouteSearch: { origin: any; destination: any } | null;
  rankTab: RankMode;
  setUser: (user: User) => void;
  beginGuestSession: () => void;
  beginAuthSession: (user: User) => void;
  clearSession: () => void;
  setHasHydrated: (value: boolean) => void;
  dismissInsight: () => void;
  addPoints: (points: number) => void;
  setSelectedTransitRoute: (route: any | null) => void;
  setPendingRouteSearch: (search: { origin: any; destination: any } | null) => void;
  setRankTab: (tab: RankMode) => void;
  saveRoute: (route: any) => void;
  removeSavedRoute: (routeId: string | number) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      user: DEFAULT_GUEST_USER,
      sessionMode: null,
      hasHydrated: false,
      insightDismissed: false,
      selectedTransitRoute: null,
      pendingRouteSearch: null,
      rankTab: 'easiest' as RankMode,
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
      setPendingRouteSearch: (search) => set({ pendingRouteSearch: search }),
      setRankTab: (tab) => set({ rankTab: tab }),
      saveRoute: (route: any) =>
        set((state) => {
          const currentSaved = state.user.saved_routes || [];
          if (!currentSaved.find((r) => r.id === route.id)) {
            return { user: { ...state.user, saved_routes: [...currentSaved, route] } };
          }
          return state;
        }),
      removeSavedRoute: (routeId: string | number) =>
        set((state) => ({
          user: {
            ...state.user,
            saved_routes: (state.user.saved_routes || []).filter((r) => r.id !== routeId),
          },
        })),
    }),
    {
      name: 'para-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        sessionMode: state.sessionMode,
        insightDismissed: state.insightDismissed,
        selectedTransitRoute: state.selectedTransitRoute,
        rankTab: state.rankTab,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
