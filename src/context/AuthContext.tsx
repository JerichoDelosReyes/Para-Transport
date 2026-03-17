/**
 * Authentication Context
 * 
 * Provides global authentication state management using React Context.
 * Manages user session, loading states, auth operations with Google Sign-In,
 * and user preferences (saved locations, recent searches) with Firestore sync.
 * 
 * @module context/AuthContext
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { User as FirebaseAuthTypesUser, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { Timestamp as FirebaseFirestoreTypesTimestamp, doc, getDoc, setDoc, collection, getDocs, query, orderBy, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';

import { auth, firestore } from '../config/firebase';

import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

// Ensure the auth session is completed properly after redirect
WebBrowser.maybeCompleteAuthSession();

// Express API service removed (migrating to Supabase)

// Import default preferences
import defaultPreferences from '../data/defaults.json';

// Import user preferences types and service
import {
  UserPreferences as UserPreferencesData,
  SavedTrip,
  UserStats,
  Achievement as AchievementType,
} from '../types/user';
import { ACHIEVEMENTS_LIST, checkAchievements } from '../services/achievements';
import {
  initializeUserPreferences,
  getUserPreferences as fetchUserPreferencesFromFirestore,
  addSavedTrip as addSavedTripToFirestore,
  removeSavedTrip as removeSavedTripFromFirestore,
  addSearchHistory,
  clearSearchHistory as clearSearchHistoryInFirestore,
  generateTripId,
} from '../services/preferences';

// =============================================================================
// Types
// =============================================================================

export type AuthUser = FirebaseAuthTypesUser | null;

/**
 * Saved location structure
 */
export interface SavedLocation {
  id: string;
  name: string;
  displayName: string;
  coordinates: [number, number]; // [lng, lat]
  type?: string;
  icon?: string;
  isFavorite?: boolean;
  createdAt: Date | FirebaseFirestoreTypesTimestamp;
}

/**
 * Recent search structure
 */
export interface RecentSearch {
  id: string;
  name: string;
  displayName: string;
  coordinates: [number, number];
  timestamp: number;
}

/**
 * User preferences
 */
export interface UserPreferences {
  savedLocations: SavedLocation[];
  recentSearches: RecentSearch[];
  defaultVehicleType: 'jeep' | 'bus' | 'tricycle';
}

/**
 * User profile data stored in Firestore
 */
export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  firstName?: string;
  lastName?: string;
  username?: string;
  phoneNumber?: string;
  photoURL?: string | null;
  createdAt: FirebaseFirestoreTypesTimestamp | Date;
  updatedAt: FirebaseFirestoreTypesTimestamp | Date;
  /** Flag to indicate user has filled in their details on CompleteDetails screen */
  hasFilledDetails?: boolean;
  /** Flag to indicate user has completed onboarding (seen Success screen) */
  hasCompletedOnboarding?: boolean;
}

/**
 * Authentication state
 */
export interface AuthState {
  /** Current authenticated user from Firebase Auth */
  user: AuthUser;
  /** User profile data from Firestore */
  userProfile: UserProfile | null;
  /** Whether auth state is being determined */
  isLoading: boolean;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Current error message */
  error: string | null;
}

/**
 * Auth context value
 */
export interface AuthContextValue extends AuthState {
  /** Sign in with Google */
  signInWithGoogle: () => Promise<boolean>;
  /** Bypass authentication for testing */
  bypassAuth: () => Promise<void>;
  /** Sign out current user */
  signOut: () => Promise<void>;
  /** Clear current error */
  clearError: () => void;
  /** Create user profile in Firestore */
  createUserProfile: (profileData: Partial<UserProfile>) => Promise<boolean>;
  /** Refresh user profile from Firestore */
  refreshUserProfile: () => Promise<void>;
  /** Mark onboarding as complete (called from Success screen) */
  completeOnboarding: () => Promise<void>;
  /** User preferences (saved locations, recent searches) */
  preferences: UserPreferences;
  /** Save a location to favorites */
  saveLocation: (location: Omit<SavedLocation, 'id' | 'createdAt'>) => Promise<void>;
  /** Remove a saved location */
  removeLocation: (locationId: string) => Promise<void>;
  /** Add a recent search */
  addRecentSearch: (search: Omit<RecentSearch, 'id' | 'timestamp'>) => Promise<void>;
  /** Clear all recent searches */
  clearRecentSearches: () => Promise<void>;
  /** Get quick locations from defaults */
  quickLocations: SavedLocation[];
  // ===== New User Preferences System (SavedTrips) =====
  /** User preferences data (savedTrips, searchHistory, stats) from Firestore */
  userPreferencesData: UserPreferencesData | null;
  /** Whether preferences are being loaded */
  isLoadingPreferences: boolean;
  /** Refresh user preferences from Firestore */
  refreshPreferences: () => Promise<void>;
  /** Add a saved trip to user preferences */
  addSavedTrip: (trip: Omit<SavedTrip, 'id'>) => Promise<void>;
  /** Remove a saved trip from user preferences */
  removeSavedTrip: (tripId: string) => Promise<void>;
  /** Add to search history */
  addToSearchHistory: (query: string) => Promise<void>;
  /** Clear search history */
  clearUserSearchHistory: () => Promise<void>;
  /** Update user photo URL */
  updatePhotoURL: (uri: string) => Promise<void>;
  /** Unlocked achievements (computed) */
  unlockedAchievements: AchievementType[];
  /** Convenience: current stats (computed) */
  currentStats: UserStats | null;
}

