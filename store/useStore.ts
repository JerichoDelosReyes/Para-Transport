import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';
import { supabase } from '../config/supabaseClient';
import { BadgeData } from '../types/badges';

export type FareDiscountType = 'regular' | 'student' | 'senior' | 'pwd';

interface User {
  id?: string;
  username: string;
  full_name: string;
  email: string;
  points: number;
  streak_count: number;
  total_distance: number;
  spent: number; // Kept locally since it's not in admin schema
  total_trips: number;
  is_banned?: boolean;
  saved_routes?: any[];
  saved_places?: any[];
  commute_history?: any[];
  points_history?: any[];
  badges?: string[]; // Kept locally for now
  fare_discount_type?: FareDiscountType;
  last_ride_at?: string | null;
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
  destinationPromptCount?: number;
  pendingDestinationName?: string;
  pendingDestinationCoordinate?: { latitude: number; longitude: number };
  pendingDestinationPlaceId?: string;
  lastTopic?: 'app-guide';
  lastAppGuideId?: string;
};

type SessionMode = 'guest' | 'auth' | null;

const createGuestUser = (): User => ({
  full_name: 'Komyuter',
  username: 'Komyuter',
  email: 'guest@para.ph',
  points: 0,
  streak_count: 0,
  total_distance: 0,
  spent: 0,
  total_trips: 0,
  is_banned: false,
  saved_routes: [],
  saved_places: [],
  commute_history: [],
  badges: [],
  fare_discount_type: 'regular',
  last_ride_at: null,
});

