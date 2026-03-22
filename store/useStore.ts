import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';
import { supabase } from '../config/supabaseClient';

interface User {
  name: string;
  email: string;
  points: number;
  streak_count: number;
  total_km: number;
  total_fare_spent: number;
  saved_routes?: any[];
  saved_places?: any[];
  commute_history?: any[];
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
  saved_places: [],
  commute_history: [],
  badges: [],
};

interface StoreState {
  user: User;
  sessionMode: SessionMode;
  hasHydrated: boolean;
  insightDismissed: boolean;
  selectedTransitRoute: any | null;
  pendingRouteSearch: { origin: any; destination: any } | null;
  setUser: (user: User) => void;
  beginGuestSession: () => void;
  beginAuthSession: (user: User) => void;
  clearSession: () => void;
  setHasHydrated: (value: boolean) => void;
  dismissInsight: () => void;
  addPoints: (points: number) => void;
  setSelectedTransitRoute: (route: any | null) => void;
  setPendingRouteSearch: (search: { origin: any; destination: any } | null) => void;
  saveRoute: (route: any) => void;
  removeSavedRoute: (routeId: string | number) => void;
  savePlace: (place: any) => void;
  removeSavedPlace: (placeId: string) => void;
  addHistory: (historyItem: any) => void;
  clearHistory: () => void;
  unlockedBadgeToShow: string | null;
  unlockBadge: (badgeId: string) => void;
  clearUnlockedBadge: () => void;
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
      unlockedBadgeToShow: null,
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
      savePlace: (place: any) =>
        set((state) => {
          const currentSaved = state.user.saved_places || [];
          if (!currentSaved.find((p) => p.id === place.id)) {
            return { user: { ...state.user, saved_places: [...currentSaved, place] } };
          }
          return state;
        }),
      removeSavedPlace: (placeId: string) =>
        set((state) => ({
          user: {
            ...state.user,
            saved_places: (state.user.saved_places || []).filter((p) => p.id !== placeId),
          },
        })),
      addHistory: (item: any) =>
        set((state) => {
          const currentHistory = state.user.commute_history || [];
          const newHistory = [item, ...currentHistory.filter((h: any) => h.id !== item.id)].slice(0, 20);
          return { user: { ...state.user, commute_history: newHistory } };
        }),
      clearHistory: () =>
        set((state) => ({
          user: { ...state.user, commute_history: [] },
        })),
      unlockBadge: (badgeId: string) =>
        set((state) => {
          const currentBadges = state.user.badges || [];
          if (currentBadges.includes(badgeId)) return state;
          
          const newBadges = [...currentBadges, badgeId];
          
          // update supabase if authenticated
          if (state.sessionMode === 'auth' && state.user.email) {
            supabase
              .from('users')
              .update({ badges: newBadges })
              .eq('email', state.user.email)
              .then(({ error }) => {
                if (error) console.log('Failed to array-sync badge to Supabase:', error.message);
              });
          }
          
          return {
            user: { ...state.user, badges: newBadges },
            unlockedBadgeToShow: badgeId,
          };
        }),
      clearUnlockedBadge: () => set({ unlockedBadgeToShow: null }),
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