// =============================================================================
// Constants
// =============================================================================

/** Firestore collection name for users */
const USERS_COLLECTION = 'users';

/** Firestore subcollection for saved locations */
const SAVED_LOCATIONS_COLLECTION = 'saved_locations';

/** Maximum number of recent searches to keep */
const MAX_RECENT_SEARCHES = 10;

/** Default preferences from JSON */
const DEFAULT_PREFERENCES: UserPreferences = {
  savedLocations: [],
  recentSearches: [],
  defaultVehicleType: 'jeep',
};

/** Quick locations from defaults.json */
const QUICK_LOCATIONS: SavedLocation[] = defaultPreferences.quickLocations.map((loc) => ({
  ...loc,
  coordinates: loc.coordinates as [number, number],
  createdAt: new Date(),
}));

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

/**
 * Props for AuthProvider
 */
export interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Authentication Provider Component
 * 
 * Wraps the app to provide authentication state and methods.
 * Uses Google Sign-In with Firebase Auth and Firestore for user profiles.
 * 
 * @example
 * ```tsx
 * // In App.tsx
 * <AuthProvider>
 *   <NavigationContainer>
 *     <AppNavigator />
 *   </NavigationContainer>
 * </AuthProvider>
 * ```
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // Auth state
  const [user, setUser] = useState<AuthUser>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Preferences state (existing saved locations system)
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  
  // New User Preferences state (savedTrips from Firestore users/{uid})
  const [userPreferencesData, setUserPreferencesData] = useState<UserPreferencesData | null>(null);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState<boolean>(false);

  // ==========================================================================
  // Derived State (Stats & Achievements)
  // ==========================================================================

  const currentStats = useMemo<UserStats | null>(() => (
    userPreferencesData?.stats ? userPreferencesData.stats : null
  ), [userPreferencesData]);

  const unlockedAchievements = useMemo<AchievementType[]>(() => {
    if (!userPreferencesData) return [];
    const fromStats = checkAchievements(userPreferencesData.stats);
    // Merge with server achievementIds if present
    const byIds = ACHIEVEMENTS_LIST.filter((a) =>
      (userPreferencesData.achievementIds || []).includes(a.id)
    );
    // Deduplicate by id
    const map = new Map<string, AchievementType>();
    [...fromStats, ...byIds].forEach((a) => map.set(a.id, a));
    return Array.from(map.values());
  }, [userPreferencesData]);

  // Log whenever stats update for debugging
  useEffect(() => {
    if (!currentStats) return;
    console.log('======================================');
    console.log('📊 STATISTICS UPDATED');
    console.log('   Distance Traveled:', currentStats.distanceTraveled || 0, 'km');
    console.log('   PUV Entered:', currentStats.puvEntered || 0);
    console.log('   Trips Completed:', currentStats.tripsCompleted || 0);
    console.log('   Routes Searched:', currentStats.routesSearched || 0);
    console.log('======================================');
  }, [currentStats]);

  // ==========================================================================
  // Google Sign-In Configuration (Expo Go Compatible)
  // ==========================================================================

  // Google Sign-In Configuration (Expo Go Compatible via expo-auth-session)
  // Uses the web client ID for Expo Go (auth.expo.io proxy) and falls back
  // to platform-specific IDs for standalone/development builds.
  // ==========================================================================

  // Variables for OAuth flow
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const expoOwner = Constants.expoConfig?.owner || 'zer0_echo';
  const expoSlug = Constants.expoConfig?.slug || 'para';

  const completeGoogleSignIn = useCallback(async (tokens: { idToken?: string; accessToken?: string }): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      if (!tokens.idToken && !tokens.accessToken) {
        throw new Error('Google Sign-In did not return an ID token or access token.');
      }

      console.log('[AuthContext] Creating Firebase credential...');
      
      // Firebase requires at least idToken for Google auth
      if (!tokens.idToken) {
        console.warn('[AuthContext] No ID token, only access token. Attempting credential creation...');
      }

      const credential = GoogleAuthProvider.credential(
        tokens.idToken ?? null,
        tokens.accessToken ?? null
      );

      console.log('[AuthContext] Firebase credential created. Signing in...');
      const authResult = await signInWithCredential(auth, credential);
      
      console.log('[AuthContext] Firebase auth successful, uid:', authResult.user.uid);
      console.log('[AuthContext] User email:', authResult.user.email);
      
      // Auto-create user profile in Firestore using Google profile data
      if (authResult.user) {
        try {
          const userDocRef = doc(firestore, USERS_COLLECTION, authResult.user.uid);
          const userDoc = await getDoc(userDocRef);
          
          // Only create if profile doesn't exist yet (new user)
          if (!userDoc.exists()) {
            console.log('[AuthContext] Creating initial user profile for new user...');
            const now = serverTimestamp();
            
            const newProfile: Partial<UserProfile> = {
              uid: authResult.user.uid,
              email: authResult.user.email,
              displayName: authResult.user.displayName,
              photoURL: authResult.user.photoURL,
              createdAt: now as any,
              updatedAt: now as any,
              hasFilledDetails: false,
              hasCompletedOnboarding: false,
            };
            
            await setDoc(userDocRef, newProfile);
            console.log('[AuthContext] ✅ Initial user profile created successfully');
          } else {
            console.log('[AuthContext] User profile already exists, skipping creation');
          }
        } catch (profileErr) {
          console.warn('[AuthContext] Could not auto-create user profile:', profileErr);
          // Don't fail auth if profile creation fails - user is authenticated
        }
      }
    } catch (err: any) {
      console.error('[AuthContext] Firebase Google Sign-In error:', {
        message: err.message,
        code: err.code,
        fullError: err,
      });
      setError(err.message || 'Failed to sign in with Google. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ==========================================================================
  // Firestore User Profile Helpers
  // ===========================================================================

  /**
   * Fetch user profile from Firestore
   */
  const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
    try {
      console.log('[AuthContext] Fetching user profile for:', uid);
      const userDocRef = doc(firestore, USERS_COLLECTION, uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        console.log('[AuthContext] User profile found');
        return {
          uid,
          email: data?.email || null,
          displayName: data?.displayName || null,
          firstName: data?.firstName,
          lastName: data?.lastName,
          username: data?.username,
          phoneNumber: data?.phoneNumber,
          photoURL: data?.photoURL || null,
          createdAt: data?.createdAt || new Date(),
          updatedAt: data?.updatedAt || new Date(),
          hasFilledDetails: data?.hasFilledDetails ?? false,
          hasCompletedOnboarding: data?.hasCompletedOnboarding ?? false,
        } as UserProfile;
      }
      
      console.log('[AuthContext] User profile not found - new user needs registration');
      return null;
    } catch (err) {
      console.error('[AuthContext] Error fetching user profile:', err);
      return null;
    }
  }, []);

  // ==========================================================================
  // Auth State Listener
  // ==========================================================================

  useEffect(() => {
    console.log('[AuthContext] Setting up auth state listener');
    
    // Subscribe to auth state changes
    const unsubscribe = auth.onAuthStateChanged(async (authUser) => {
      console.log('[AuthContext] Auth state changed:', authUser?.uid || 'null');
      setUser(authUser);
      
      if (authUser) {
        // User is signed in - check for Firestore profile
        const profile = await fetchUserProfile(authUser.uid);
        console.log('[AuthContext] Profile fetched:', profile ? `hasCompletedOnboarding=${profile.hasCompletedOnboarding}` : 'null (new user)');
        setUserProfile(profile);
        
        // Background health check - removed since Supabase doesn't have Render cold starts
        
        // Initialize and fetch user preferences (savedTrips)
        try {
          setIsLoadingPreferences(true);
          await initializeUserPreferences(authUser.uid);
          const prefs = await fetchUserPreferencesFromFirestore(authUser.uid);
          setUserPreferencesData(prefs);
          
          // ✅ Success log for debugging - Preferences loaded in AuthContext
          console.log('======================================');
          console.log('✅ USER PREFERENCES SYNCED TO CONTEXT');
          console.log('User:', authUser.email || authUser.uid);
          console.log('--------------------------------------');
          console.log('📍 Saved Trips:', prefs?.savedTrips?.length || 0);
          console.log('🔍 Search History:', prefs?.searchHistory?.length || 0);
          console.log('--------------------------------------');
          console.log('🗺️  PLACES DISCOVERED:');
          console.log('   This Month:', prefs?.placesDiscovered?.thisMonth || 0);
          console.log('   Top Area:', prefs?.placesDiscovered?.topArea || 'None');
          console.log('   Total Places:', prefs?.placesDiscovered?.totalPlaces || 0);
          console.log('   Recent Activities:', prefs?.placesDiscovered?.recentActivities?.length || 0);
          console.log('--------------------------------------');
          console.log('⭐ USER LEVEL:');
          console.log('   Level:', prefs?.userLevel?.currentLevel || 1);
          console.log('   EXP:', prefs?.userLevel?.exp || 0);
          console.log('   EXP to Next Level:', prefs?.userLevel?.expToNextLevel || 150);
          console.log('--------------------------------------');
          console.log('🏆 ACHIEVEMENTS:', prefs?.achievementIds?.length || 0, 'unlocked');
          if (prefs?.achievementIds && prefs.achievementIds.length > 0) {
            console.log('   IDs:', prefs.achievementIds.join(', '));
          }
          console.log('--------------------------------------');
          console.log('📊 STATS:');
          console.log('   Distance Traveled:', prefs?.stats?.distanceTraveled || 0, 'km');
          console.log('   PUV Entered:', prefs?.stats?.puvEntered || 0);
          console.log('   Trips Completed:', prefs?.stats?.tripsCompleted || 0);
          console.log('   Routes Searched:', prefs?.stats?.routesSearched || 0);
          console.log('======================================');
          
          console.log('[AuthContext] User preferences loaded:', prefs?.savedTrips?.length || 0, 'saved trips');
        } catch (prefError) {
          console.error('[AuthContext] Error loading user preferences:', prefError);
          setUserPreferencesData(null);
        } finally {
          setIsLoadingPreferences(false);
        }
      } else {
        // User is signed out
        setUserProfile(null);
        setUserPreferencesData(null);
      }
      
      setIsLoading(false);
    });
    
    return () => {
      console.log('[AuthContext] Cleaning up auth listener');
      unsubscribe();
    };
  }, [fetchUserProfile]);

  // ==========================================================================
  // Actions
  // ==========================================================================

  /**
   * Sign in with Google - Manual OAuth flow with WebBrowser
   * Opens browser to Google OAuth login, captures redirect with tokens
   */
  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);

      if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
        console.error('[AuthContext] Google Web Client ID not configured');
        setError('Google Sign-In is not configured. Contact support.');
        return false;
      }

      setIsLoading(true);
      console.log('[AuthContext] Starting manual OAuth flow...');

      // Build the redirect URI
      const redirectUri = isExpoGo
        ? `https://auth.expo.io/@${expoOwner}/${expoSlug}`
        : AuthSession.makeRedirectUri({ scheme: 'para', path: 'oauthredirect' });

      console.log('[AuthContext] Using redirect URI:', redirectUri);

      // Build Google OAuth URL with ID token only (simpler, no offline)
      const params = {
        client_id: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'id_token',
        scope: 'openid profile email',
        nonce: 'para_app_nonce',
      };

      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(params).toString()}`;
      
      console.log('[AuthContext] Opening browser for OAuth...');
      const result = await WebBrowser.openAuthSessionAsync(googleAuthUrl, redirectUri);

      console.log('[AuthContext] Browser result type:', result.type);

      if (result.type === 'success' && result.url) {
        console.log('[AuthContext] Auth success, parsing tokens from redirect...');
        
        try {
          // Parse the redirect URL to extract tokens from the fragment
          const url = new URL(result.url);
          const fragment = url.hash.substring(1); // Remove leading #
          const params = new URLSearchParams(fragment);
          
          const idToken = params.get('id_token');
          const accessToken = params.get('access_token');
          
          console.log('[AuthContext] Token extraction result:', {
            hasIdToken: !!idToken,
            hasAccessToken: !!accessToken,
            idTokenLength: idToken?.length || 0,
            accessTokenLength: accessToken?.length || 0,
          });

          if (!idToken && !accessToken) {
            console.error('[AuthContext] No tokens in URL fragment. URL:', result.url);
            setError('No authentication tokens returned. Please try again.');
            setIsLoading(false);
            return false;
          }

          console.log('[AuthContext] Completing sign-in with tokens...');
          await completeGoogleSignIn({ 
            idToken: idToken || undefined, 
            accessToken: accessToken || undefined 
          });
          return true;
        } catch (parseErr: any) {
          console.error('[AuthContext] Error parsing redirect URL:', parseErr);
          setError('Failed to parse authentication response');
          setIsLoading(false);
          return false;
        }
      } else if (result.type === 'cancel') {
        console.log('[AuthContext] User cancelled authentication');
        setIsLoading(false);
        return false;
      } else {
        console.log('[AuthContext] Auth dismissed or error');
        setError('Authentication was cancelled. Please try again.');
        setIsLoading(false);
        return false;
      }
    } catch (err: any) {
      console.error('[AuthContext] OAuth error:', err.message, err);
      setError(err.message || 'Failed to start Google Sign-In');
      setIsLoading(false);
      return false;
    }
  }, [isExpoGo, expoOwner, expoSlug]);

  /**
   * Create user profile in Firestore
   * Note: We don't set isLoading here to prevent navigation flickering
   */
  const createUserProfile = useCallback(async (profileData: Partial<UserProfile>): Promise<boolean> => {
    if (!user) {
      setError('No authenticated user');
      return false;
    }
    
    try {
      setError(null);
      // Don't set isLoading to prevent navigation re-render during profile creation
      
      console.log('[AuthContext] Creating user profile for:', user.uid);
      
      const now = serverTimestamp();
      
      const newProfile: Partial<UserProfile> = {
        uid: user.uid,
        email: user.email,
        displayName: profileData.displayName || user.displayName,
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        username: profileData.username,
        phoneNumber: profileData.phoneNumber,
        photoURL: user.photoURL,
        createdAt: now as any,
        updatedAt: now as any,
        hasFilledDetails: true, // User has filled details form
        hasCompletedOnboarding: false, // User hasn't seen Success screen yet
      };
      
      await setDoc(doc(firestore, USERS_COLLECTION, user.uid), newProfile);
      
      // Manually update local state with the new profile (don't fetch again)
      // This ensures hasFilledDetails is true and hasCompletedOnboarding is false
      setUserProfile({
        uid: user.uid,
        email: user.email,
        displayName: profileData.displayName || user.displayName,
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        username: profileData.username,
        phoneNumber: profileData.phoneNumber,
        photoURL: user.photoURL,
        createdAt: new Date(),
        updatedAt: new Date(),
        hasFilledDetails: true,
        hasCompletedOnboarding: false,
      });
      
      console.log('[AuthContext] User profile created successfully with hasCompletedOnboarding: false');
      return true;
    } catch (err: any) {
      console.error('[AuthContext] Error creating user profile:', err);
      setError(err.message || 'Failed to create user profile');
      return false;
    }
  }, [user]);

  /**
   * Refresh user profile from Firestore
   */
  const refreshUserProfile = useCallback(async (): Promise<void> => {
    if (!user) return;
    
    const profile = await fetchUserProfile(user.uid);
    setUserProfile(profile);
  }, [user, fetchUserProfile]);

  /**
   * Bypass Authentication (For Testing Only)
   */
  const bypassAuth = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      
      const testEmail = 'test@para.local';
      
      // Simulate fake user
      const fakeUser = {
        uid: 'test-bypass-user-id',
        email: testEmail,
        displayName: 'Test User',
      } as AuthUser;
      
      const fakeProfile: UserProfile = {
        uid: 'test-bypass-user-id',
        email: testEmail,
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
        hasFilledDetails: true,
        hasCompletedOnboarding: true,
      };

      setUser(fakeUser);
      setUserProfile(fakeProfile);

      console.log('[AuthContext] Auth bypassed successfully');
    } catch (err: any) {
      console.error('[AuthContext] bypassAuth error:', err);
      setError('Test bypass failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Sign out current user
   */
  const signOut = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      
      // Sign out from Firebase
      await auth.signOut();
      
      setUser(null);
      setUserProfile(null);
      
      console.log('[AuthContext] Sign out successful');
    } catch (err: any) {
      console.error('[AuthContext] signOut error:', err);
      setError(err.message || 'Failed to sign out');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Mark onboarding as complete
   * Called when user presses the arrow on Success screen to go to main app
   */
  const completeOnboarding = useCallback(async (): Promise<void> => {
    if (!user) return;
    
    try {
      console.log('[AuthContext] Marking onboarding as complete for:', user.uid);
      
      // Use set with merge to handle cases where document might not exist
      await setDoc(doc(firestore, USERS_COLLECTION, user.uid), {
        hasFilledDetails: true,
        hasCompletedOnboarding: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      // Update local state
      if (userProfile) {
        setUserProfile({
          ...userProfile,
          hasFilledDetails: true,
          hasCompletedOnboarding: true,
        });
      } else {
        // If no userProfile yet, create a minimal one to trigger navigation
        setUserProfile({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          createdAt: new Date(),
          updatedAt: new Date(),
          hasFilledDetails: true,
          hasCompletedOnboarding: true,
        });
      }
      
      console.log('[AuthContext] Onboarding marked as complete');
    } catch (err: any) {
      console.error('[AuthContext] Error completing onboarding:', err);
    }
  }, [user, userProfile]);

  // ==========================================================================
  // Preferences Functions
  // ==========================================================================

  /**
   * Fetch saved locations from Firestore
   */
  const fetchSavedLocations = useCallback(async (uid: string): Promise<SavedLocation[]> => {
    try {
      const savedLocationsRef = collection(firestore, USERS_COLLECTION, uid, SAVED_LOCATIONS_COLLECTION);
      const q = query(savedLocationsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate() || new Date(),
      })) as SavedLocation[];
    } catch (err) {
      console.error('[AuthContext] Error fetching saved locations:', err);
      return [];
    }
  }, []);

  /**
   * Load user preferences (saved locations + recent searches)
   */
  useEffect(() => {
    const loadPreferences = async () => {
      if (!user) {
        setPreferences(DEFAULT_PREFERENCES);
        return;
      }

      try {
        // Fetch saved locations from Firestore
        const savedLocations = await fetchSavedLocations(user.uid);
        
        // For recent searches, we could use AsyncStorage for offline support
        // For now, start with empty and populate as user searches
        setPreferences({
          ...DEFAULT_PREFERENCES,
          savedLocations,
        });

        console.log('[AuthContext] Preferences loaded:', savedLocations.length, 'saved locations');
      } catch (err) {
        console.error('[AuthContext] Error loading preferences:', err);
        setPreferences(DEFAULT_PREFERENCES);
      }
    };

    loadPreferences();
  }, [user, fetchSavedLocations]);

  /**
   * Save a location to favorites
   */
  const saveLocation = useCallback(async (location: Omit<SavedLocation, 'id' | 'createdAt'>): Promise<void> => {
    if (!user) {
      console.warn('[AuthContext] Cannot save location: No authenticated user');
      return;
    }

    try {
      const locationsRef = collection(firestore, USERS_COLLECTION, user.uid, SAVED_LOCATIONS_COLLECTION);
      const docRef = await addDoc(locationsRef, {
        ...location,
        isFavorite: true,
        createdAt: serverTimestamp(),
      });

      const newLocation: SavedLocation = {
        id: docRef.id,
        ...location,
        isFavorite: true,
        createdAt: new Date(),
      };

      setPreferences((prev) => ({
        ...prev,
        savedLocations: [newLocation, ...prev.savedLocations],
      }));

      console.log('[AuthContext] Location saved:', location.name);
    } catch (err) {
      console.error('[AuthContext] Error saving location:', err);
    }
  }, [user]);

  /**
   * Remove a saved location
   */
  const removeLocation = useCallback(async (locationId: string): Promise<void> => {
    if (!user) return;

    try {
      const docRef = doc(firestore, USERS_COLLECTION, user.uid, SAVED_LOCATIONS_COLLECTION, locationId);
      await deleteDoc(docRef);

      setPreferences((prev) => ({
        ...prev,
        savedLocations: prev.savedLocations.filter((loc) => loc.id !== locationId),
      }));

      console.log('[AuthContext] Location removed:', locationId);
    } catch (err) {
      console.error('[AuthContext] Error removing location:', err);
    }
  }, [user]);

  /**
   * Add a recent search
   */
  const addRecentSearch = useCallback(async (search: Omit<RecentSearch, 'id' | 'timestamp'>): Promise<void> => {
    const newSearch: RecentSearch = {
      id: `recent-${Date.now()}`,
      ...search,
      timestamp: Date.now(),
    };

    setPreferences((prev) => {
      // Remove duplicate if exists
      const filtered = prev.recentSearches.filter(
        (s) => s.coordinates[0] !== search.coordinates[0] || s.coordinates[1] !== search.coordinates[1]
      );

      // Add new search at the beginning, limit to MAX_RECENT_SEARCHES
      const updated = [newSearch, ...filtered].slice(0, MAX_RECENT_SEARCHES);

      return {
        ...prev,
        recentSearches: updated,
      };
    });

    // Note: For persistent storage, we could save to AsyncStorage here
    // For now, recent searches are session-only until Firestore sync is implemented
  }, []);

  /**
   * Clear all recent searches
   */
  const clearRecentSearches = useCallback(async (): Promise<void> => {
    setPreferences((prev) => ({
      ...prev,
      recentSearches: [],
    }));
  }, []);

  // ==========================================================================
  // New User Preferences Functions (SavedTrips)
  // ==========================================================================

  /**
   * Refresh user preferences from Firestore
   */
  const refreshPreferences = useCallback(async (): Promise<void> => {
    if (!user) {
      console.warn('[AuthContext] Cannot refresh preferences: No authenticated user');
      return;
    }

    try {
      setIsLoadingPreferences(true);
      const prefs = await fetchUserPreferencesFromFirestore(user.uid);
      setUserPreferencesData(prefs);
      console.log('[AuthContext] Preferences refreshed:', prefs?.savedTrips?.length || 0, 'saved trips');
    } catch (err) {
      console.error('[AuthContext] Error refreshing preferences:', err);
    } finally {
      setIsLoadingPreferences(false);
    }
  }, [user]);

  /**
   * Add a saved trip to user preferences
   */
  const addSavedTrip = useCallback(async (trip: Omit<SavedTrip, 'id'>): Promise<void> => {
    if (!user) {
      console.warn('[AuthContext] Cannot add saved trip: No authenticated user');
      return;
    }

    try {
      const newTrip: SavedTrip = {
        ...trip,
        id: generateTripId(),
        createdAt: Date.now(),
      };

      await addSavedTripToFirestore(user.uid, newTrip);

      // Optimistically update local state
      setUserPreferencesData((prev) => {
        if (!prev) {
          return {
            uid: user.uid,
            username: userProfile?.username || '',
            phoneNumber: userProfile?.phoneNumber || '',
            savedTrips: [newTrip],
            searchHistory: [],
            stats: { distanceTraveled: 0, puvEntered: 0, tripsCompleted: 0, routesSearched: 0 },
            placesDiscovered: {
              thisMonth: 0,
              topArea: '',
              recentActivities: [],
              totalPlaces: 0,
              monthlyResetDate: new Date().toISOString(),
            },
            userLevel: { currentLevel: 1, exp: 0, expToNextLevel: 150 },
            achievementIds: [],
          };
        }
        return {
          ...prev,
          savedTrips: [...prev.savedTrips, newTrip],
        };
      });

      // ✅ Success log for debugging - Trip saved via Context
      console.log('======================================');
      console.log('✅ SAVED TRIP ADDED VIA CONTEXT');
      console.log('User:', user.email || user.uid);
      console.log('Trip:', newTrip.label, '-', newTrip.origin, '→', newTrip.destination);
      console.log('Trip ID:', newTrip.id);
      console.log('======================================');

      console.log('[AuthContext] Saved trip added:', newTrip.label);
    } catch (err) {
      console.error('[AuthContext] Error adding saved trip:', err);
      // Refresh to sync with server state
      await refreshPreferences();
    }
  }, [user, userProfile, refreshPreferences]);

  /**
   * Remove a saved trip from user preferences
   */
  const removeSavedTrip = useCallback(async (tripId: string): Promise<void> => {
    if (!user) {
      console.warn('[AuthContext] Cannot remove saved trip: No authenticated user');
      return;
    }

    try {
      await removeSavedTripFromFirestore(user.uid, tripId);

      // Optimistically update local state
      setUserPreferencesData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          savedTrips: prev.savedTrips.filter((t) => t.id !== tripId),
        };
      });

      console.log('[AuthContext] Saved trip removed:', tripId);
    } catch (err) {
      console.error('[AuthContext] Error removing saved trip:', err);
      // Refresh to sync with server state
      await refreshPreferences();
    }
  }, [user, refreshPreferences]);

  /**
   * Add to search history (new Firestore-based system)
   */
  const addToSearchHistory = useCallback(async (query: string): Promise<void> => {
    if (!user || !query.trim()) return;

    try {
      await addSearchHistory(user.uid, query.trim());

      // Optimistically update local state
      setUserPreferencesData((prev) => {
        if (!prev) return prev;
        const filteredHistory = prev.searchHistory.filter(
          (q) => q.toLowerCase() !== query.toLowerCase()
        );
        return {
          ...prev,
          searchHistory: [query, ...filteredHistory].slice(0, 20),
        };
      });
    } catch (err) {
      console.error('[AuthContext] Error adding to search history:', err);
    }
  }, [user]);

  /**
   * Clear search history (new Firestore-based system)
   */
  const clearUserSearchHistory = useCallback(async (): Promise<void> => {
    if (!user) return;

    try {
      await clearSearchHistoryInFirestore(user.uid);

      // Update local state
      setUserPreferencesData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          searchHistory: [],
        };
      });

      console.log('[AuthContext] Search history cleared');
    } catch (err) {
      console.error('[AuthContext] Error clearing search history:', err);
    }
  }, [user]);

  /**
   * Update user photo URL (Firestore and local state)
   */
  const updatePhotoURL = useCallback(async (uri: string): Promise<void> => {
    if (!user) return;
    try {
      await setDoc(doc(firestore, USERS_COLLECTION, user.uid), {
        photoURL: uri,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      console.log('[AuthContext] auth.currentUser?.updateProfile is unsupported in Expo Web or failed.');

      setUserProfile((prev) => prev ? { ...prev, photoURL: uri } : prev);
      console.log('[AuthContext] Photo URL updated to:', uri);
    } catch (err) {
      console.error('[AuthContext] Error updating photo URL:', err);
    }
  }, [user]);

  // ==========================================================================
  // Context Value
  // ==========================================================================

  const value = useMemo<AuthContextValue>(() => ({
    // Auth state
    user,
    userProfile,
    isLoading,
    isAuthenticated: !!user,
    error,
    // Actions
    signInWithGoogle,
    bypassAuth,
    signOut,
    clearError,
    createUserProfile,
    refreshUserProfile,
    completeOnboarding,
    // Preferences (existing saved locations system)
    preferences,
    saveLocation,
    removeLocation,
    addRecentSearch,
    clearRecentSearches,
    quickLocations: QUICK_LOCATIONS,
    // New User Preferences (savedTrips from Firestore)
    userPreferencesData,
    isLoadingPreferences,
    refreshPreferences,
    addSavedTrip,
    removeSavedTrip,
    addToSearchHistory,
    clearUserSearchHistory,
    // Photo and Gamification
    updatePhotoURL,
    unlockedAchievements,
    currentStats,
  }), [
    user,
    userProfile,
    isLoading,
    error,
    signInWithGoogle,
    bypassAuth,
    signOut,
    clearError,
    createUserProfile,
    refreshUserProfile,
    completeOnboarding,
    preferences,
    saveLocation,
    removeLocation,
    addRecentSearch,
    clearRecentSearches,
    userPreferencesData,
    isLoadingPreferences,
    refreshPreferences,
    addSavedTrip,
    removeSavedTrip,
    addToSearchHistory,
    clearUserSearchHistory,
    updatePhotoURL,
    unlockedAchievements,
    currentStats,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access authentication context
 * 
 * @returns Auth context value
 * @throws Error if used outside AuthProvider
 * 
 * @example
 * ```tsx
 * const { user, userProfile, isAuthenticated, signInWithGoogle, signOut } = useAuth();
 * 
 * // Check if user needs to complete registration
 * if (isAuthenticated && !userProfile) {
 *   return <RegistrationScreen />;
 * }
 * ```
 */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

// =============================================================================
// Exports
// =============================================================================

export default AuthContext;
