# Supabase Setup Guide for Para Transit App

## Overview

The Para app uses a **Firebase + Supabase hybrid architecture**:
- **Firebase Auth**: Handles user authentication (Google Sign-In)
- **Supabase PostgreSQL**: Stores all transit data and user analytics

## Tables and Purpose

### Transit Network Tables
- **transit_stops**: All stops, stations, terminals, landmarks
- **transit_connections**: Direct routes between stops (jeepney, bus, tricycle, LRT, MRT)
- **commute_paths**: Complete routes calculated by A* algorithm (cached for 24 hours)

### User Data Tables
- **user_preferences**: User achievements, saved trips, search history, stats, experience level
- **user_trip_history**: Detailed analytics of each trip completed
- **route_search_analytics**: Tracks all route searches for insights

## Setup Steps

### 1. Execute SQL Setup in Supabase Console

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project: `para-app-55ba8`
3. Go to **SQL Editor** → **New Query**
4. Open `/docs/backend/supabase.setup.sql` and copy the entire contents
5. Paste into the Supabase SQL Editor
6. Click **Run** button

✅ This will create all tables, indexes, triggers, and sample data

### 2. Verify Setup Completed

In Supabase console, go to **Table Editor** and verify these collections exist:
- ✅ transit_stops (5 sample stops)
- ✅ transit_connections (4 sample routes)
- ✅ commute_paths (empty, will be populated by app)
- ✅ user_preferences (empty, created by AuthContext on first login)
- ✅ user_trip_history (empty)
- ✅ route_search_analytics (empty)

### 3. Test the App

1. Make sure Expo is running: `npx expo start --tunnel --go --scheme para`
2. Scan QR code in Expo Go
3. Click "Sign in with Google"
4. After successful sign-in, go to Firebase Console → Firestore → **users** collection
5. You should see a new user document

## Architecture Details

### Authentication Flow
```
User → Google OAuth → Firebase Auth → Auto-create Firestore profile
                                    → Continue to app
```

### Data Flow
```
App searches for route → A* Pathfinding Backend → Calculates path
                                                 → Stores in commute_paths table
                                                 → Returns to app
                                                 → User can save trip

User saves trip → Firebase stores in user_preferences.savedTrips (JSONB)
              → (Optional) Also log to supabase.user_trip_history
              
User completes trip → Log analytics → supabase.route_search_analytics
                    → Update user_preferences.stats
```

### Tables Schema

#### user_preferences (Main User Preferences)
```json
{
  "uid": "firebase-uid",
  "username": "johndoe",
  "phone_number": "+63912345678",
  "saved_trips": [
    {
      "id": "trip-123",
      "origin_name": "Ayala Northpoint",
      "origin_coords": [14.5888, 121.0363],
      "destination_name": "QC Circle",
      "destination_coords": [14.6349, 121.0331],
      "path_id": "commute-path-456",
      "createdAt": "2026-03-17T10:30:00Z"
    }
  ],
  "search_history": [...],
  "stats": {
    "distanceTraveled": 45.5,
    "puvEntered": 12,
    "tripsCompleted": 8,
    "routesSearched": 23
  },
  "user_level": {
    "currentLevel": 3,
    "exp": 420,
    "expToNextLevel": 150
  },
  "achievement_ids": ["first_trip", "ten_stops"]
}
```

#### commute_paths (A* Results Cache)
```json
{
  "id": "path-123",
  "origin_stop_id": "stop_ayala_qc",
  "destination_stop_id": "stop_qc_circle",
  "path_stop_ids": ["stop_ayala_qc", "stop_edsa_cubao", "stop_qc_circle"],
  "connection_ids": ["conn_1", "conn_2"],
  "total_distance_km": 5.7,
  "total_time_minutes": 35,
  "total_fare_php": 23.0,
  "num_transfers": 1,
  "vehicle_types_used": ["bus", "jeepney"],
  "difficulty": "easy",
  "valid_until": "2026-03-18T10:30:00Z"
}
```

## Production Configuration

### 1. Enable Row-Level Security (RLS)

Uncomment RLS policies in `supabase.setup.sql` lines starting with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`

This ensures:
- Users can only read/write their own preferences
- Anonymous access is read-only for transit data

### 2. Update Environment Variables

Your `.env` already has Supabase credentials:
```bash
EXPO_PUBLIC_SUPABASE_URL="https://trdfunraqkiwjgoxfefi.supabase.co"
EXPO_PUBLIC_SUPABASE_ANON_KEY="..." # Anon key for app
```

For backend-only operations (admin), use Service Role Key from Supabase → Settings → API

### 3. Backup Plan

Regular backups are **automatically enabled** in Supabase free tier (7-day retention)
- Go to Supabase Console → Backups to manage

## API Integration

### Route Search Service

The app's route search flow:

```typescript
// App searches for route
const results = await apiService.searchRoutes({
  origin: { lat, lng, name },
  destination: { lat, lng, name },
  vehicleTypes: ['jeepney', 'bus'],
  maxTransfers: 2
});

// Backend:
// 1. Calls A* pathfinding algorithm
// 2. Stores result in supabase.commute_paths
// 3. Returns to app
// 4. App logs search to route_search_analytics (optional)
```

### Storing User Preferences

Preferences are stored in **two places** (for redundancy):
1. **Firebase Firestore**: User profile & settings (primary)
2. **Supabase user_preferences**: Mirror for SQL queries & analytics

## Troubleshooting

### Q: User profile not appearing in Firestore?
- Check Firebase Console → Console logs for errors
- Verify Google OAuth redirect URI is correct in Google Cloud Console
- Check browser console (press `j` in Expo to open debugger)

### Q: Empty tables in Supabase?
- Sample data is only for transit_stops and transit_connections
- Other tables populate during app usage
- Run sample searches to generate commute_paths

### Q: Getting "permission denied" error?
- ANON key permissions might be restricted
- Use ANON key in app (not Service Role)
- Ensure GRANT statements executed successfully

## Next Steps

1. ✅ Run SQL setup in Supabase Console
2. ✅ Test app sign-in flow
3. ✅ Connect A* backend to insert commute_paths
4. ✅ Implement route search API integration
5. ✅ Add trip logging analytics
6. 🔲 Enable RLS for production
7. 🔲 Set up automated data backups

---

**Questions?** Check app logs: Press `j` in Expo Go → Console
