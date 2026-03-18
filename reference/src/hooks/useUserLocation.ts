/**
 * useUserLocation Hook
 * 
 * Handles user location permissions and real-time position tracking
 * using expo-location for React Native.
 * 
 * @module hooks/useUserLocation
 * @requires expo-location
 */

import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';

/**
 * User location coordinates interface
 */
export interface UserCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

/**
 * Permission status types
 */
export type PermissionStatus = 'undetermined' | 'granted' | 'denied';

/**
 * Return type for useUserLocation hook
 */
export interface UseUserLocationResult {
  /** Current user location coordinates */
  location: UserCoordinates | null;
  /** Error message if location access fails */
  errorMsg: string | null;
  /** Current permission status */
  permissionStatus: PermissionStatus;
  /** Loading state while requesting permissions or initial location */
  isLoading: boolean;
  /** Function to manually refresh location */
  refreshLocation: () => Promise<void>;
  /** Function to request permissions again */
  requestPermissions: () => Promise<boolean>;
}

/**
 * Location tracking configuration
 */
const LOCATION_CONFIG: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 5000, // Update every 5 seconds
  distanceInterval: 10, // Update every 10 meters
};

/**
 * Custom hook for tracking user location with permission handling
 * 
 * @returns {UseUserLocationResult} Location state and control functions
 * 
 * @example
 * ```tsx
 * const { location, errorMsg, isLoading, permissionStatus } = useUserLocation();
 * 
 * if (isLoading) return <LoadingSpinner />;
 * if (errorMsg) return <ErrorMessage message={errorMsg} />;
 * if (location) {
 *   console.log(`User at: ${location.latitude}, ${location.longitude}`);
 * }
 * ```
 */
export const useUserLocation = (): UseUserLocationResult => {
  const [location, setLocation] = useState<UserCoordinates | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [locationSubscription, setLocationSubscription] = useState<Location.LocationSubscription | null>(null);

  /**
   * Request foreground location permissions
   */
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status === 'granted') {
        setPermissionStatus('granted');
        return true;
      } else {
        setPermissionStatus('denied');
        setErrorMsg('Location permission was denied. Please enable it in settings to use navigation features.');
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to request location permissions';
      setErrorMsg(message);
      setPermissionStatus('denied');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get current location once
   */
  const refreshLocation = useCallback(async (): Promise<void> => {
    if (permissionStatus !== 'granted') {
      setErrorMsg('Location permission not granted');
      return;
    }

    try {
      setIsLoading(true);
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        accuracy: currentLocation.coords.accuracy,
        altitude: currentLocation.coords.altitude,
        heading: currentLocation.coords.heading,
        speed: currentLocation.coords.speed,
        timestamp: currentLocation.timestamp,
      });
      setErrorMsg(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get current location';
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  }, [permissionStatus]);

  /**
   * Start watching user position
   */
  const startLocationWatch = useCallback(async (): Promise<void> => {
    if (permissionStatus !== 'granted') {
      return;
    }

    try {
      // Clean up existing subscription
      if (locationSubscription) {
        locationSubscription.remove();
      }

      const subscription = await Location.watchPositionAsync(
        LOCATION_CONFIG,
        (newLocation) => {
          setLocation({
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
            accuracy: newLocation.coords.accuracy,
            altitude: newLocation.coords.altitude,
            heading: newLocation.coords.heading,
            speed: newLocation.coords.speed,
            timestamp: newLocation.timestamp,
          });
          setErrorMsg(null);
          setIsLoading(false);
        }
      );

      setLocationSubscription(subscription);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start location tracking';
      setErrorMsg(message);
      setIsLoading(false);
    }
  }, [permissionStatus]);

  /**
   * Initialize location tracking on mount
   */
  useEffect(() => {
    let isMounted = true;

    const initializeLocation = async () => {
      // Check existing permissions first
      const { status } = await Location.getForegroundPermissionsAsync();
      
      if (!isMounted) return;

      if (status === 'granted') {
        setPermissionStatus('granted');
      } else {
        // Request permissions if not already granted
        const granted = await requestPermissions();
        if (!isMounted || !granted) return;
      }
    };

    initializeLocation();

    return () => {
      isMounted = false;
    };
  }, [requestPermissions]);

  /**
   * Start location watching when permissions are granted
   */
  useEffect(() => {
    if (permissionStatus === 'granted') {
      startLocationWatch();
    }

    // Cleanup subscription on unmount
    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionStatus]); // Only re-run when permission status changes

  return {
    location,
    errorMsg,
    permissionStatus,
    isLoading,
    refreshLocation,
    requestPermissions,
  };
};

export default useUserLocation;
