import { create } from 'zustand';
import type { PlannedRouteOption } from '../services/transitSearch';

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
  activeJourneyRoute: PlannedRouteOption | null;
  activeJourneyOriginLabel: string | null;
  activeJourneyDestinationLabel: string | null;
  activeJourneyStepIndex: number;
  dismissInsight: () => void;
  addPoints: (points: number) => void;
  setActiveJourneyPlan: (route: PlannedRouteOption, originLabel: string, destinationLabel: string) => void;
  clearActiveJourneyPlan: () => void;
  advanceJourneyStep: () => void;
  resetJourneyStep: () => void;
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
  activeJourneyRoute: null,
  activeJourneyOriginLabel: null,
  activeJourneyDestinationLabel: null,
  activeJourneyStepIndex: 0,
  dismissInsight: () => set({ insightDismissed: true }),
  addPoints: (points) => set((state) => ({ user: { ...state.user, points: state.user.points + points } })),
  setActiveJourneyPlan: (route, originLabel, destinationLabel) =>
    set({
      activeJourneyRoute: route,
      activeJourneyOriginLabel: originLabel,
      activeJourneyDestinationLabel: destinationLabel,
      activeJourneyStepIndex: 0,
    }),
  clearActiveJourneyPlan: () =>
    set({
      activeJourneyRoute: null,
      activeJourneyOriginLabel: null,
      activeJourneyDestinationLabel: null,
      activeJourneyStepIndex: 0,
    }),
  advanceJourneyStep: () =>
    set((state) => {
      const maxIndex = Math.max(0, (state.activeJourneyRoute?.directions.length ?? 1) - 1);
      return { activeJourneyStepIndex: Math.min(state.activeJourneyStepIndex + 1, maxIndex) };
    }),
  resetJourneyStep: () => set({ activeJourneyStepIndex: 0 }),
}));
