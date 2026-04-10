# Para Mobile

Para Mobile is a commuter-focused mobile application for navigating local public transportation networks in the Philippines. It is designed for practical, real-world travel planning across jeepney, bus, tricycle, and UV Express routes, with route recommendations that consider time, fare, and transfer complexity.

## Overview

Traditional navigation tools often underrepresent informal or community-curated transit networks. Para Mobile addresses this by combining:

- A local-first route discovery engine
- Supabase-backed transit datasets
- MapLibre-based interactive mapping
- User-focused commute features such as saved routes, history, and points tracking

The result is a routing experience tailored to day-to-day commuting conditions.

## Core Features

- Multi-modal route planning (jeepney, bus, tricycle, UV Express)
- Transfer-aware route recommendations (easiest, fastest, cheapest)
- Last-mile tricycle extension support
- Interactive map with route overlays, POIs, and terminal markers
- Saved routes and commute history
- Account and guest session modes
- Points, badges, and leaderboard tracking
- Broadcast announcements and global offline status handling
- AI chatbot-assisted trip planning flow

## Technology Stack

| Category | Stack |
| --- | --- |
| Mobile Framework | React Native, Expo, Expo Router |
| Map Engine | MapLibre React Native |
| Backend | Supabase (Postgres, Auth, Realtime) |
| State Management | Zustand (persisted local store) |
| Geospatial/Spatial Tools | Turf.js, custom route search engine |
| Styling | Nativewind, React Native StyleSheet |
| Local Persistence | AsyncStorage |
| Notifications and Device APIs | Expo Notifications, Expo Location, Expo Haptics |

## Mapping and Routing Design

- Map rendering is powered by MapLibre with hosted style URLs and fallback strategies.
- Route matching uses a transfer-aware best-first search pipeline with spatial candidate pruning.
- Walking and tricycle connector geometry can be road-resolved through OSRM endpoints.
- Transit route data is fetched from vehicle-specific Supabase tables and cached locally for resilience.

## Data Sources and Pipeline

Para supports a structured transit import workflow:

1. Source route data from Overpass Turbo / OpenStreetMap exports (GPX/GeoJSON).
2. Run importer scripts under supabase/importers to normalize and upsert route geometry and stops.
3. Store routes in vehicle-specific tables:
   - jeepney_routes / jeepney_route_stops
   - bus_routes / bus_route_stops
   - tricycle_routes / tricycle_route_stops
   - uv_express_routes / uv_express_route_stops
4. Load and cache normalized route data in-app for map display and route search.

## Prerequisites

- Node.js 18+
- npm
- Expo-compatible Android/iOS environment
- Supabase project (for authenticated and synced features)

## Setup

1. Clone the repository.

```bash
git clone https://github.com/JerichoDelosReyes/Para-Transport.git
cd Para-Transport
```

2. Install dependencies.

```bash
npm install
```

3. Create a .env file in the project root and define the required variables.

## Environment Variables

Required for app runtime:

| Variable | Required | Description |
| --- | --- | --- |
| EXPO_PUBLIC_SUPABASE_URL | Yes | Supabase project URL |
| EXPO_PUBLIC_SUPABASE_ANON_KEY | Yes | Supabase anon key for client access |

Required for importer/admin scripts:

| Variable | Required | Description |
| --- | --- | --- |
| SUPABASE_SERVICE_ROLE_KEY | Yes (scripts) | Service role key for importer and maintenance scripts |

Optional map and geocoding configuration:

| Variable | Description |
| --- | --- |
| EXPO_PUBLIC_GEOCODING_BASE_URL | Geocoding base URL (default: Nominatim) |
| EXPO_PUBLIC_MAPLIBRE_STYLE_URL | Explicit MapLibre style URL |
| EXPO_PUBLIC_PARAGIS_STYLE_STRATEGY | Style resolution strategy (for pinned/latest behavior) |
| EXPO_PUBLIC_PARAGIS_STYLE_URL_PINNED | Pinned style URL |
| EXPO_PUBLIC_PARAGIS_STYLE_URL_FALLBACK | Fallback style URL |
| EXPO_PUBLIC_PARAGIS_STYLE_URL_LIGHT | Light style URL |
| EXPO_PUBLIC_PARAGIS_STYLE_URL_DARK | Dark style URL |
| EXPO_PUBLIC_MAPTILER_KEY | Optional MapTiler key |
| EXPO_PUBLIC_MAPTILER_STYLE | Optional MapTiler style slug |
| EXPO_PUBLIC_OSM_TILE_URL | Optional custom raster tile URL |
| EXPO_PUBLIC_LIGHT_TILE_URL | Optional alternate light tile URL |
| EXPO_PUBLIC_FEATURE_USE_MAPLIBRE | Feature flag for map renderer toggling |

Optional chatbot configuration:

| Variable | Description |
| --- | --- |
| EXPO_PUBLIC_GROQ_API_KEY | Client-side chatbot API key |
| EXPO_PUBLIC_GROQ_GUARDRAIL_API_KEY | Optional guardrail-specific chatbot key |

## Running the App

Recommended for native modules and map rendering:

```bash
npx expo start --dev-client --lan --clear
```

Other common commands:

```bash
npm run start
npm run android
npm run ios
npm run web
```

## Available Scripts

| Command | Purpose |
| --- | --- |
| npm run start | Start Expo dev server |
| npm run android | Run Android native build |
| npm run ios | Run iOS native build |
| npm run web | Run web target |
| npm run supabase:types | Generate Supabase TypeScript types |
| npm run generate:tricycle-terminals-fallback | Build fallback terminal dataset |
| npm run find:tricycle-extension-tests | Find candidate test pairs for tricycle extension |
| npm run import:tricycle-terminals | Import tricycle terminals from GPX |
| npm run verify:tricycle-terminals | Verify tricycle terminal import output |

## Import and Maintenance Notes

The repository includes importer and maintenance scripts under:

- supabase/importers
- scripts

These scripts require EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

## Troubleshooting

- If map or speech features are unavailable, verify you are running a dev client build (not a limited runtime).
- If tunnel startup is unreliable in your network, prefer LAN mode for local development.
- If no routes appear, verify Supabase route tables are populated and the app has valid environment variables.

## Security

For vulnerability reporting and security process details, see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome through pull requests and issues. When proposing changes, include:

- Clear problem statement
- Scope and expected behavior
- Testing notes

## License

License status is currently to be determined.
