# GPX Folder Guide

This folder is for local GPX route exports used during route curation.

## What goes here

- Store raw route exports from Maps.ie (or Map.io) as `.gpx` files.
- Example local filename: `SMMolino-BDO.gpx`
- Raw `.gpx` files are gitignored by default.

## How to create GPX files

1. Open Maps.ie and manually plot your route.
2. Export/download the route as `.gpx`.
3. Save the file into this folder: `data/gpx/`.

## How to parse GPX into app JSON

From the project root, run:

```bash
npm run import-gpx -- "data/gpx/YourRoute.gpx" --code ROUTE-CODE-01 --type jeepney --fare 13
```

This uses:

- Parser script: `scripts/importGpx.js`
- Default JSON output: `data/routes.json`

## Parsing for tricycle routes

If the route is for tricycle data, write to `data/tricycle_routes.json`:

```bash
npm run import-gpx -- "data/gpx/YourTricycleRoute.gpx" --code TRI-ROUTE-01 --type tricycle --fare 24 --output data/tricycle_routes.json
```

## JSON format expected by the app

Each route entry should include these fields:

- `code`
- `name`
- `description`
- `type` (`jeepney`, `tricycle`, `bus`, etc.)
- `fare`
- `status` (usually `active`)
- `operator`
- `stops` (array of `{ name, lat, lng }`)
- `path` (array of `[lng, lat]` coordinate pairs)

## Important

- Keep sensitive/private GPX datasets local.
- Commit only approved sample data or placeholders.

## Next Step

After preparing or parsing GPX files, continue in `data/RouteGuide.md` for the full dataset workflow and JSON templates.
