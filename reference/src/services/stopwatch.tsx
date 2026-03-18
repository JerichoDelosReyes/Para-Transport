/**
 * @fileoverview Commute Stopwatch Core Logic
 * @description Pure TypeScript stopwatch service for tracking commute duration.
 *              No React/framework dependencies - ready for integration after framework setup.
 * @module services/stopwatch
 * @version 1.0.0
 * 
 * Task #43 - Phase 1: Logic Layer
 * Developer 3: The "Integrator" (UI/UX & Gamification)
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Represents an active commute timing session
 */
import { CommuteSession } from './commuteHistory.design';

// Re-export for consumers of this module
export { CommuteSession };
/**
 * Internal state for the stopwatch
 */
interface StopwatchState {
  /** Timestamp when timer was started */
  startTime: number | null;
  /** Timestamp when timer was paused */
  pausedTime: number | null;
  /** Accumulated elapsed time before current run */
  accumulatedTime: number;
  /** Whether the stopwatch is currently running */
  isRunning: boolean;
  /** Whether the stopwatch is currently paused */
  isPaused: boolean;
  /** Reference to the interval for cleanup */
  intervalId: ReturnType<typeof setInterval> | null;
}

/**
 * Callback function type for time updates
 */
export type TimeUpdateCallback = (elapsedMs: number) => void;

// ============================================================================
// REACT & REACT NATIVE IMPORTS
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  Platform,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';

// ============================================================================
// API TYPES & CONSTANTS
// ============================================================================

/**
 * Base URL for the Para Mobile backend API
 */
const API_BASE_URL = 'http://localhost:5001/api';

/**
 * API response type for saved commute sessions
 */
export interface SaveCommuteSessionResponse {
  success: boolean;
  data: CommuteSession;
  message?: string;
}

/**
 * API error response type
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string;
}

/**
 * Possible API error types for user-friendly messages
 */
export type ApiErrorType = 
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'CONNECTION_REFUSED'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';

// ============================================================================
// API HELPER FUNCTIONS
// ============================================================================

/**
 * Maps fetch errors to user-friendly error types
 * @param error - The caught error
 * @returns ApiErrorType for categorization
 */
function getApiErrorType(error: unknown): ApiErrorType {
  if (error instanceof TypeError) {
    // Network errors typically throw TypeError
    const message = error.message.toLowerCase();
    if (message.includes('network') || message.includes('fetch')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('timeout') || message.includes('aborted')) {
      return 'TIMEOUT';
    }
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('connection refused') || message.includes('econnrefused')) {
      return 'CONNECTION_REFUSED';
    }
  }
  
  return 'UNKNOWN';
}

/**
 * Gets a user-friendly error message based on error type
 * @param errorType - The categorized error type
 * @param statusCode - Optional HTTP status code
 * @returns User-friendly error message
 */
