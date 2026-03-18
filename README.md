# Para Mobile

**Version 0.1.0 (Beta)**

Para Mobile is a smart commuter application designed for public transportation users in Imus, Cavite, Philippines. The application utilizes a Graph-Lite architecture to provide offline-resilient route discovery without reliance on external paid routing APIs.

---

## Table of Contents

| Document | Description |
|----------|-------------|
| [Contributing Guidelines](CONTRIBUTING.md) | Contribution workflow and standards |
| [Security Policy](SECURITY.md) | Vulnerability reporting procedures |
| [API Reference](docs/backend/api.reference.md) | Backend API documentation and setup |

> **📋 For Contributors:** Before making any changes or contributions to this project, you **must** read and follow the [Contributing Guidelines](CONTRIBUTING.md). All contributions are expected to adhere to the specified issue formats, PR templates, and architectural standards outlined therein.

---

## Overview

Para Mobile addresses the challenge of navigating informal public transportation networks where traditional mapping services lack coverage. The application leverages manually digitized route data stored as GeoJSON and performs spatial analysis using Turf.js to match user origin and destination points against known routes.

### Technical Architecture

- **Stack**: MERN (MongoDB, Express.js, React Native, Node.js)
- **Routing Engine**: Graph-Lite pattern using `spatialFilter.js` and `turf.js`
- **Map Rendering**: OpenStreetMap via `react-native-maps`
- **Data Storage**: GeoJSON route definitions in MongoDB

### Current Capabilities

- **Route Search**: Supports direct and single-transfer route discovery based on spatial buffer analysis.
- **Stopwatch Service**: Enables ride duration tracking for crowdsourced traffic data collection.

---

## Getting Started

For backend setup instructions, environment configuration, and dependency installation, refer to the [API Reference](docs/backend/api.reference.md).

---

## License

To be determined.