interface StoreState {
  user: User;
  sessionMode: SessionMode;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  hasHydrated: boolean;
  badgesData: BadgeData[];
  setBadgesData: (badges: BadgeData[]) => void;
  fareMatrices: any[];
  setFareMatrices: (fares: any[]) => void;
  setFareDiscountType: (fareDiscountType: FareDiscountType) => void;
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
  addTripStats: (stats: { distance: number; fare: number; points: number; time?: number; multiplier?: number; origin?: string; destination?: string }) => void;
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
  dismissedBroadcasts: string[];
  dismissBroadcast: (id: string) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      user: createGuestUser(),
      sessionMode: null,
      notificationsEnabled: true,
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      hasHydrated: false,
      dismissedBroadcasts: [],
      badgesData: [],
      setBadgesData: (badgesData) => set({ badgesData }),
      fareMatrices: [],
      setFareMatrices: (fareMatrices) => set({ fareMatrices }),
      setFareDiscountType: (fareDiscountType) =>
        set((state) => ({
          user: {
            ...state.user,
            fare_discount_type: fareDiscountType,
          },
        })),
      insightDismissed: false,
      selectedTransitRoute: null,
      pendingRouteSearch: null,
      chatbotMessages: [],
      chatbotConversationState: {},
      unlockedBadgeToShow: null,
      setUser: (user) =>
        set((state) => ({
          user: {
            ...state.user,
            ...user,
            fare_discount_type: user.fare_discount_type || state.user?.fare_discount_type || 'regular',
          },
        })),
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
            ...state.user,
            ...user,
            commute_history: user.commute_history || state.user?.commute_history || [],
            saved_routes: user.saved_routes || state.user?.saved_routes || [],
            saved_places: user.saved_places || state.user?.saved_places || [],
            fare_discount_type: user.fare_discount_type || state.user?.fare_discount_type || 'regular',
          },
          sessionMode: 'auth',
        })),
      dismissBroadcast: (id: string) => set((state) => ({ dismissedBroadcasts: [...state.dismissedBroadcasts, id] })),
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
      addTripStats: ({ distance, fare, points, time, multiplier, origin, destination }) => set((state) => {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        let newStreak = state.user.streak_count || 0;
        let lastRideStr = null;

        if (state.user.last_ride_at) {
          const lastRideDate = new Date(state.user.last_ride_at);
          lastRideStr = lastRideDate.toISOString().split('T')[0];

          if (lastRideStr !== todayStr) {
             const yesterday = new Date();
             yesterday.setDate(now.getDate() - 1);
             const yesterdayStr = yesterday.toISOString().split('T')[0];

             if (lastRideStr === yesterdayStr) {
               newStreak += 1;
             } else {
               newStreak = 1;
             }
          }
        } else {
          newStreak = 1;
        }

        const historyItem = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            distance,
            fare,
            points,
            time,
            multiplier,
            origin,
            destination
          };
          const currentPointsHistory = state.user.points_history || [];
          const newPointsHistory = [historyItem, ...currentPointsHistory].slice(0, 200);

          const newUser: User = {
            ...state.user,
            points: (state.user.points || 0) + points,
            streak_count: newStreak,
            last_ride_at: now.toISOString(),
            total_distance: (state.user.total_distance || 0) + distance,
            spent: (state.user.spent || 0) + fare,
            total_trips: (state.user.total_trips || 0) + 1,
            points_history: newPointsHistory
          };

        const newBadges = [...(newUser.badges || [])];
        let nextBadgeToShow = state.unlockedBadgeToShow;

        const tryUnlock = (badgeId: string) => {
           if (!newBadges.includes(badgeId)) {
               newBadges.push(badgeId);
               if (!nextBadgeToShow) nextBadgeToShow = badgeId;
           }
        };

        state.badgesData.forEach(badge => {
          const userValue = Number(newUser[badge.condition_type as keyof User]) || 0;
          if (userValue >= badge.condition_value) tryUnlock(badge.id);
        });

        if (newBadges.length > (newUser.badges?.length || 0)) {
           newUser.badges = newBadges;
        }

        if (state.sessionMode === 'auth' && state.user.id) {
          // optionally sync to supabase
          supabase
            .from('users')
            .update({
              points: newUser.points,
              streak_count: newUser.streak_count,
              last_ride_at: newUser.last_ride_at,
              total_distance: newUser.total_distance,
              total_trips: newUser.total_trips,
              total_fare: newUser.spent,
              points_history: newUser.points_history,
            })
            .eq('id', state.user.id)
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
            if (state.sessionMode === 'auth' && state.user.id) {
              supabase
                .from('users')
                .update({ saved_routes: newSavedRoutes })
                .eq('id', state.user.id)
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
          if (state.sessionMode === 'auth' && state.user.id) {
            supabase
              .from('users')
              .update({ saved_routes: newSavedRoutes })
              .eq('id', state.user.id)
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
            if (state.sessionMode === 'auth' && state.user.id) {
              supabase
                .from('users')
                .update({ saved_places: newSavedPlaces })
                .eq('id', state.user.id)
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
          if (state.sessionMode === 'auth' && state.user.id) {
            supabase
              .from('users')
              .update({ saved_places: newSavedPlaces })
              .eq('id', state.user.id)
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
          const newHistory = [item, ...currentHistory.filter((h: any) => h.id !== item.id)].slice(0, 200);
          
          if (state.sessionMode === 'auth' && state.user.id) {
            supabase
              .from('users')
              .update({ commute_history: newHistory })
              .eq('id', state.user.id)
              .then(({ error }) => {
                if (error && error.code !== 'PGRST204') console.error('Error saving history to Supabase:', error);
              });
          }
          
          return { user: { ...state.user, commute_history: newHistory } };
        }),
      updateLatestHistoryFare: (fare: number) =>
        set((state) => {
          const currentHistory = state.user.commute_history || [];
          if (currentHistory.length === 0) return state;
          const updatedHistory = [...currentHistory];
          updatedHistory[0] = { ...updatedHistory[0], fare: fare };
          
          if (state.sessionMode === 'auth' && state.user.id) {
            supabase
              .from('users')
              .update({ commute_history: updatedHistory })
              .eq('id', state.user.id)
              .then(({ error }) => {
                if (error && error.code !== 'PGRST204') console.error('Error updating history fare to Supabase:', error);
              });
          }
          
          return { user: { ...state.user, commute_history: updatedHistory } };
        }),
      clearHistory: () =>
        set((state) => {
          if (state.sessionMode === 'auth' && state.user.id) {
            supabase
              .from('users')
              .update({ commute_history: [] })
              .eq('id', state.user.id)
              .then(({ error }) => {
                if (error && error.code !== 'PGRST204') console.error('Error clearing history in Supabase:', error);
              });
          }
          
          return {
            user: { ...state.user, commute_history: [] },
          };
        }),
      unlockBadge: (badgeId: string) =>
        set((state) => {
          const currentBadges = state.user.badges || [];
          if (currentBadges.includes(badgeId)) return state;
          
          const newBadges = [...currentBadges, badgeId];
          
          // update supabase if authenticated
          if (state.sessionMode === 'auth' && state.user.id) {
            supabase
              .from('users')
              .update({ badges: newBadges })
              .eq('id', state.user.id)
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
          total_distance: 0,
          spent: 0,
          total_trips: 0,
          badges: [],
          saved_routes: [],
          saved_places: [],
          commute_history: [],
          points_history: [],
        };
        
        if (state.sessionMode === 'auth' && state.user.id) {
          supabase
            .from('users')
            .update({
              points: 0,
              streak_count: 0,
              total_distance: 0,
              total_fare: 0,
              total_trips: 0,
              badges: [],
              last_ride_at: null,
              points_history: [],
              commute_history: [],
            })
            .eq('id', state.user.id)
            .then(({ error }) => {
              if (error) console.log('Failed to reset progress in Supabase:', error.message);
            });
        }
        
        return { user: resetUser };
      }),
      syncWithSupabase: async () => {
        const state = useStore.getState();
        if (state.sessionMode === 'auth' && state.user?.id) {
          try {
            const { data, error } = await supabase
              .from('users')
              .select('points, streak_count, total_distance, total_trips, total_fare, badges, last_ride_at')
              .eq('id', state.user.id)
              .single();
              
            if (data && !error) {
              set((s) => ({
                user: {
                  ...s.user,
                  points: data.points ?? s.user.points ?? 0,
                  streak_count: data.streak_count ?? s.user.streak_count ?? 0,
                  last_ride_at: data.last_ride_at ?? s.user.last_ride_at ?? null,
                  total_distance: data.total_distance ?? s.user.total_distance ?? 0,
                  total_trips: data.total_trips ?? s.user.total_trips ?? 0,
                  spent: data.total_fare ?? s.user.spent ?? 0,
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
        dismissedBroadcasts: state.dismissedBroadcasts,
      }),
      merge: (persistedState: any, currentState: StoreState) => {
        if (!persistedState) return currentState;

        const {
          chatbotMessages: _ignoredChatbotMessages,
          chatbotConversationState: _ignoredChatbotConversationState,
          ...safePersistedState
        } = persistedState;

        return {
          ...currentState,
          ...safePersistedState,
          user: {
            ...currentState.user,
            ...(persistedState.user || {}),
            commute_history: persistedState.user?.commute_history || currentState.user?.commute_history || [],
            saved_routes: persistedState.user?.saved_routes || currentState.user?.saved_routes || [],
            saved_places: persistedState.user?.saved_places || currentState.user?.saved_places || [],
            fare_discount_type: persistedState.user?.fare_discount_type || currentState.user?.fare_discount_type || 'regular',
          },
          chatbotMessages: currentState.chatbotMessages || [],
          chatbotConversationState: currentState.chatbotConversationState || {},
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
