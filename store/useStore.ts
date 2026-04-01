import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';
import { supabase } from '../config/supabaseClient';

interface User {
  name: string;
  email: string;
  points: number;
  streak_count: number;
  distance: number;
  spent: number;
  trips: number;
  saved_routes?: any[];
  saved_places?: any[];
  commute_history?: any[];
  badges?: string[];
}

type ChatbotPersistMessage = {
  id: string;
  text: string;
  isUser: boolean;
};

type ChatbotPersistState = {
  awaitingOriginForDestinationId?: string;
  awaitingOriginIntent?: 'fare' | 'route';
  awaitingDestinationIntent?: 'fare' | 'route';
};

type SessionMode = 'guest' | 'auth' | null;

const createGuestUser = (): User => ({
  name: 'Komyuter',
  email: 'guest@para.ph',
  points: 0,
  streak_count: 0,
  distance: 0,
  spent: 0,
  trips: 0,
  saved_routes: [],
  saved_places: [],
  commute_history: [],
  badges: [],
});

interface StoreState {
  user: User;
  sessionMode: SessionMode;
  hasHydrated: boolean;
  insightDismissed: boolean;
  selectedTransitRoute: any | null;
  pendingRouteSearch: { origin: any; destination: any } | null;
  chatbotMessages: ChatbotPersistMessage[];
  chatbotConversationState: ChatbotPersistState;
  setUser: (user: User) => void;
  beginGuestSession: () => void;
  beginAuthSession: (user: User) => void;
  clearSession: () => void;
  setHasHydrated: (value: boolean) => void;
  dismissInsight: () => void;
  addPoints: (points: number) => void;
  addTripStats: (stats: { distance: number; fare: number; points: number }) => void;
  resetStreak: () => void;
  setSelectedTransitRoute: (route: any | null) => void;
  setPendingRouteSearch: (search: { origin: any; destination: any } | null) => void;
  setChatbotMessages: (messages: ChatbotPersistMessage[]) => void;
  setChatbotConversationState: (state: ChatbotPersistState) => void;
  clearChatbotMemory: () => void;
  saveRoute: (route: any) => void;
  removeSavedRoute: (routeId: string | number) => void;
  savePlace: (place: any) => void;
  removeSavedPlace: (placeId: string) => void;
  addHistory: (historyItem: any) => void;
  updateLatestHistoryFare: (fare: number) => void;
  clearHistory: () => void;
  unlockedBadgeToShow: string | null;
  unlockBadge: (badgeId: string) => void;
  clearUnlockedBadge: () => void;
  resetProgress: () => void;
  syncWithSupabase: () => Promise<void>;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      user: createGuestUser(),
      sessionMode: null,
      hasHydrated: false,
      insightDismissed: false,
      selectedTransitRoute: null,
      pendingRouteSearch: null,
      chatbotMessages: [],
      chatbotConversationState: {},
      unlockedBadgeToShow: null,
      setUser: (user) => set({ user }),
      beginGuestSession: () =>
        set({
          user: createGuestUser(),
          sessionMode: 'guest',
          selectedTransitRoute: null,
          pendingRouteSearch: null,
          chatbotMessages: [],
          chatbotConversationState: {},
          unlockedBadgeToShow: null,
        }),
      beginAuthSession: (user) =>
        set((state) => ({
          user: {
            ...user,
            commute_history: user.commute_history || state.user?.commute_history || [],
            saved_routes: user.saved_routes || state.user?.saved_routes || [],
            saved_places: user.saved_places || state.user?.saved_places || [],
          },
          sessionMode: 'auth',
        })),
      clearSession: () =>
        set({
          user: createGuestUser(),
          sessionMode: null,
          selectedTransitRoute: null,
          pendingRouteSearch: null,
          chatbotMessages: [],
          chatbotConversationState: {},
          unlockedBadgeToShow: null,
        }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
      dismissInsight: () => set({ insightDismissed: true }),
      addPoints: (points) => set((state) => ({ user: { ...state.user, points: state.user.points + points } })),
      addTripStats: ({ distance, fare, points }) => set((state) => {
        const newUser = {
          ...state.user,
          points: (state.user.points || 0) + points,
          streak_count: (state.user.streak_count || 0) + 1,
          distance: (state.user.distance || 0) + distance,
          spent: (state.user.spent || 0) + fare,
          trips: (state.user.trips || 0) + 1,
        };

        const newBadges = [...(newUser.badges || [])];
        let nextBadgeToShow = state.unlockedBadgeToShow;

        const tryUnlock = (badgeId: string) => {
           if (!newBadges.includes(badgeId)) {
               newBadges.push(badgeId);
               if (!nextBadgeToShow) nextBadgeToShow = badgeId;
           }
        };

        if (newUser.trips >= 1) tryUnlock('route_rookie');
        if (newUser.trips >= 5) tryUnlock('path_explorer');
        if (newUser.trips >= 20) tryUnlock('urban_navigator');
        if (newUser.trips >= 50) tryUnlock('frequent_rider');
        if (newUser.trips >= 100) tryUnlock('ultimate_commuter');
        if (newUser.distance >= 50) tryUnlock('long_hauler');
        if (newUser.spent >= 100) tryUnlock('thrifty_commuter');
        if (newUser.streak_count >= 14) tryUnlock('habit_builder');
        if (newUser.streak_count >= 30) tryUnlock('dedicated_commuter');

        if (newBadges.length > (newUser.badges?.length || 0)) {
           newUser.badges = newBadges;
        }

        if (state.sessionMode === 'auth' && state.user.email) {
          // optionally sync to supabase
          supabase
            .from('users')
            .update({
              points: newUser.points,
              streak_count: newUser.streak_count,
              distance: newUser.distance,
              spent: newUser.spent,
              trips: newUser.trips,
              ...(newUser.badges ? { badges: newUser.badges } : {})
            })
            .eq('email', state.user.email)
            .then(({ error }) => {
              if (error && error.code !== 'PGRST204') console.log('Failed to sync trip stats to Supabase:', error.message);
            });
        }

        return { user: newUser, unlockedBadgeToShow: nextBadgeToShow };
      }),
      resetStreak: () => set((state) => ({ user: { ...state.user, streak_count: 0 } })),
      setSelectedTransitRoute: (route) => set({ selectedTransitRoute: route }),
      setPendingRouteSearch: (search) => set({ pendingRouteSearch: search }),
      setChatbotMessages: (messages) => set({ chatbotMessages: messages }),
      setChatbotConversationState: (chatbotConversationState) => set({ chatbotConversationState }),
      clearChatbotMemory: () => set({ chatbotMessages: [], chatbotConversationState: {} }),
      saveRoute: (route: any) =>
        set((state) => {
          const currentSaved = state.user.saved_routes || [];
          if (!currentSaved.find((r) => r.id === route.id)) {
            const newSavedRoutes = [...currentSaved, route];
            if (state.sessionMode === 'auth' && state.user.email) {
              supabase
                .from('users')
                .update({ saved_routes: newSavedRoutes })
                .eq('email', state.user.email)
                .then(({ error }) => {
                  if (error && error.code !== 'PGRST204') console.log('Failed to save route to Supabase:', error);
                });
            }
            return { user: { ...state.user, saved_routes: newSavedRoutes } };
          }
          return state;
        }),
      removeSavedRoute: (routeId: string | number) =>
        set((state) => {
          const newSavedRoutes = (state.user.saved_routes || []).filter((r) => r.id !== routeId);
          if (state.sessionMode === 'auth' && state.user.email) {
            supabase
              .from('users')
              .update({ saved_routes: newSavedRoutes })
              .eq('email', state.user.email)
              .then(({ error }) => {
                if (error && error.code !== 'PGRST204') console.log('Failed to save route to Supabase:', error);
              });
          }
          return {
            user: {
              ...state.user,
              saved_routes: newSavedRoutes,
            },
          };
        }),
      savePlace: (place: any) =>
        set((state) => {
          const currentSaved = state.user.saved_places || [];
          if (!currentSaved.find((p) => p.id === place.id)) {
            const newSavedPlaces = [...currentSaved, place];
            if (state.sessionMode === 'auth' && state.user.email) {
              supabase
                .from('users')
                .update({ saved_places: newSavedPlaces })
                .eq('email', state.user.email)
                .then(({ error }) => {
                  if (error && error.code !== 'PGRST204') console.log('Failed to save place to Supabase:', error);
                });
            }
            return { user: { ...state.user, saved_places: newSavedPlaces } };
          }
          return state;
        }),
      removeSavedPlace: (placeId: string) =>
        set((state) => {
          const newSavedPlaces = (state.user.saved_places || []).filter((p) => p.id !== placeId);
          if (state.sessionMode === 'auth' && state.user.email) {
            supabase
              .from('users')
              .update({ saved_places: newSavedPlaces })
              .eq('email', state.user.email)
              .then(({ error }) => {
                if (error && error.code !== 'PGRST204') console.log('Failed to remove saved route in Supabase:', error);
              });
          }
          return {
            user: {
              ...state.user,
              saved_places: newSavedPlaces,
            },
          };
        }),
      addHistory: (item: any) =>
        set((state) => {
          const currentHistory = state.user.commute_history || [];
          const newHistory = [item, ...currentHistory.filter((h: any) => h.id !== item.id)].slice(0, 20);
          return { user: { ...state.user, commute_history: newHistory } };
        }),
      updateLatestHistoryFare: (fare: number) =>
        set((state) => {
          const currentHistory = state.user.commute_history || [];
          if (currentHistory.length === 0) return state;
          const updatedHistory = [...currentHistory];
          updatedHistory[0] = { ...updatedHistory[0], fare: fare };
          return { user: { ...state.user, commute_history: updatedHistory } };
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
                if (error && error.code !== 'PGRST204') console.log('Failed to array-sync badge to Supabase:', error.message);
              });
          }
          
