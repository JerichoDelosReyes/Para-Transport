# Para App - Firebase & Supabase Configuration Guide

This guide covers configuring the local CLI, linking the backend systems, and establishing Google & Apple authentication correctly within this decoupled architecture natively.

## The Architecture
1. **Firebase** handles *Authentication solely* (Email/Password, Google, Apple Auth).
2. **Supabase** handles *Database & Storage solely*.

To link them securely, a user's Firebase UID will be stored as the Primary Key (`id`) inside the Supabase `users` table.

---

## Part 1: Firebase Configuration (Authentication)

### 1. Project Initialization
1. Go to the [Firebase Console](https://console.firebase.google.com/) and Create a New Project.
2. Register a new **Web App** (even though this is React Native/Expo, use Web for the underlying API config).
3. Copy the configuration object and provide me with the specific keys when prompted.

### 2. Setting Up Sign-In Providers
Go to **Authentication -> Sign-in method**.

#### A. Email / Password
*   Click **Add new provider** > Email/Password.
*   Enable it and click Save.

#### B. Google Authentication
1. Click **Add new provider** > Google.
2. Enable it and provide a Support Email.
3. *Important for React Native/Expo:* You will need to configure your **OAuth Client IDs** in Google Cloud Console.
   *   Go to your [Google Cloud Console](https://console.cloud.google.com/).
   *   Generate an **Android** Client ID and an **iOS** Client ID using your package names (e.g., `com.para.app`).
   *   You'll need an SHA-1 fingerprint for Android.

#### C. Apple Authentication
*Requires an active Apple Developer Program membership.*
1. Click **Add new provider** > Apple.
2. In the [Apple Developer Portal](https://developer.apple.com/):
   *   Create an **App ID** (e.g., `com.para.app`) and enable "Sign In with Apple".
   *   Create a **Service ID** and map it to your App ID.
   *   Register a **Private Key**, download the `.p8` file, and keep the Key ID.
3. Back in Firebase, input your Apple Team ID, App ID, Key ID, and upload the `.p8` Private Key.

---

## Part 2: Supabase Configuration (Database)

### 1. Project Initialization
1. Go to your [Supabase Dashboard](https://database.new).
2. Create a new Database project.
3. Head to **Project Settings -> API** to retrieve your `Project URL` and `anon public key`.

### 2. Using the Supabase CLI (We installed this locally)
The local configuration was built using `npx supabase init` and the CLI is bundled in `package.json`. It connects directly to your live database functionality.

1. **Log in to Supabase CLI:**
   Run `npx supabase login`. This opens the browser and provisions a local token.
2. **Link the Project:**
   Run `npx supabase link --project-ref your-project-ref-id`. (I can do this once you provide the project ref).
3. **Database Schema Setup:**
   We have already mocked up the first schema table bridging Firebase to Supabase inside `supabase/migrations/20260319000000_initial_schema.sql`.
   Once linked, we just push it live using:
   `npx supabase db push`

### 3. Securing Supabase API (Using Firebase Auth)
Because Supabase accepts generic JWTs, we will configure Supabase to trust the JWT keys that Firebase generates! This connects the UI flawlessly.
*   In Supabase Dashboard, go to **Authentication -> Providers** and make sure everything there is DISABLED (we only use Firebase).
*   Create a PostgreSQL function mapped to decode Firebase's JWTs for Row Level Security (RLS) policies later.

---

## Next Steps

1. I am ready to input your keys. Please send me your keys in this exact format:

**Firebase:**
*   API Key:
*   Auth Domain:
*   Project ID:
*   Storage Bucket:
*   Messaging Sender ID:
*   App ID:

**Supabase:**
*   Project URL:
*   Anon API Key: 
*   Project Reference ID (Found in project settings URL):

2. Once provided, I'll bind everything perfectly via the CLI interfaces!