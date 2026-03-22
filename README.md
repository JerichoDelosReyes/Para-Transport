<div align="center">

# Para Mobile

**The Smart, Offline-Resilient Commuter App for Imus, Cavite**

[![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#)
[![Expo](https://img.shields.io/badge/Expo-1B1F23?style=for-the-badge&logo=expo&logoColor=white)](#)
[![Zustand](https://img.shields.io/badge/Zustand-4D4D4D?style=for-the-badge&logo=react&logoColor=white)](#)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](#)
[![Turf.js](https://img.shields.io/badge/Turf.js-51A638?style=for-the-badge&logo=javascript&logoColor=white)](#)

*“Para!” (verb): The Filipino word to hail or stop a jeepney.<br>Navigating the informal transit networks of the Philippines has never been easier.*

</div>

---

## ✨ Overview

Para Mobile addresses the challenge of navigating informal public transportation networks where traditional mapping services lack coverage. By leveraging manually digitized route data (GeoJSON) and performing local spatial analysis, Para provides secure, offline-resilient route discovery without relying on costly external routing APIs. 

Bringing clarity and confidence to your daily commute in **Imus, Cavite**.

<br/>

## 🎯 Key Features

- 🗺️ **Smart Routing:** Discover direct and single-transfer routes using local spatial buffer analysis.
- 📴 **Offline-Resilient:** Graph-Lite architecture designed to work beautifully off local mapping geometry.
- 🚌 **Multi-Modal Transit:** Seamlessly maps out Jeepneys, Tricycles, and Buses.
- 🏆 **Commuter Gamification:** Earn dynamic lifestyle milestones (like *“Thrifty Commuter”*) by logging your rides and minimizing spend.
- 💾 **Personalized Experience:** Save custom locations, browse recent search history, and track fare totals visually.
- 🌍 **Local Native Mapping:** Beautiful map rendering via `react-native-maps` and OpenStreetMap (OSM) tile integrations.

<br/>

## 🛠️ Technical Architecture

| Category | Technology |
| :--- | :--- |
| **Frontend framework** | React Native + Expo Router |
| **State Management** | Zustand (Local-first persistence) |
| **Backend & Sync** | Supabase (Auth & Postgres DB synchronization) |
| **Spatial Engine** | Turf.js (Geographical calculations & buffering) |
| **Styling** | Nativewind & Custom StyleSheets (`Cubao` local fonts) |
| **Data Validation** | Zod |

<br/>

## 🚀 Getting Started

Follow these minimal steps to set up the development environment locally.

### Prerequisites
- **Node.js** (v18 or newer recommended)
- **Expo CLI** (via `npm` or `npx`)
- **Git**
- iOS Simulator, Android Emulator, or a physical device with Expo Go.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/JerichoDelosReyes/Para-Transport.git
   cd Para-Transport
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   If authentication and backend syncing are required, set up your `.env`.
   ```bash
   cp .env.example .env
   ```

4. **Launch the application:**
   ```bash
   npx expo start
   ```

<br/>

## 🤝 Contributing

We welcome UI scaling and feature proposals! Please read our [Contributing Guidelines](CONTRIBUTING.md) to understand the workflow and architectural standards. Vulnerability reporting procedures are outlined in our [Security Policy](SECURITY.md).

> **📋 For Contributors:** All contributions are expected to adhere to the specified issue formats and architectural flow to keep the local Graph routing highly optimized.

<br/>

## 📜 License

Project licensing is currently **To Be Determined.**

<br/>

<div align="center">
  <i>Ingat sa byahe! (Have a safe trip!)</i>
</div>