          return {
            user: { ...state.user, badges: newBadges },
            unlockedBadgeToShow: badgeId,
          };
        }),
      clearUnlockedBadge: () => set({ unlockedBadgeToShow: null }),
      resetProgress: () => set((state) => {
        const resetUser = {
          ...state.user,
          points: 0,
          streak_count: 0,
          distance: 0,
          spent: 0,
          trips: 0,
          badges: [],
          saved_routes: [],
          saved_places: [],
          commute_history: [],
        };
        
        if (state.sessionMode === 'auth' && state.user.email) {
          supabase
            .from('users')
            .update({
              points: 0,
              streak_count: 0,
              distance: 0,
              spent: 0,
              trips: 0,
              badges: [],
            })
            .eq('email', state.user.email)
            .then(({ error }) => {
              if (error) console.log('Failed to reset progress in Supabase:', error.message);
            });
        }
        
        return { user: resetUser };
      }),
      syncWithSupabase: async () => {
        const state = useStore.getState();
        if (state.sessionMode === 'auth' && state.user?.email) {
          try {
            const { data, error } = await supabase
              .from('users')
              .select('points, streak_count, distance, trips, spent, badges')
              .eq('email', state.user.email)
              .single();
              
            if (data && !error) {
              set((s) => ({
                user: {
                  ...s.user,
                  points: data.points ?? s.user.points ?? 0,
                  streak_count: data.streak_count ?? s.user.streak_count ?? 0,
                  distance: data.distance ?? s.user.distance ?? 0,
                  trips: data.trips ?? s.user.trips ?? 0,
                  spent: data.spent ?? s.user.spent ?? 0,
                  badges: data.badges ?? s.user.badges ?? [],
                  commute_history: s.user.commute_history || [],
                  saved_routes: s.user.saved_routes || [],
                  saved_places: s.user.saved_places || [],
                }
              }));
            }
          } catch (e) {
            console.error('Failed to sync with Supabase', e);
          }
        }
      },
    }),
    {
      name: 'para-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        sessionMode: state.sessionMode,
        insightDismissed: state.insightDismissed,
        selectedTransitRoute: state.selectedTransitRoute,
        chatbotMessages: state.chatbotMessages,
        chatbotConversationState: state.chatbotConversationState,
      }),
      merge: (persistedState: any, currentState: StoreState) => {
        if (!persistedState) return currentState;
        return {
          ...currentState,
          ...persistedState,
          user: {
            ...currentState.user,
            ...(persistedState.user || {}),
            commute_history: persistedState.user?.commute_history || currentState.user?.commute_history || [],
            saved_routes: persistedState.user?.saved_routes || currentState.user?.saved_routes || [],
            saved_places: persistedState.user?.saved_places || currentState.user?.saved_places || [],
          },
          chatbotMessages: persistedState.chatbotMessages || currentState.chatbotMessages || [],
          chatbotConversationState: persistedState.chatbotConversationState || currentState.chatbotConversationState || {},
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