function getErrorMessage(errorType: ApiErrorType, statusCode?: number): string {
  switch (errorType) {
    case 'NETWORK_ERROR':
      return 'Network error. Please check your internet connection.';
    case 'TIMEOUT':
      return 'Request timed out. Please try again.';
    case 'CONNECTION_REFUSED':
      return 'Unable to connect to server. Please ensure the backend is running.';
    case 'SERVER_ERROR':
      return `Server error (${statusCode || 500}). Please try again later.`;
    case 'INVALID_RESPONSE':
      return 'Invalid response from server. Please try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Saves a commute session to the backend API
 * 
 * @param session - The CommuteSession object to save
 * @returns Promise resolving to the saved session data
 * @throws Error with user-friendly message on failure
 * 
 * @example
 * const savedSession = await saveCommuteSession(mySession);
 * console.log('Saved:', savedSession.id);
 */
export async function saveCommuteSession(session: CommuteSession): Promise<CommuteSession> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(`${API_BASE_URL}/commutes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        id: session.id,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime?.toISOString(),
        duration: session.duration,
        route: session.route || null,
        origin: session.origin || null,
        destination: session.destination || null,
        isPaused: session.isPaused,
        pausedDuration: session.pausedDuration,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      const errorType: ApiErrorType = response.status >= 500 ? 'SERVER_ERROR' : 'INVALID_RESPONSE';
      const errorMessage = getErrorMessage(errorType, response.status);
      console.error(`[Stopwatch API] HTTP ${response.status}: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // Parse response
    let data: SaveCommuteSessionResponse;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('[Stopwatch API] Failed to parse response:', parseError);
      throw new Error(getErrorMessage('INVALID_RESPONSE'));
    }

    // Validate response structure
    if (!data || typeof data !== 'object') {
      console.error('[Stopwatch API] Invalid response structure:', data);
      throw new Error(getErrorMessage('INVALID_RESPONSE'));
    }

    console.log('[Stopwatch API] Session saved successfully:', data);
    return data.data || session; // Return saved data or original if not in response

  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      const errorMessage = getErrorMessage('TIMEOUT');
      console.error('[Stopwatch API] Request timeout:', errorMessage);
      throw new Error(errorMessage);
    }

    // Re-throw if already a user-friendly error
    if (error instanceof Error && !error.message.includes('fetch')) {
      throw error;
    }

    // Handle other errors
    const errorType = getApiErrorType(error);
    const errorMessage = getErrorMessage(errorType);
    console.error('[Stopwatch API] Error saving session:', error);
    throw new Error(errorMessage);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generates a unique identifier for sessions
 * Uses timestamp + random string for uniqueness
 * @returns A unique string identifier
 * @example
 * const id = generateId(); // "1703145600000-abc123"
 */
export function generateId(): string {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomPart}`;
}

/**
 * Formats milliseconds to HH:MM:SS format
 * @param ms - Time in milliseconds
 * @returns Formatted time string (e.g., "01:05:09")
 * @example
 * formatTime(3661000); // "01:01:01"
 * formatTime(65000);   // "00:01:05"
 */
export function formatTime(ms: number): string {
  if (ms < 0) {
    console.warn('[Stopwatch] formatTime received negative value, using 0');
    ms = 0;
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num: number): string => num.toString().padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Formats milliseconds to human-readable duration
 * @param ms - Time in milliseconds
 * @returns Human-readable duration string (e.g., "1h 5m", "45s")
 * @example
 * formatDuration(3661000); // "1h 1m"
 * formatDuration(65000);   // "1m 5s"
 * formatDuration(5000);    // "5s"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) {
    console.warn('[Stopwatch] formatDuration received negative value, using 0');
    ms = 0;
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  // Only show seconds if less than 1 hour, or if it's the only unit
  if (hours === 0 && (seconds > 0 || parts.length === 0)) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}

/**
 * Creates a new commute session object with a unique ID
 * @param options - Optional initial values for the session
 * @returns A new CommuteSession object
 * @example
 * const session = createCommuteSession({ route: 'Imus-Bacoor' });
 */
export function createCommuteSession(options?: Partial<CommuteSession>): CommuteSession {
  return {
    id: generateId(),
    startTime: new Date(),
    duration: 0,
    isPaused: false,
    pausedDuration: 0,
    ...options,
  };
}

// ============================================================================
// STOPWATCH SERVICE CLASS
// ============================================================================

/**
 * StopwatchService - Core timing logic for commute tracking
 * 
 * A pure TypeScript class that handles precise time tracking with
 * pause/resume functionality. Uses setInterval for continuous updates
 * with proper cleanup to prevent memory leaks.
 * 
 * @example
 * const stopwatch = new StopwatchService();
 * stopwatch.start();
 * // ... later
 * stopwatch.pause();
 * // ... later
 * stopwatch.resume();
 * // ... finally
 * const duration = stopwatch.stop();
 */
export class StopwatchService {
  /** Internal state management */
  private state: StopwatchState;
  
  /** Optional callback for time updates */
  private onUpdate: TimeUpdateCallback | null = null;
  
  /** Update interval in milliseconds */
  private readonly UPDATE_INTERVAL = 100;

  /**
   * Creates a new StopwatchService instance
   * @param onUpdate - Optional callback function called every 100ms with elapsed time
   */
  constructor(onUpdate?: TimeUpdateCallback) {
    this.state = this.getInitialState();
    this.onUpdate = onUpdate || null;
  }

  /**
   * Returns the initial state object
   * @private
   */
  private getInitialState(): StopwatchState {
    return {
      startTime: null,
      pausedTime: null,
      accumulatedTime: 0,
      isRunning: false,
      isPaused: false,
      intervalId: null,
    };
  }

  /**
   * Starts the stopwatch
   * If already running, logs a warning and does nothing
   * @returns void
   */
  public start(): void {
    if (this.state.isRunning) {
      console.warn('[Stopwatch] Timer is already running. Use reset() first if you want to restart.');
      return;
    }

    if (this.state.isPaused) {
      console.warn('[Stopwatch] Timer is paused. Use resume() to continue or reset() to start fresh.');
      return;
    }

    this.state.startTime = Date.now();
    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.accumulatedTime = 0;

    this.startInterval();
  }

  /**
   * Pauses the stopwatch
   * Stores the paused timestamp for accurate resume
   * @returns void
   */
  public pause(): void {
    if (!this.state.isRunning) {
      console.warn('[Stopwatch] Cannot pause: timer is not running.');
      return;
    }

    if (this.state.isPaused) {
      console.warn('[Stopwatch] Timer is already paused.');
      return;
    }

    // Store accumulated time up to this point
    this.state.accumulatedTime = this.getElapsedTime();
    this.state.pausedTime = Date.now();
    this.state.isPaused = true;
    this.state.isRunning = false;

    this.stopInterval();
  }

  /**
   * Resumes the stopwatch from a paused state
   * Continues from where it left off without time drift
   * @returns void
   */
  public resume(): void {
    if (this.state.isRunning) {
      console.warn('[Stopwatch] Timer is already running.');
      return;
    }

    if (!this.state.isPaused) {
      console.warn('[Stopwatch] Cannot resume: timer is not paused. Use start() instead.');
      return;
    }

    // Set new start time, keeping accumulated time
    this.state.startTime = Date.now();
    this.state.pausedTime = null;
    this.state.isPaused = false;
    this.state.isRunning = true;

    this.startInterval();
  }

  /**
   * Stops the stopwatch and returns the final duration
   * Cleans up interval and resets running state
   * @returns Final elapsed time in milliseconds
   */
  public stop(): number {
    const finalTime = this.getElapsedTime();

    this.stopInterval();
    
    // Keep the final time but mark as stopped
    this.state.isRunning = false;
    this.state.isPaused = false;
    this.state.startTime = null;
    this.state.pausedTime = null;

    return finalTime;
  }

  /**
   * Resets the stopwatch to initial state
   * Cleans up all intervals and clears all stored time
   * @returns void
   */
  public reset(): void {
    this.stopInterval();
    this.state = this.getInitialState();
  }

  /**
   * Gets the current elapsed time in milliseconds
   * Accounts for pause duration and accumulated time
   * @returns Elapsed time in milliseconds
   */
  public getElapsedTime(): number {
    if (this.state.isRunning && this.state.startTime !== null) {
      // Currently running: accumulated + current run
      return this.state.accumulatedTime + (Date.now() - this.state.startTime);
    }
    
    if (this.state.isPaused) {
      // Paused: return accumulated time (already includes time before pause)
      return this.state.accumulatedTime;
    }

    // Stopped: return accumulated time (final duration)
    return this.state.accumulatedTime;
  }

  /**
   * Checks if the stopwatch is currently running
   * @returns true if timer is actively counting
   */
  public isRunning(): boolean {
    return this.state.isRunning;
  }

  /**
   * Checks if the stopwatch is currently paused
   * @returns true if timer is paused
   */
  public isPaused(): boolean {
    return this.state.isPaused;
  }

  /**
   * Gets the formatted elapsed time as HH:MM:SS
   * Convenience method combining getElapsedTime and formatTime
   * @returns Formatted time string
   */
  public getFormattedTime(): string {
    return formatTime(this.getElapsedTime());
  }

  /**
   * Gets the formatted duration in human-readable format
   * Convenience method combining getElapsedTime and formatDuration
   * @returns Human-readable duration string
   */
  public getFormattedDuration(): string {
    return formatDuration(this.getElapsedTime());
  }

  /**
   * Sets or updates the time update callback
   * @param callback - Function to call on each update, or null to remove
   */
  public setUpdateCallback(callback: TimeUpdateCallback | null): void {
    this.onUpdate = callback;
  }

  /**
   * Creates a CommuteSession object from current state
   * Useful for saving/persisting the current timing session
   * @param options - Additional session properties
   * @returns A CommuteSession object with current timing data
   */
  public toCommuteSession(options?: Partial<CommuteSession>): CommuteSession {
    return {
      id: generateId(),
      startTime: this.state.startTime ? new Date(this.state.startTime) : new Date(),
      duration: this.getElapsedTime(),
      isPaused: this.state.isPaused,
      pausedDuration: 0, // Could track this separately if needed
      ...options,
    };
  }

  /**
   * Starts the update interval
   * @private
   */
  private startInterval(): void {
    if (this.state.intervalId !== null) {
      this.stopInterval();
    }

    this.state.intervalId = setInterval(() => {
      if (this.onUpdate) {
        this.onUpdate(this.getElapsedTime());
      }
    }, this.UPDATE_INTERVAL);
  }

  /**
   * Stops and cleans up the update interval
   * @private
   */
  private stopInterval(): void {
    if (this.state.intervalId !== null) {
      clearInterval(this.state.intervalId);
      this.state.intervalId = null;
    }
  }

  /**
   * Cleanup method - should be called when disposing of the service
   * Ensures no memory leaks from dangling intervals
   */
  public dispose(): void {
    this.stopInterval();
    this.state = this.getInitialState();
    this.onUpdate = null;
  }
}

// ============================================================================
// REACT NATIVE INTEGRATION
// ============================================================================

// ============================================================================
// THEME CONSTANTS - Para Mobile App Theme
// ============================================================================

/**
 * Color palette for the Para Mobile app stopwatch
 * Uses a modern, clean design with clear visual hierarchy
 */
const THEME = {
  colors: {
    // Primary colors
    primary: '#2563EB',       // Blue - main action color
    primaryDark: '#1D4ED8',   // Darker blue for pressed state
    primaryLight: '#3B82F6',  // Lighter blue for highlights
    
    // State colors
    success: '#10B981',       // Green - running state
    successDark: '#059669',   // Darker green
    warning: '#F59E0B',       // Amber - paused state
    warningDark: '#D97706',   // Darker amber
    danger: '#EF4444',        // Red - stop/reset
    dangerDark: '#DC2626',    // Darker red
    
    // Neutral colors
    background: '#F8FAFC',    // Light gray background
    surface: '#FFFFFF',       // White surface
    surfaceAlt: '#F1F5F9',    // Alternative surface
    text: '#1E293B',          // Dark text
    textSecondary: '#64748B', // Secondary text
    textMuted: '#94A3B8',     // Muted text
    border: '#E2E8F0',        // Border color
    
    // Status indicators
    running: '#10B981',       // Green glow when running
    paused: '#F59E0B',        // Amber glow when paused
    stopped: '#94A3B8',       // Gray when stopped
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    full: 9999,
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
    xxl: 32,
    display: 56,
  },
} as const;

// ============================================================================
// TYPES FOR REACT INTEGRATION
// ============================================================================

/**
 * Stopwatch state for React hooks
 */
export interface UseStopwatchState {
  /** Current elapsed time in milliseconds */
  elapsedTime: number;
  /** Formatted time string (HH:MM:SS) */
  formattedTime: string;
  /** Human-readable duration string */
  formattedDuration: string;
  /** Whether the stopwatch is currently running */
  isRunning: boolean;
  /** Whether the stopwatch is currently paused */
  isPaused: boolean;
  /** Whether the stopwatch has been started at least once */
  hasStarted: boolean;
}

/**
 * Stopwatch controls returned by useStopwatch hook
 */
export interface UseStopwatchControls {
  /** Start the stopwatch */
  start: () => void;
  /** Pause the stopwatch */
  pause: () => void;
  /** Resume from paused state */
  resume: () => void;
  /** Stop the stopwatch and return final time */
  stop: () => number;
  /** Reset the stopwatch to initial state */
  reset: () => void;
  /** Toggle between running and paused states */
  toggle: () => void;
}

/**
 * Complete return type for useStopwatch hook
 */
export type UseStopwatchReturn = UseStopwatchState & UseStopwatchControls;

/**
 * Props for the StopwatchDisplay component
 */
export interface StopwatchDisplayProps {
  /** Current elapsed time in milliseconds */
  elapsedTime: number;
  /** Whether the stopwatch is running */
  isRunning: boolean;
  /** Whether the stopwatch is paused */
  isPaused: boolean;
  /** Optional custom styles for the container */
  style?: ViewStyle;
  /** Optional custom styles for the time text */
  timeStyle?: TextStyle;
  /** Whether to show the status indicator */
  showStatus?: boolean;
}

/**
 * Props for the StopwatchButton component
 */
export interface StopwatchButtonProps {
  /** Button title text */
  title: string;
  /** Press handler */
  onPress: () => void;
  /** Button variant for styling */
  variant: 'start' | 'pause' | 'resume' | 'stop' | 'reset';
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Optional custom styles */
  style?: ViewStyle;
}

/**
 * Props for the complete Stopwatch component
 */
export interface StopwatchProps {
  /** Callback when stopwatch is started */
  onStart?: () => void;
  /** Callback when stopwatch is paused */
  onPause?: (elapsedTime: number) => void;
  /** Callback when stopwatch is resumed */
  onResume?: () => void;
  /** Callback when stopwatch is stopped */
  onStop?: (elapsedTime: number, session: CommuteSession) => void;
  /** Callback when stopwatch is reset */
  onReset?: () => void;
  /** Callback on each time update (every 100ms) */
  onTimeUpdate?: (elapsedTime: number) => void;
  /** Callback when save fails (for external error handling) */
  onSaveError?: (error: Error) => void;
  /** Optional initial elapsed time in milliseconds */
  initialTime?: number;
  /** Whether to enable haptic feedback on button press */
  enableHaptics?: boolean;
  /** Optional custom styles for the container */
  style?: ViewStyle;
  /** Whether to auto-start the stopwatch on mount */
  autoStart?: boolean;
  /** Initial route value */
  initialRoute?: string;
  /** Initial origin value */
  initialOrigin?: string;
  /** Initial destination value */
  initialDestination?: string;
  /** Whether to save to backend on stop (default: true) */
  saveToBackend?: boolean;
}

// ============================================================================
// CUSTOM HOOK: useStopwatch
// ============================================================================

/**
 * Custom React hook for stopwatch functionality
 * 
 * Provides complete stopwatch state and controls with proper cleanup.
 * Uses useRef for the service instance to maintain state across renders.
 * 
 * @param initialTime - Optional initial elapsed time in milliseconds
 * @returns Stopwatch state and control functions
 * 
 * @example
 * const {
 *   formattedTime,
 *   isRunning,
 *   isPaused,
 *   start,
 *   pause,
 *   resume,
 *   reset,
 *   toggle
 * } = useStopwatch();
 */
export function useStopwatch(initialTime: number = 0): UseStopwatchReturn {
  // Use ref for stopwatch service to persist across renders
  const stopwatchRef = useRef<StopwatchService | null>(null);
  
  // Track if we've started at least once (for UI logic)
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  
  // State for elapsed time (drives re-renders)
  const [elapsedTime, setElapsedTime] = useState<number>(initialTime);
  
  // State for running/paused status
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Initialize stopwatch service on mount
  useEffect(() => {
    // Create callback that updates state
    const handleTimeUpdate: TimeUpdateCallback = (elapsed) => {
      setElapsedTime(elapsed);
    };

    // Create new service instance with callback
    stopwatchRef.current = new StopwatchService(handleTimeUpdate);

    // Cleanup on unmount - dispose of service and clear interval
    return () => {
      if (stopwatchRef.current) {
        stopwatchRef.current.dispose();
        stopwatchRef.current = null;
      }
    };
  }, []);

  // Sync state when running status might have changed externally
  useEffect(() => {
    const syncState = () => {
      if (stopwatchRef.current) {
        setIsRunning(stopwatchRef.current.isRunning());
        setIsPaused(stopwatchRef.current.isPaused());
      }
    };

    // Initial sync
    syncState();
  }, []);

  /**
   * Start the stopwatch
   * Handles edge case where stopwatch is already running
   */
  const start = useCallback(() => {
    if (stopwatchRef.current && !stopwatchRef.current.isRunning()) {
      stopwatchRef.current.start();
      setIsRunning(true);
      setIsPaused(false);
      setHasStarted(true);
    }
  }, []);

  /**
   * Pause the stopwatch
   * Only works if currently running
   */
  const pause = useCallback(() => {
    if (stopwatchRef.current && stopwatchRef.current.isRunning()) {
      stopwatchRef.current.pause();
      setIsRunning(false);
      setIsPaused(true);
      // Update elapsed time immediately on pause
      setElapsedTime(stopwatchRef.current.getElapsedTime());
    }
  }, []);

  /**
   * Resume the stopwatch from paused state
   * Only works if currently paused
   */
  const resume = useCallback(() => {
    if (stopwatchRef.current && stopwatchRef.current.isPaused()) {
      stopwatchRef.current.resume();
      setIsRunning(true);
      setIsPaused(false);
    }
  }, []);

  /**
   * Stop the stopwatch and return final elapsed time
   * Stops timing but preserves the final value
   */
  const stop = useCallback((): number => {
    if (stopwatchRef.current) {
      const finalTime = stopwatchRef.current.stop();
      setIsRunning(false);
      setIsPaused(false);
      setElapsedTime(finalTime);
      return finalTime;
    }
    return elapsedTime;
  }, [elapsedTime]);

  /**
   * Reset the stopwatch to initial state
   * Clears all time and resets status flags
   */
  const reset = useCallback(() => {
    if (stopwatchRef.current) {
      stopwatchRef.current.reset();
      setIsRunning(false);
      setIsPaused(false);
      setHasStarted(false);
      setElapsedTime(0);
    }
  }, []);

  /**
   * Toggle between running and paused states
   * Smart toggle that knows current state
   */
  const toggle = useCallback(() => {
    if (!stopwatchRef.current) return;

    if (stopwatchRef.current.isRunning()) {
      pause();
    } else if (stopwatchRef.current.isPaused()) {
      resume();
    } else {
      start();
    }
  }, [pause, resume, start]);

  return {
    // State
    elapsedTime,
    formattedTime: formatTime(elapsedTime),
    formattedDuration: formatDuration(elapsedTime),
    isRunning,
    isPaused,
    hasStarted,
    // Controls
    start,
    pause,
    resume,
    stop,
    reset,
    toggle,
  };
}

// ============================================================================
// CONTEXT: StopwatchContext (Global State Management)
// ============================================================================

/**
 * Context value type for global stopwatch state
 */
interface StopwatchContextValue extends UseStopwatchReturn {
  /** Current commute session data */
  session: CommuteSession | null;
  /** Update session metadata (route, origin, destination) */
  updateSession: (updates: Partial<CommuteSession>) => void;
}

/**
 * Create context with undefined default (requires provider)
 */
const StopwatchContext = createContext<StopwatchContextValue | undefined>(undefined);

/**
 * Props for StopwatchProvider component
 */
interface StopwatchProviderProps {
  children: React.ReactNode;
  /** Optional initial session data */
  initialSession?: Partial<CommuteSession>;
}

/**
 * StopwatchProvider - Global state provider for stopwatch functionality
 * 
 * Wraps the application to provide stopwatch state to all children.
 * Useful for accessing stopwatch state from multiple screens/components.
 * 
 * @example
 * // In App.tsx
 * <StopwatchProvider>
 *   <YourApp />
 * </StopwatchProvider>
 * 
 * // In any child component
 * const { formattedTime, toggle } = useStopwatchContext();
 */
export function StopwatchProvider({ children, initialSession }: StopwatchProviderProps): React.JSX.Element {
  const stopwatch = useStopwatch();
  const [session, setSession] = useState<CommuteSession | null>(
    initialSession ? createCommuteSession(initialSession) : null
  );

  /**
   * Update session metadata without affecting timing
   */
  const updateSession = useCallback((updates: Partial<CommuteSession>) => {
    setSession((prev: CommuteSession | null) => {
      if (prev) {
        return { ...prev, ...updates, duration: stopwatch.elapsedTime };
      }
      return createCommuteSession({ ...updates, duration: stopwatch.elapsedTime });
    });
  }, [stopwatch.elapsedTime]);

  // Auto-update session duration when elapsed time changes
  useEffect(() => {
    if (session) {
      setSession((prev: CommuteSession | null) => prev ? { ...prev, duration: stopwatch.elapsedTime } : null);
    }
  }, [stopwatch.elapsedTime, session]);

  const contextValue: StopwatchContextValue = {
    ...stopwatch,
    session,
    updateSession,
  };

  return (
    <StopwatchContext.Provider value={contextValue}>
      {children}
    </StopwatchContext.Provider>
  );
}

/**
 * Hook to access stopwatch context
 * Throws if used outside of StopwatchProvider
 * 
 * @returns StopwatchContextValue
 * @throws Error if used outside provider
 */
export function useStopwatchContext(): StopwatchContextValue {
  const context = useContext(StopwatchContext);
  if (context === undefined) {
    throw new Error('useStopwatchContext must be used within a StopwatchProvider');
  }
  return context;
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * StopwatchDisplay - Shows the current time in HH:MM:SS format
 * 
 * Features:
 * - Large, readable typography
 * - Visual state indicator (running/paused/stopped)
 * - Animated glow effect when running
 * - Responsive design
 */
export function StopwatchDisplay({
  elapsedTime,
  isRunning,
  isPaused,
  style,
  timeStyle,
  showStatus = true,
}: StopwatchDisplayProps): React.JSX.Element {
  // Animated value for pulse effect when running
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation when running
  useEffect(() => {
    if (isRunning) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      // Reset to normal scale when not running
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isRunning, pulseAnim]);

  // Determine status color and text
  const getStatusConfig = () => {
    if (isRunning) {
      return { color: THEME.colors.running, text: 'Running', icon: '●' };
    }
    if (isPaused) {
      return { color: THEME.colors.paused, text: 'Paused', icon: '❚❚' };
    }
    return { color: THEME.colors.stopped, text: 'Ready', icon: '○' };
  };

  const statusConfig = getStatusConfig();
  const formattedTime = formatTime(elapsedTime);

  return (
    <Animated.View 
      style={[
        styles.displayContainer,
        { transform: [{ scale: pulseAnim }] },
        style,
      ]}
    >
      {/* Time display with HH:MM:SS format */}
      <Text 
        style={[
          styles.timeText,
          { color: isRunning ? THEME.colors.primary : THEME.colors.text },
          timeStyle,
        ]}
        accessibilityLabel={`Elapsed time: ${formattedTime}`}
        accessibilityRole="timer"
      >
        {formattedTime}
      </Text>

      {/* Human-readable duration below */}
      <Text style={styles.durationText}>
        {formatDuration(elapsedTime) || '0s'}
      </Text>

      {/* Status indicator */}
      {showStatus && (
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
          <Text style={[styles.statusText, { color: statusConfig.color }]}>
            {statusConfig.text}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

/**
 * StopwatchButton - Individual control button with variant-based styling
 * 
 * Features:
 * - Different colors for each action type
 * - Pressed state feedback
 * - Disabled state styling
 * - Haptic feedback ready
 */
export function StopwatchButton({
  title,
  onPress,
  variant,
  disabled = false,
  style,
}: StopwatchButtonProps): React.JSX.Element {
  // Animated value for press feedback
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Get colors based on variant
  const getVariantColors = () => {
    switch (variant) {
      case 'start':
        return { bg: THEME.colors.success, pressed: THEME.colors.successDark };
      case 'resume':
        return { bg: THEME.colors.success, pressed: THEME.colors.successDark };
      case 'pause':
        return { bg: THEME.colors.warning, pressed: THEME.colors.warningDark };
      case 'stop':
        return { bg: THEME.colors.danger, pressed: THEME.colors.dangerDark };
      case 'reset':
        return { bg: THEME.colors.textSecondary, pressed: THEME.colors.text };
      default:
        return { bg: THEME.colors.primary, pressed: THEME.colors.primaryDark };
    }
  };

  const colors = getVariantColors();

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
    >
      <Animated.View
        style={[
          styles.button,
          { 
            backgroundColor: disabled ? THEME.colors.border : colors.bg,
            transform: [{ scale: scaleAnim }],
          },
          style,
        ]}
      >
        <Text style={[
          styles.buttonText,
          { color: disabled ? THEME.colors.textMuted : THEME.colors.surface }
        ]}>
          {title}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

/**
 * Stopwatch - Complete stopwatch component with display and controls
 * 
 * Features:
 * - Full start/stop/pause/resume/reset functionality
 * - Visual feedback for all states
 * - Callback props for all actions
 * - Haptic feedback support
 * - Accessible design
 * - Trip metadata input fields (route, origin, destination)
 * - Backend API integration for saving sessions
 * - Loading and error state handling
 * 
 * @example
 * <Stopwatch
 *   onStart={() => console.log('Started!')}
 *   onStop={(time, session) => console.log('Saved:', session.id)}
 *   enableHaptics={true}
 *   saveToBackend={true}
 * />
 */
export function Stopwatch({
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
  onTimeUpdate,
  onSaveError,
  initialTime = 0,
  enableHaptics = true,
  style,
  autoStart = false,
  initialRoute = '',
  initialOrigin = '',
  initialDestination = '',
  saveToBackend = true,
}: StopwatchProps): React.JSX.Element {
  const {
    elapsedTime,
    formattedTime,
    isRunning,
    isPaused,
    hasStarted,
    start,
    pause,
    resume,
    stop,
    reset,
  } = useStopwatch(initialTime);

  // Trip metadata state
  const [route, setRoute] = useState<string>(initialRoute);
  const [origin, setOrigin] = useState<string>(initialOrigin);
  const [destination, setDestination] = useState<string>(initialDestination);

  // Loading and error states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Track start time for session creation
  const startTimeRef = useRef<Date | null>(null);

  // Track previous elapsed time for update callback
  const prevElapsedRef = useRef<number>(elapsedTime);

  // Auto-start if specified
  useEffect(() => {
    if (autoStart) {
      startTimeRef.current = new Date();
      start();
      onStart?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Call onTimeUpdate when elapsed time changes
  useEffect(() => {
    if (elapsedTime !== prevElapsedRef.current) {
      prevElapsedRef.current = elapsedTime;
      onTimeUpdate?.(elapsedTime);
    }
  }, [elapsedTime, onTimeUpdate]);

  /**
   * Trigger haptic feedback if enabled
   * Uses light vibration for button feedback
   */
  const triggerHaptic = useCallback(() => {
    if (enableHaptics && Platform.OS !== 'web') {
      Vibration.vibrate(10);
    }
  }, [enableHaptics]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Handle start button press
   */
  const handleStart = useCallback(() => {
    triggerHaptic();
    clearError();
    startTimeRef.current = new Date();
    start();
    onStart?.();
  }, [triggerHaptic, clearError, start, onStart]);

  /**
   * Handle pause button press
   */
  const handlePause = useCallback(() => {
    triggerHaptic();
    pause();
    onPause?.(elapsedTime);
  }, [triggerHaptic, pause, onPause, elapsedTime]);

  /**
   * Handle resume button press
   */
  const handleResume = useCallback(() => {
    triggerHaptic();
    resume();
    onResume?.();
  }, [triggerHaptic, resume, onResume]);

  /**
   * Handle stop button press with backend save
   */
  const handleStop = useCallback(async () => {
    triggerHaptic();
    const finalTime = stop();
    
    // Create the commute session object
    const session: CommuteSession = {
      id: generateId(),
      startTime: startTimeRef.current || new Date(Date.now() - finalTime),
      endTime: new Date(),
      duration: finalTime,
      route: route.trim() || undefined,
      origin: origin.trim() || undefined,
      destination: destination.trim() || undefined,
      isPaused: false,
      pausedDuration: 0,
    };

    // Save to backend if enabled
    if (saveToBackend) {
      setIsLoading(true);
      setError(null);

      try {
        const savedSession = await saveCommuteSession(session);
        setIsLoading(false);
        onStop?.(finalTime, savedSession);
      } catch (saveError) {
        setIsLoading(false);
        const errorMessage = saveError instanceof Error 
          ? saveError.message 
          : 'Failed to save session';
        setError(errorMessage);
        console.error('[Stopwatch] Save error:', saveError);
        onSaveError?.(saveError instanceof Error ? saveError : new Error(errorMessage));
        // Still call onStop with the unsaved session
        onStop?.(finalTime, session);
      }
    } else {
      // No backend save, just call callback
      onStop?.(finalTime, session);
    }
  }, [triggerHaptic, stop, route, origin, destination, saveToBackend, onStop, onSaveError]);

  /**
   * Retry saving the last session
   */
  const handleRetry = useCallback(async () => {
    if (!startTimeRef.current) return;
    
    const session: CommuteSession = {
      id: generateId(),
      startTime: startTimeRef.current,
      endTime: new Date(),
      duration: elapsedTime,
      route: route.trim() || undefined,
      origin: origin.trim() || undefined,
      destination: destination.trim() || undefined,
      isPaused: false,
      pausedDuration: 0,
    };

    setIsLoading(true);
    setError(null);

    try {
      const savedSession = await saveCommuteSession(session);
      setIsLoading(false);
      onStop?.(elapsedTime, savedSession);
    } catch (saveError) {
      setIsLoading(false);
      const errorMessage = saveError instanceof Error 
        ? saveError.message 
        : 'Failed to save session';
      setError(errorMessage);
      console.error('[Stopwatch] Retry save error:', saveError);
    }
  }, [elapsedTime, route, origin, destination, onStop]);

  /**
   * Handle reset button press
   */
  const handleReset = useCallback(() => {
    triggerHaptic();
    reset();
    clearError();
    startTimeRef.current = null;
    onReset?.();
  }, [triggerHaptic, reset, clearError, onReset]);

  // Determine if inputs should be disabled
  const inputsDisabled = isRunning || isLoading;

  // Determine if buttons should be disabled
  const buttonsDisabled = isLoading;

  return (
    <View style={[styles.container, style]}>
      {/* Trip Metadata Inputs */}
      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.input, inputsDisabled && styles.inputDisabled]}
          placeholder="Route (e.g., Imus-Bacoor)"
          placeholderTextColor={THEME.colors.textMuted}
          value={route}
          onChangeText={setRoute}
          editable={!inputsDisabled}
          accessibilityLabel="Route input"
          accessibilityHint="Enter the route name for this commute"
        />
        <TextInput
          style={[styles.input, inputsDisabled && styles.inputDisabled]}
          placeholder="Starting point"
          placeholderTextColor={THEME.colors.textMuted}
          value={origin}
          onChangeText={setOrigin}
          editable={!inputsDisabled}
          accessibilityLabel="Origin input"
          accessibilityHint="Enter where your commute starts"
        />
        <TextInput
          style={[styles.input, inputsDisabled && styles.inputDisabled]}
          placeholder="Destination"
          placeholderTextColor={THEME.colors.textMuted}
          value={destination}
          onChangeText={setDestination}
          editable={!inputsDisabled}
          accessibilityLabel="Destination input"
          accessibilityHint="Enter where your commute ends"
        />
      </View>

      {/* Timer Display */}
      <StopwatchDisplay
        elapsedTime={elapsedTime}
        isRunning={isRunning}
        isPaused={isPaused}
      />

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            onPress={handleRetry} 
            style={styles.retryButton}
            disabled={isLoading}
            accessibilityLabel="Retry saving"
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Control Buttons */}
      <View style={styles.controlsContainer}>
        {/* Main action button - Start/Pause/Resume based on state */}
        <View style={styles.mainButtonContainer}>
          {!hasStarted || (!isRunning && !isPaused && elapsedTime === 0) ? (
            // Initial state - show Start button
            <StopwatchButton
              title="Start"
              onPress={handleStart}
              variant="start"
              style={styles.mainButton}
              disabled={buttonsDisabled}
            />
          ) : isRunning ? (
            // Running - show Pause button
            <StopwatchButton
              title="Pause"
              onPress={handlePause}
              variant="pause"
              style={styles.mainButton}
              disabled={buttonsDisabled}
            />
          ) : isPaused ? (
            // Paused - show Resume button
            <StopwatchButton
              title="Resume"
              onPress={handleResume}
              variant="resume"
              style={styles.mainButton}
              disabled={buttonsDisabled}
            />
          ) : (
            // Stopped with time - show Start to restart
            <StopwatchButton
              title="Start"
              onPress={handleStart}
              variant="start"
              style={styles.mainButton}
              disabled={buttonsDisabled}
            />
          )}
        </View>

        {/* Secondary buttons - Stop and Reset */}
        <View style={styles.secondaryButtonsContainer}>
          <View style={styles.secondaryButtonWrapper}>
            {isLoading ? (
              <View style={[styles.button, styles.secondaryButton, styles.loadingButton]}>
                <ActivityIndicator size="small" color={THEME.colors.surface} />
                <Text style={[styles.buttonText, styles.loadingButtonText]}>Saving...</Text>
              </View>
            ) : (
              <StopwatchButton
                title="Stop"
                onPress={handleStop}
                variant="stop"
                disabled={(!isRunning && !isPaused) || buttonsDisabled}
                style={styles.secondaryButton}
              />
            )}
          </View>
          <View style={styles.secondaryButtonWrapper}>
            <StopwatchButton
              title="Reset"
              onPress={handleReset}
              variant="reset"
              disabled={(elapsedTime === 0 && !isRunning && !isPaused) || buttonsDisabled}
              style={styles.secondaryButton}
            />
          </View>
        </View>
      </View>

      {/* Lap time hint (future feature placeholder) */}
      {isRunning && (
        <Text style={styles.hintText}>
          Tap pause to record a lap time
        </Text>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Container styles
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.lg,
  },

  // Display styles
  displayContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: THEME.spacing.xl,
    paddingHorizontal: THEME.spacing.xxl,
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    marginBottom: THEME.spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 280,
  },

  timeText: {
    fontSize: THEME.fontSize.display,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },

  durationText: {
    fontSize: THEME.fontSize.md,
    color: THEME.colors.textSecondary,
    marginTop: THEME.spacing.sm,
  },

  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.xs,
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.borderRadius.full,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: THEME.spacing.sm,
  },

  statusText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Button styles
  button: {
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.xl,
    borderRadius: THEME.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },

  buttonText: {
    fontSize: THEME.fontSize.lg,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Controls layout
  controlsContainer: {
    width: '100%',
    alignItems: 'center',
  },

  mainButtonContainer: {
    marginBottom: THEME.spacing.lg,
  },

  mainButton: {
    minWidth: 160,
    paddingVertical: THEME.spacing.lg,
  },

  secondaryButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },

  secondaryButtonWrapper: {
    marginHorizontal: THEME.spacing.xs,
  },

  secondaryButton: {
    minWidth: 100,
    marginHorizontal: THEME.spacing.xs,
  },

  // Input styles
  inputContainer: {
    width: '100%',
    marginBottom: THEME.spacing.lg,
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
  },

  input: {
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius.sm,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
    fontSize: THEME.fontSize.md,
    color: THEME.colors.text,
  },

  inputDisabled: {
    backgroundColor: THEME.colors.border,
    color: THEME.colors.textMuted,
  },

  // Error styles
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: THEME.colors.danger,
    borderRadius: THEME.borderRadius.sm,
    padding: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
    width: '100%',
  },

  errorText: {
    color: THEME.colors.danger,
    fontSize: THEME.fontSize.sm,
    flex: 1,
  },

  retryButton: {
    backgroundColor: THEME.colors.danger,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.borderRadius.sm,
    marginLeft: THEME.spacing.sm,
  },

  retryButtonText: {
    color: THEME.colors.surface,
    fontSize: THEME.fontSize.sm,
    fontWeight: '600',
  },

  // Loading styles
  loadingButton: {
    backgroundColor: THEME.colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingButtonText: {
    marginLeft: THEME.spacing.sm,
    color: THEME.colors.surface,
  },

  // Hint text
  hintText: {
    marginTop: THEME.spacing.lg,
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textMuted,
    fontStyle: 'italic',
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default StopwatchService;

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*
// USAGE EXAMPLE:
// Run with: npx ts-node src/services/stopwatch.ts
// Or test in Node.js REPL after compiling to JS

const stopwatch = new StopwatchService((elapsed) => {
  // Optional: This callback fires every 100ms
  // console.log('Elapsed:', formatTime(elapsed));
});

// Start timer
stopwatch.start();
console.log('Timer started');
console.log('Is running:', stopwatch.isRunning()); // true

// After 3 seconds, pause
setTimeout(() => {
  stopwatch.pause();
  console.log('Paused at:', formatTime(stopwatch.getElapsedTime()));
  console.log('Is paused:', stopwatch.isPaused()); // true
  console.log('Is running:', stopwatch.isRunning()); // false
}, 3000);

// After 5 seconds (2 seconds of pause), resume
setTimeout(() => {
  stopwatch.resume();
  console.log('Resumed');
  console.log('Elapsed after resume:', formatTime(stopwatch.getElapsedTime()));
  // Should still be ~3 seconds (pause time not counted)
}, 5000);

// After 8 seconds (3 more seconds of running), stop
setTimeout(() => {
  const totalTime = stopwatch.stop();
  console.log('Total time:', formatTime(totalTime)); // ~6 seconds (3 + 3, excluding 2s pause)
  console.log('Duration:', formatDuration(totalTime));
  
  // Create a session object for saving
  const session = stopwatch.toCommuteSession({
    route: 'Imus-Bacoor Jeepney',
    origin: 'Imus City Hall',
    destination: 'SM Bacoor'
  });
  console.log('Session:', session);
  
  // Cleanup
  stopwatch.dispose();
}, 8000);

// Alternative: Quick test without setTimeout
// const quickTest = () => {
//   const sw = new StopwatchService();
//   sw.start();
//   console.log('Started:', sw.getFormattedTime());
//   
//   // Simulate some time passing (for testing only)
//   const wait = (ms: number) => {
//     const end = Date.now() + ms;
//     while (Date.now() < end) { }
//   };
//   
//   wait(1000);
//   console.log('After 1s:', sw.getFormattedTime());
//   
//   sw.pause();
//   wait(500);
//   console.log('After pause + 0.5s wait:', sw.getFormattedTime());
//   
//   sw.resume();
//   wait(1000);
//   console.log('After resume + 1s:', sw.getFormattedTime());
//   
//   const final = sw.stop();
//   console.log('Final:', formatTime(final), '|', formatDuration(final));
//   
//   sw.dispose();
// };
*/

// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

/*
// Test formatTime
console.log('formatTime tests:');
console.log(formatTime(0));        // "00:00:00"
console.log(formatTime(1000));     // "00:00:01"
console.log(formatTime(60000));    // "00:01:00"
console.log(formatTime(3600000));  // "01:00:00"
console.log(formatTime(3661000));  // "01:01:01"
console.log(formatTime(86399000)); // "23:59:59"

// Test formatDuration
console.log('\nformatDuration tests:');
console.log(formatDuration(0));        // "0s"
console.log(formatDuration(5000));     // "5s"
console.log(formatDuration(65000));    // "1m 5s"
console.log(formatDuration(3600000));  // "1h"
console.log(formatDuration(3661000));  // "1h 1m"
console.log(formatDuration(7325000));  // "2h 2m"

// Test generateId
console.log('\ngenerateId tests:');
console.log(generateId()); // e.g., "1703145600000-abc123"
console.log(generateId()); // Different each time

// Test createCommuteSession
console.log('\ncreateCommuteSession test:');
console.log(createCommuteSession({ route: 'Test Route' }));
*/
