export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  goal: number;
}

export const BADGES: Badge[] = [
  { id: "route_rookie", name: "Route Rookie", description: "Complete your first route trip.", icon: "🔰", goal: 1 },
  { id: "path_explorer", name: "Path Explorer", description: "Use 5 different routes.", icon: "🗺️", goal: 5 },
  { id: "urban_navigator", name: "Urban Navigator", description: "Complete 20 trips.", icon: "🏙️", goal: 20 },
  { id: "city_roamer", name: "City Roamer", description: "Travel across 3 different cities.", icon: "📍", goal: 3 },
  { id: "long_hauler", name: "Long Hauler", description: "Travel a total of 50 km.", icon: "🛣️", goal: 50 },
  { id: "frequent_rider", name: "Frequent Rider", description: "Complete 50 trips.", icon: "🚌", goal: 50 },
  { id: "jeep_regular", name: "Jeep Regular", description: "Use jeepney routes 20 times.", icon: "🚙", goal: 20 },
  { id: "bus_rider", name: "Bus Rider", description: "Use bus routes 15 times.", icon: "🚌", goal: 15 },
  { id: "uv_express_commuter", name: "UV Express Commuter", description: "Use UV Express routes 10 times.", icon: "🚐", goal: 10 },
  { id: "tricycle_veteran", name: "Tricycle Veteran", description: "Use tricycle rides 20 times.", icon: "🛺", goal: 20 },
  { id: "multi_modal_commuter", name: "Multi-Modal Commuter", description: "Use at least 3 transport types in one trip.", icon: "🔄", goal: 3 },
  { id: "budget_saver", name: "Budget Saver", description: "Complete 10 trips under a set budget.", icon: "💵", goal: 10 },
  { id: "thrifty_commuter", name: "Thrifty Commuter", description: "Save ₱100 total.", icon: "🪙", goal: 100 },
  { id: "fare_planner", name: "Fare Planner", description: "Use the fare calculator 10 times.", icon: "🧮", goal: 10 },
  { id: "cost_optimizer", name: "Cost Optimizer", description: "Choose the cheapest route 5 times.", icon: "📉", goal: 5 },
  { id: "rush_hour_survivor", name: "Rush Hour Survivor", description: "Complete 5 trips during peak hours.", icon: "⏱️", goal: 5 },
  { id: "speed_commuter", name: "Speed Commuter", description: "Use fastest route 10 times.", icon: "⚡", goal: 10 },
  { id: "time_optimizer", name: "Time Optimizer", description: "Reduce travel time by switching routes 5 times.", icon: "⏳", goal: 5 },
  { id: "smart_planner", name: "Smart Planner", description: "View route details before 10 trips.", icon: "💡", goal: 10 },
  { id: "route_comparator", name: "Route Comparator", description: "Compare 3 routes in one session.", icon: "⚖️", goal: 3 },
  { id: "navigator", name: "Navigator", description: "Successfully follow 10 multi-leg routes.", icon: "🧭", goal: 10 },
  { id: "adaptive_commuter", name: "Adaptive Commuter", description: "Switch between route modes 5 times.", icon: "🔀", goal: 5 },
  { id: "map_explorer", name: "Map Explorer", description: "Open the map 20 times.", icon: "🗺️", goal: 20 },
  { id: "new_stop_discoverer", name: "New Stop Discoverer", description: "Visit 10 unique stops.", icon: "🚏", goal: 10 },
  { id: "terminal_hopper", name: "Terminal Hopper", description: "Visit 5 different terminals.", icon: "🚉", goal: 5 },
  { id: "daily_commuter", name: "Daily Commuter", description: "Use the app for 3 consecutive days.", icon: "📅", goal: 3 },
  { id: "dedicated_commuter", name: "Dedicated Commuter", description: "Maintain a 30-day streak.", icon: "🗓️", goal: 30 },
  { id: "habit_builder", name: "Habit Builder", description: "Complete at least 1 trip per day for 14 days.", icon: "📆", goal: 14 },
  { id: "multi_hop_master", name: "Multi-Hop Master", description: "Complete a trip with 3 or more transfers.", icon: "🦘", goal: 3 },
  { id: "ultimate_commuter", name: "Ultimate Commuter", description: "Complete 100 total trips.", icon: "🌟", goal: 100 },
  { id: "metro_connector", name: "Metro Connector", description: "Travel using multi-transport routes in one trip.", icon: "🚇", goal: 1 }
];