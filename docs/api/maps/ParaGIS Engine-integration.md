#  ParaMaps Integration Guide

Implementation of ParaGIS Engine (Publicly known as ParaMaps™). An open source heavy Geographic Information System (GIS) data based on the Philippine OSM maps hosted in Azure Infrastructure

This guide explains how to consume the deployed Para InfraGIS map stack from a mobile client.

## Locked Parameters

- Canonical Style URL: `https://paragisstorage.blob.core.windows.net/maps/style-latest.json`
- Map Renderer: MapLibre

## Client Implementation

Set your MapLibre `styleURL` to:

`https://paragisstorage.blob.core.windows.net/maps/style-latest.json`

No local map data needs to be bundled with the APK/IPA.

## App-Side Prerequisites (Required)

Before rollout, verify these app-side prerequisites:

- The active map screen renders with MapLibre components (not `react-native-maps`).
- `@maplibre/maplibre-react-native` is declared in dependencies and linked for native targets.
- The map view passes the canonical Azure style URL into MapLibre `styleURL`.
- Native build mode is used (custom dev client or production build), not Expo Go. (see `Required Build Mode`)

## What Must Be Implemented In This Repo

1. Migrate the main map renderer from `react-native-maps` to MapLibre on the active map screen.
2. Pass `MAP_CONFIG.CANONICAL_STYLE_URL` into MapLibre `styleURL`.
3. Re-map overlays/interactions (markers, polylines, callouts, long-press handlers, camera controls) to MapLibre equivalents.
4. Validate on iOS and Android custom dev builds.

## Version Naming and Cache Busting

This project publishes immutable versioned styles (for example, `style-v20260403-a1b2c3d.json`).

### Immutable Versioned Style Format

Example:

`style-v20260403-a1b2c3d.json`

Meaning of each part:

- `style` - style artifact prefix.
- `v` - version marker (indicates this is a release artifact, not an ad-hoc file).
- `20260403` - release date token in `YYYYMMDD` format.
- `a1b2c3d` - short Git commit hash tied to the source revision that produced this style.
- `.json` - style specification file format consumed by MapLibre.

Immutability rule:

- Once uploaded, a versioned file name is not overwritten.
- New styling releases publish a new versioned file name.
- `style-latest.json` is the mutable pointer that is updated to the newest release.

Why this matters:

- Mobile clients, CDNs, and intermediate proxies can cache style files aggressively.
- If the file name stays the same, some users may keep seeing an older style after deployment.
- Changing the versioned file name forces clients to fetch the new file immediately (cache busting).

Client integration rule:

- If your app pins a versioned style URL, you must update the file name in the app whenever a new map styling release is deployed.
- If your app uses `style-latest.json`, you do not change the name each release, but users can still briefly see stale cache depending on network/cache behavior.

Recommended production approach:

- Use `style-latest.json` for normal operation.
- Keep versioned URLs for debugging, rollback validation, and forced cache refresh scenarios.

## Required Build Mode

You must run the app using a **custom development build** (or production build) to reliably render the deployed map stack.

- Expo Go is not sufficient for native map/plugin combinations used by production map rendering.
- If you only run in Expo Go, the map can appear blank even when style and PMTiles endpoints are healthy.
- Validate map rendering using a custom dev client before rollout.

## Why No Local Bundle Is Needed

- The style JSON is hosted in Azure Blob Storage.
- The style references cloud-hosted PMTiles endpoints.
- Clients stream map data over HTTPS at runtime.

