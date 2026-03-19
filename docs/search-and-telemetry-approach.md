# Search and Telemetry Approach (Cavite-first)

## Why this exists
The Home search flow should be reliable even when public APIs are slow, rate-limited, or return ambiguous place names. It should also be observable from the Metro terminal so engineering can debug user-reported issues quickly.

## Product goals
- Users can type common Cavite destinations and get understandable suggestions.
- Users can quickly tell whether a searched location is known to the app.
- Search flow does not fail silently.
- Engineering can trace all key user interactions and algorithm stages from terminal logs.

## Search architecture
1. Local-first location matching (offline-capable)
- Build a local location index from route stop labels in generated transit data.
- Normalize queries (trim, lowercase, collapse spaces).
- Rank in order: exact, prefix, contains.
- Return local matches immediately.

2. Remote geocoding fallback (bounded)
- Only call Nominatim when local matches are weak or empty.
- Use Cavite-bounded query parameters (`viewbox`, `bounded=1`, `countrycodes=ph`).
- Merge remote results with local results; deduplicate by normalized title and coordinate bucket.

3. Routing fallback strategy
- Primary: OSRM route request.
- If OSRM returns 400 or no geometry, use direct-line fallback from current location to destination.
- Inform user that fallback is direct-line (non-drivable certainty).

## Do we need a text location list?
Yes. A maintained gazetteer is strongly recommended.

Minimum viable list:
- Route terminals (start and end)
- Known landmarks and malls
- Common barangay and district names
- Alternate spellings / aliases (e.g., "SM Molino", "S.M. Molino")

Recommended structure:
```json
{
  "id": "district-imus",
  "title": "District",
  "aliases": ["The District", "District Imus"],
  "coordinate": [120.94, 14.40],
  "weight": 10,
  "tags": ["landmark", "mall"]
}
```

Ranking inputs:
- Text match score (exact > prefix > contains > alias)
- Distance to current location
- Route frequency / route coverage count
- Optional manual weight override for high-traffic landmarks

## Telemetry requirements
The app should log, in order, all meaningful states and interactions:

User interactions:
- Search opened/closed
- Search text updates and submit presses
- Suggestion tapped
- Mode tab pressed
- Bottom sheet toggled
- Route selection tapped on map overlay

Background execution:
- Local-match count per query
- Geocoding request start/success/failure
- Routing request status and fallback path
- Route summary generated (distance/time)
- Location permission and GPS state

Rendering state:
- Map ready
- Suggestion list count
- Route polyline coordinate count
- Selected route code

## Log format
Prefix all logs with a stable tag and sequence:
- `[ParaTrace][timestamp][#sequence][scope] event {payload}`

Example:
- `[ParaTrace][2026-03-19T12:00:00.000Z][#0042][HomeScreen] route-search-osrm-response {"status":400}`

## Operational checklist for debugging
1. Confirm local route data loaded (`useJeepneyRoutes load-success`).
2. Check `User Search:` and `Available Locations for ...` output.
3. Check whether route search used local destination or remote geocode.
4. Inspect OSRM response status.
5. If fallback used, verify destination coordinate is plausible for Cavite.

## Next improvements
- Add a dedicated `data/known-locations.json` gazetteer with aliases and curated coordinates.
- Add fuzzy matching (Levenshtein/token overlap) for typo-tolerance.
- Add telemetry screen export to copy a compact diagnostic report for bug tickets.
