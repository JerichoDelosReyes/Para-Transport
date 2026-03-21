const fs = require('fs');

let content = fs.readFileSync('app/achievements.tsx', 'utf8');

const imageMapping = `import { Image } from 'react-native';

const BADGE_IMAGES: Record<string, any> = {
  'route_rookie': require('../assets/achievements/RouteRookie.png'),
  'path_explorer': require('../assets/achievements/PathExplorer.png'),
  'urban_navigator': require('../assets/achievements/UrbanNavigator.png'),
  'city_roamer': require('../assets/achievements/CityRoamer.png'),
  'long_hauler': require('../assets/achievements/LongHauler.png'),
  'frequent_rider': require('../assets/achievements/FrequentRider.png'),
  'jeep_regular': require('../assets/achievements/JeepRider.png'),
  'bus_rider': require('../assets/achievements/BusRider.png'),
  'uv_express_commuter': require('../assets/achievements/UVExpressRider.png'),
  'tricycle_veteran': require('../assets/achievements/TricycleRider.png'),
  'multi_modal_commuter': require('../assets/achievements/MultiModalCommuter.png'),
  'budget_saver': require('../assets/achievements/BudgetSaver.png'),
  'fare_planner': require('../assets/achievements/FarePlanner.png'),
  'cost_optimizer': require('../assets/achievements/CostOptimizer.png'),
  'rush_hour_survivor': require('../assets/achievements/RushHourSurvivor.png'),
  'speed_commuter': require('../assets/achievements/SpeedCommuter.png'),
  'time_optimizer': require('../assets/achievements/TimeOptimizer.png'),
  'early_bird': require('../assets/achievements/EarlyBird.png'),
  'smart_planner': require('../assets/achievements/SmartPlanner.png'),
  'route_comparator': require('../assets/achievements/RouteComparator.png'),
  'navigator': require('../assets/achievements/Navigator.png'),
  'adaptive_commuter': require('../assets/achievements/AdaptiveCommuter.png'),
  'map_explorer': require('../assets/achievements/MapExplorer.png'),
  'new_stop_discoverer': require('../assets/achievements/NewStopDiscoverer.png'),
  'dedicated_commuter': require('../assets/achievements/DedicatedCommuter.png'),
  'habit_builder': require('../assets/achievements/HabitBuilder.png'),
  'multi_hop_master': require('../assets/achievements/MultiHopMaster.png'),
  'ultimate_commuter': require('../assets/achievements/UltimateCommuter.png'),
};

export default function AchievementsScreen() {`;

content = content.replace('export default function AchievementsScreen() {', imageMapping);

const newIconWrapper = `<View style={[styles.iconWrapper]}>
                  {BADGE_IMAGES[badge.id] ? (
                    <Image 
                      source={BADGE_IMAGES[badge.id]} 
                      style={[styles.badgeImage, isLocked && { opacity: 0.3 }]} 
                      resizeMode="contain" 
                    />
                  ) : (
                    <Text style={[styles.iconTxt, isLocked && { opacity: 0.3 }]}>
                      {badge.icon}
                    </Text>
                  )}
                  {isLocked && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={16} color="#555" />
                    </View>
                  )}`;

content = content.replace(
  /<View style={\[styles\.iconWrapper\]}>[\s\S]*?<\/View>\s*<View style={styles\.textWrapper}>/m,
  newIconWrapper + '\n                </View>\n                <View style={styles.textWrapper}>'
);

// add badgeImage style
content = content.replace(
  /iconTxt: \{\s*fontSize: 45,\s*\},/,
  `iconTxt: {
    fontSize: 45,
  },
  badgeImage: {
    width: 60,
    height: 60,
  },`
);

fs.writeFileSync('app/achievements.tsx', content);
