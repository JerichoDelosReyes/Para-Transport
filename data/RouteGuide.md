# Data Workflow Guide

This folder contains transit datasets used by the app. Sensitive or large mapping datasets are excluded from Git history.

## Recommended Workflow (Maps.ie -> GPX -> JSON)

1. Plot the route manually in Maps.ie.
2. Export/download the route as a GPX file.
3. Save the GPX file locally (for example, under `data/gpx/` on your machine).
4. Parse GPX into app JSON format using the importer script:

```bash
npm run import-gpx -- "path/to/route.gpx" --code ROUTE-CODE-01 --type jeepney --fare 13
```

5. Validate generated JSON structure and route geometry.
6. Keep private/full datasets local, and commit only approved sample or placeholder files.

## JSON Shapes Used by the App

### routes.json / tricycle_routes.json

```json
{
  "routes": [
    {
      "code": "ROUTE-CODE-01",
      "name": "Origin - Destination",
      "description": "Origin to Destination (imported from GPX)",
      "type": "jeepney",
      "fare": 13,
      "status": "active",
      "operator": "",
      "stops": [
        { "name": "Origin", "lat": 14.0, "lng": 120.0 },
        { "name": "Destination", "lat": 14.0, "lng": 120.1 }
      ],
      "path": [
        [120.0, 14.0],
        [120.0005, 14.0004]
      ]
    }
  ]
}
```

### local_places.json

```json
{
  "places": [
    {
      "name": "Sample Place",
      "lat": 14.0,
      "lng": 120.0,
      "category": "landmark"
    }
  ]
}
```

## Placeholders

Use files in `data/placeholders/` as minimal templates when real datasets are excluded.
