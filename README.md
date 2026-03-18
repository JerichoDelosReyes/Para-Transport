# Para Mobile

**Ve2**

Para Mobile is a smart commuter application designed for public transportation users in Imus, Cavite, Philippines. The application utilizes a Graph-Lite architecture to provide offline-resilient route discovery without reliance on external paid routing APIs.

---

## Table of Contents

| Document | Description |
|----------|-------------|
| [Contributing Guidelines](CONTRIBUTING.md) | Contribution workflow and standards |
| [Security Policy](SECURITY.md) | Vulnerability reporting procedures |

> **📋 For Contributors:** Before making any changes or contributions to this project, you **must** read and follow the [Contributing Guidelines](CONTRIBUTING.md). All contributions are expected to adhere to the specified issue formats, PR templates, and architectural standards outlined therein.

---

## Overview

Para Mobile addresses the challenge of navigating informal public transportation networks where traditional mapping services lack coverage. The application leverages manually digitized route data stored as GeoJSON and performs spatial analysis using Turf.js to match user origin and destination points against known routes.

### Technical Architecture

- **Frontend Framework**: React Native via Expo (using Expo Router for navigation)
- **Styling**: Tailwind CSS via Nativewind
- **State Management**: Zustand
- **Map Rendering**: `react-native-maps` with OpenStreetMap (OSM) tile integration
- **Spatial Engine**: Turf.js for geographical buffer analysis and calculations
- **Data Validation**: Zod

### Current Capabilities

- **Route Search**: Supports direct and single-transfer route discovery based on spatial buffer analysis.
- **Mapping**: Integrated OSM tiles and configurable geocoding.
- **Stopwatch Service**: Enables ride duration tracking for crowdsourced traffic data collection.

---

## Getting Started

### Prerequisites
- Node.js (v18 or newer recommended)
- Expo CLI
- iOS Simulator or Android Emulator (or a physical device with the Expo Go app)

### Installation

1. Install the necessary dependencies:
   ```bash
   npm install
   ```
2. Start the application:
   ```bash
   npx expo start
   ```

---

## License

To be determined.
