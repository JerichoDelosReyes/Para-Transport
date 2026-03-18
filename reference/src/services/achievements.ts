/**
 * Achievements Service
 *
 * Defines the achievements list and helper functions
 * to compute unlocked achievements from user stats.
 */

import { UserStats, Achievement } from '../types/user';

export type { Achievement };

export const ACHIEVEMENTS_LIST: Achievement[] = [
  { id: 'first_ride', title: 'First Ride', description: 'Complete your first trip', icon: 'trophy' },
  { id: 'ten_km_club', title: '10km Club', description: 'Travel 10 kilometers in total', icon: 'house' },
  { id: 'explorer', title: 'Explorer', description: 'Discover 5 new places', icon: 'briefcase' },
  { id: 'commuter_lvl_3', title: 'Level 3', description: 'Reach commuter level 3', icon: 'graduation' },
];

/**
 * Compute unlocked achievements based on stats.
 * This does not persist; use with server-provided achievement IDs.
 */
export const checkAchievements = (stats: UserStats): Achievement[] => {
  const unlocked: string[] = [];

  if ((stats?.tripsCompleted || 0) >= 1) unlocked.push('first_ride');
  if ((stats?.distanceTraveled || 0) >= 10) unlocked.push('ten_km_club');
  // Explorer: we approximate via routes searched or trips completed
  if (((stats?.routesSearched || 0) + (stats?.tripsCompleted || 0)) >= 5) unlocked.push('explorer');
  // Commuter Level 3: assume level inferred elsewhere; use tripsCompleted threshold as proxy
  if ((stats?.tripsCompleted || 0) >= 15) unlocked.push('commuter_lvl_3');

  return ACHIEVEMENTS_LIST.filter((a) => unlocked.includes(a.id));
};
