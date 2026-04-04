const fs = require('fs');
let code = fs.readFileSync('store/useStore.ts', 'utf8');

// Add points_history type
code = code.replace(/commute_history\?:\s*any\[\];/, "commute_history?: any[];\n  points_history?: any[];");

// Update addTripStats signature
code = code.replace(/addTripStats:\s*\(stats:\s*\{\s*distance:\s*number;\s*fare:\s*number;\s*points:\s*number\s*\}\)\s*=>\s*void;/, 
"addTripStats: (stats: { distance: number; fare: number; points: number; time?: number; multiplier?: number; origin?: string; destination?: string }) => void;");

// Update addTripStats implementation
const oldImplHead = "addTripStats: ({ distance, fare, points }) => set((state) => {";
const newImplHead = "addTripStats: ({ distance, fare, points, time, multiplier, origin, destination }) => set((state) => {";
code = code.replace(oldImplHead, newImplHead);

const oldImplTail = /return \{\s*user:\s*\{\s*\.\.\.state\.user,\s*points:\s*state\.user\.points\s*\+\s*points,\s*total_distance:\s*state\.user\.total_distance\s*\+\s*distance,\s*spent:\s*state\.user\.spent\s*\+\s*fare,\s*total_trips:\s*state\.user\.total_trips\s*\+\s*1,\s*streak_count:\s*newStreak,\s*last_ride_at:\s*newLastRideAt\s*\},\s*\};\s*\}\);/s;

const matchedTail = code.match(oldImplTail);
if (matchedTail) {
  const newTail = `
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

        return {
          user: {
            ...state.user,
            points: state.user.points + points,
            total_distance: state.user.total_distance + distance,
            spent: state.user.spent + fare,
            total_trips: state.user.total_trips + 1,
            streak_count: newStreak,
            last_ride_at: newLastRideAt,
            points_history: newPointsHistory
          },
        };
      });`;
  code = code.replace(matchedTail[0], newTail);
  fs.writeFileSync('store/useStore.ts', code);
  console.log("Patched useStore.ts successfully");
} else {
  console.log("Could not match tail in useStore.ts");
}
