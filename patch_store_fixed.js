const fs = require('fs');
let code = fs.readFileSync('store/useStore.ts', 'utf8');

// 1. Add points_history to User interface
code = code.replace(/commute_history\?:\s*any\[\];/, "commute_history?: any[];\n  points_history?: any[];");

// 2. Update signature of addTripStats
code = code.replace(/addTripStats:\s*\(stats:\s*\{\s*distance:\s*number;\s*fare:\s*number;\s*points:\s*number\s*\}\)\s*=>\s*void;/, 
"addTripStats: (stats: { distance: number; fare: number; points: number; time?: number; multiplier?: number; origin?: string; destination?: string }) => void;");

// 3. Update parameters in addTripStats implementation
code = code.replace(/addTripStats:\s*\(\{\s*distance,\s*fare,\s*points\s*\}\)\s*=>\s*set\(\(state\)\s*=>\s*\{/, 
"addTripStats: ({ distance, fare, points, time, multiplier, origin, destination }) => set((state) => {");

// 4. Update newUser object to push history
const createNewUserRegex = /const newUser:\s*User\s*=\s*\{\s*\.\.\.state\.user,\s*points:\s*\(state\.user\.points\s*\|\|\s*0\)\s*\+\s*points,\s*streak_count:\s*newStreak,\s*last_ride_at:\s*now\.toISOString\(\),\s*total_distance:\s*\(state\.user\.total_distance\s*\|\|\s*0\)\s*\+\s*distance,\s*spent:\s*\(state\.user\.spent\s*\|\|\s*0\)\s*\+\s*fare,\s*total_trips:\s*\(state\.user\.total_trips\s*\|\|\s*0\)\s*\+\s*1,\s*\};/s;

const matchedNewUser = code.match(createNewUserRegex);
if (matchedNewUser) {
  const replacement = `const historyItem = {
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
          };`;
          
  code = code.replace(createNewUserRegex, replacement);
  fs.writeFileSync('store/useStore.ts', code);
  console.log("Store patched smoothly!");
} else {
  console.log("Could not find newUser initialization block");
}
