# Client Integration Guide

This guide explains how to consume the deployed Para InfraGIS map stack from a mobile client.

## Locked Parameters

- Canonical Style URL: `https://paragisstorage.blob.core.windows.net/maps/style-latest.json`
- Map Renderer: MapLibre

## Client Implementation

Set your MapLibre `styleURL` to:

`https://paragisstorage.blob.core.windows.net/maps/style-latest.json`

No local map data needs to be bundled with the APK/IPA.

## Version Naming and Cache Busting

This project publishes immutable versioned styles (for example, `style-v20260403-a1b2c3d.json`) and also updates a stable alias (`style-latest.json`).

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

## Preconditions

Before client rollout, confirm the infrastructure checks in these runbooks are complete:

- `docs/runbooks/azure-style-deployment.md`
- `docs/runbooks/azure-pmtiles-cloud-provisioning.md`

The PMTiles provisioning runbook includes the required CORS and byte-range validation needed for runtime map tile access.

## Verification

1. Open the style URL in a browser and confirm JSON is returned.
2. Launch the mobile app and confirm tiles render without shipping local map assets.
3. If the map is blank, validate PMTiles endpoint CORS and range support using the PMTiles runbook.

## Scope Note

This document covers client consumption of already-deployed infrastructure only. Deployment, rollback, and storage operations stay in the runbooks.