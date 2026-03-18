/**
 * @fileoverview Commute History Data Schema Design
 * @description TypeScript interfaces and type definitions for commute history storage.
 *              This is a DESIGN FILE - implementation will follow after framework setup.
 * @module services/commuteHistory.design
 * @version 1.0.0
 * 
 * Task #43 - Phase 1: Logic Layer (Schema Design)
 * Developer 3: The "Integrator" (UI/UX & Gamification)
 * 
 * NOTE: This file contains type definitions and interface contracts only.
 * Actual implementation requires AsyncStorage from React Native.
 */

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/**
 * Represents a completed commute record stored in history
 * Contains all relevant data about a single commute trip
 */
export interface CommuteRecord {
  /** Unique identifier for the record */
  id: string;
  /** When the commute started */
  startTime: Date;
  /** When the commute ended */
  endTime: Date;
  /** Total duration in milliseconds */
  duration: number;
  /** Route name or identifier (e.g., "Imus-Bacoor") */
  routeId: string;
  /** Starting location */
  origin?: string;
  /** Ending location */
  destination?: string;
  /** Distance traveled in kilometers */
  distance?: number;
  /** Total fare paid in PHP */
  fare?: number;
  /** Type of vehicle used */
  vehicleType?: 'jeepney' | 'tricycle' | 'bus';
  /** User notes about the trip */
  notes?: string;
  /** Timestamp when record was created */
  createdAt?: Date;
  /** Timestamp when record was last updated */
  updatedAt?: Date;
}

/**
 * Aggregated statistics for all commute history
 * Calculated from CommuteRecord data
 */
export interface CommuteStats {
  /** Total number of recorded commutes */
  totalCommutes: number;
  /** Sum of all commute durations in milliseconds */
  totalDuration: number;
  /** Sum of all distances in kilometers */
  totalDistance: number;
  /** Sum of all fares in PHP */
  totalFare: number;
  /** Average duration per commute in milliseconds */
  averageDuration: number;
  /** Average distance per commute in kilometers */
  averageDistance: number;
  /** Most frequently used route */
  favoriteRoute?: string;
  /** Date of the last recorded commute */
  lastCommuteDate?: Date;
  /** Breakdown by vehicle type */
  vehicleTypeBreakdown?: {
    jeepney: number;
    tricycle: number;
    bus: number;
  };
  /** Commutes this week */
  weeklyCount?: number;
  /** Commutes this month */
  monthlyCount?: number;
}

/**
 * Daily commute summary for calendar/analytics views
 */
export interface DailyCommuteSummary {
  /** Date (YYYY-MM-DD format) */
  date: string;
  /** Number of commutes on this day */
  count: number;
  /** Total duration for the day in milliseconds */
  totalDuration: number;
  /** Total fare for the day in PHP */
  totalFare: number;
  /** List of commute IDs for this day */
  commuteIds: string[];
}

/**
 * Route frequency data for analytics
 */
export interface RouteFrequency {
  /** Route name */
  route: string;
  /** Number of times this route was taken */
  count: number;
  /** Average duration for this route */
  averageDuration: number;
  /** Average fare for this route */
  averageFare?: number;
  /** Last time this route was used */
  lastUsed: Date;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

/**
 * AsyncStorage key constants for commute data persistence
 * Prefixed with @para: for namespace isolation
 */
export const STORAGE_KEYS = {
  /** Array of CommuteRecord objects */
  COMMUTE_HISTORY: '@para:commute_history',
  /** CommuteStats object */
  COMMUTE_STATS: '@para:commute_stats',
  /** Current active CommuteSession (for app restart recovery) */
  CURRENT_SESSION: '@para:current_session',
  /** Daily summaries cache */
  DAILY_SUMMARIES: '@para:daily_summaries',
  /** Route frequency cache */
  ROUTE_FREQUENCIES: '@para:route_frequencies',
  /** Last sync timestamp */
  LAST_SYNC: '@para:last_sync',
  /** User preferences for commute tracking */
  COMMUTE_PREFERENCES: '@para:commute_preferences',
} as const;

/**
 * Type for storage key values
 */
export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

// ============================================================================
// USER PREFERENCES
// ============================================================================

/**
 * User preferences for commute tracking
 */
export interface CommutePreferences {
  /** Default vehicle type selection */
  defaultVehicleType?: 'jeepney' | 'tricycle' | 'bus';
  /** Auto-save session on app background */
  autoSaveOnBackground: boolean;
  /** Show confirmation before saving */
  confirmBeforeSave: boolean;
  /** Enable trip reminders */
  enableReminders: boolean;
  /** Default fare (for quick entry) */
  defaultFare?: number;
  /** Favorite routes for quick selection */
  favoriteRoutes: string[];
  /** Recent origins for quick selection */
  recentOrigins: string[];
  /** Recent destinations for quick selection */
  recentDestinations: string[];
}

/**
 * Default user preferences
 */
export const DEFAULT_COMMUTE_PREFERENCES: CommutePreferences = {
  autoSaveOnBackground: true,
  confirmBeforeSave: true,
  enableReminders: false,
  favoriteRoutes: [],
  recentOrigins: [],
  recentDestinations: [],
};

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

/**
 * Interface contract for CommuteHistoryService
 * Defines all methods that will be implemented after framework setup
 * 
 * [PLACEHOLDER] - Implementation (Requires framework installation)
 * TODO: Will be implemented after React Native setup
 * Dependencies needed: @react-native-async-storage/async-storage
 */
export interface ICommuteHistoryService {
  // ============================================
  // CRUD Operations
  // ============================================
  
  /**
   * Save a new commute record to history
   * @param record - The commute record to save
   */
  saveCommute(record: CommuteRecord): Promise<void>;
  
  /**
   * Get commute history with optional limit
   * @param limit - Maximum number of records to return (default: all)
   * @returns Array of commute records, sorted by date (newest first)
   */
  getHistory(limit?: number): Promise<CommuteRecord[]>;
  
  /**
   * Get a single commute record by ID
   * @param id - The commute record ID
   * @returns The commute record or null if not found
   */
  getCommuteById(id: string): Promise<CommuteRecord | null>;
  
  /**
   * Update an existing commute record
   * @param id - The commute record ID
   * @param updates - Partial record with fields to update
   */
  updateCommute(id: string, updates: Partial<CommuteRecord>): Promise<void>;
  
  /**
   * Delete a commute record from history
   * @param id - The commute record ID to delete
   */
  deleteCommute(id: string): Promise<void>;
  
  /**
   * Clear all commute history
   * WARNING: This is irreversible
   */
  clearHistory(): Promise<void>;

  // ============================================
  // Statistics & Analytics
  // ============================================
  
  /**
   * Get aggregated commute statistics
   * @returns Calculated stats from all history
   */
  getStats(): Promise<CommuteStats>;
  
  /**
   * Update statistics after a new commute
   * @param record - The new commute record to include in stats
   */
  updateStats(record: CommuteRecord): Promise<void>;
  
  /**
   * Recalculate all statistics from scratch
   * Useful after data import or corruption fix
   */
  recalculateStats(): Promise<CommuteStats>;

  // ============================================
  // Query & Filter
  // ============================================
  
  /**
   * Get commute history within a date range
   * @param start - Start date (inclusive)
   * @param end - End date (inclusive)
   * @returns Filtered commute records
   */
  getHistoryByDateRange(start: Date, end: Date): Promise<CommuteRecord[]>;
  
  /**
   * Get commute history for a specific route
   * @param route - Route name to filter by
   * @returns Commute records for that route
   */
  getHistoryByRoute(route: string): Promise<CommuteRecord[]>;
  
  /**
   * Get commute history by vehicle type
   * @param vehicleType - Vehicle type to filter by
   * @returns Filtered commute records
   */
  getHistoryByVehicleType(vehicleType: 'jeepney' | 'tricycle' | 'bus'): Promise<CommuteRecord[]>;
  
  /**
   * Search commute history
   * @param query - Search query (matches route, origin, destination, notes)
   * @returns Matching commute records
   */
  searchHistory(query: string): Promise<CommuteRecord[]>;
  
  /**
   * Get route frequency data
   * @returns Array of routes sorted by frequency
   */
  getRouteFrequencies(): Promise<RouteFrequency[]>;
  
  /**
   * Get daily summaries for a date range
   * @param start - Start date
   * @param end - End date
   * @returns Array of daily summaries
   */
  getDailySummaries(start: Date, end: Date): Promise<DailyCommuteSummary[]>;

  // ============================================
  // Session Management
  // ============================================
  
  /**
   * Save current session for recovery on app restart
   * @param session - Current commute session data
   */
  saveCurrentSession(session: CommuteSession): Promise<void>;
  
  /**
   * Get saved session (if any) for recovery
   * @returns Saved session or null
   */
  getCurrentSession(): Promise<CommuteSession | null>;
  
  /**
   * Clear saved session
   */
  clearCurrentSession(): Promise<void>;

  // ============================================
  // Preferences
  // ============================================
  
  /**
   * Get user commute preferences
   * @returns User preferences or defaults
   */
  getPreferences(): Promise<CommutePreferences>;
  
  /**
   * Update user preferences
   * @param updates - Partial preferences to update
   */
  updatePreferences(updates: Partial<CommutePreferences>): Promise<void>;

  // ============================================
  // Data Management
  // ============================================
  
  /**
   * Export all commute data as JSON
   * @returns JSON string of all commute data
   */
  exportData(): Promise<string>;
  
  /**
   * Import commute data from JSON
   * @param jsonData - JSON string to import
   * @param merge - Whether to merge with existing data (default: false, replaces)
   */
  importData(jsonData: string, merge?: boolean): Promise<void>;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Create a new CommuteRecord type (without auto-generated fields)
 */
export type CreateCommuteRecord = Omit<CommuteRecord, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Update a CommuteRecord type (all fields optional except id)
 */
export type UpdateCommuteRecord = Partial<Omit<CommuteRecord, 'id'>>;

/**
 * Serialized version of CommuteRecord for storage
 * Dates are stored as ISO strings
 */
export interface SerializedCommuteRecord extends Omit<CommuteRecord, 'startTime' | 'endTime' | 'createdAt' | 'updatedAt'> {
  startTime: string;
  endTime: string;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// CONVERSION UTILITIES
// ============================================================================

/**
 * Convert a CommuteRecord to its serialized form for storage
 * @param record - The record to serialize
 * @returns Serialized record with ISO date strings
 */
export function serializeCommuteRecord(record: CommuteRecord): SerializedCommuteRecord {
  return {
    ...record,
    startTime: record.startTime.toISOString(),
    endTime: record.endTime.toISOString(),
    createdAt: record.createdAt?.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
  };
}

/**
 * Convert a serialized record back to CommuteRecord
 * @param serialized - The serialized record
 * @returns CommuteRecord with Date objects
 */
export function deserializeCommuteRecord(serialized: SerializedCommuteRecord): CommuteRecord {
  return {
    ...serialized,
    startTime: new Date(serialized.startTime),
    endTime: new Date(serialized.endTime),
    createdAt: serialized.createdAt ? new Date(serialized.createdAt) : undefined,
    updatedAt: serialized.updatedAt ? new Date(serialized.updatedAt) : undefined,
  };
}

// ============================================================================
// [PLACEHOLDER] - AsyncStorage Implementation (Requires framework installation)
// TODO: Will be implemented after React Native setup
// Dependencies needed: @react-native-async-storage/async-storage
//
// Implementation file: src/services/commuteHistory.ts
// 
// Example implementation outline:
//
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { ICommuteHistoryService, CommuteRecord, STORAGE_KEYS } from './commuteHistory.design';
//
// export class CommuteHistoryService implements ICommuteHistoryService {
//   async saveCommute(record: CommuteRecord): Promise<void> {
//     const history = await this.getHistory();
//     history.unshift(record);
//     await AsyncStorage.setItem(STORAGE_KEYS.COMMUTE_HISTORY, JSON.stringify(history));
//     await this.updateStats(record);
//   }
//   // ... rest of implementation
// }
// ============================================================================

// ============================================================================
// VALIDATION HELPERS (Pure TypeScript - No dependencies)
// ============================================================================

/**
 * Validate a CommuteRecord object
 * @param record - The record to validate
 * @returns Object with isValid boolean and error messages
 */
export function validateCommuteRecord(record: Partial<CommuteRecord>): { 
  isValid: boolean; 
  errors: string[];
} {
  const errors: string[] = [];

  if (!record.startTime) {
    errors.push('Start time is required');
  }
  
  if (!record.endTime) {
    errors.push('End time is required');
  }
  
  if (record.startTime && record.endTime && record.startTime > record.endTime) {
    errors.push('Start time cannot be after end time');
  }
  
  if (record.duration !== undefined && record.duration < 0) {
    errors.push('Duration cannot be negative');
  }
  
  if (record.fare !== undefined && record.fare < 0) {
    errors.push('Fare cannot be negative');
  }
  
  if (record.distance !== undefined && record.distance < 0) {
    errors.push('Distance cannot be negative');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate duration from start and end times
 * @param startTime - Start time
 * @param endTime - End time
 * @returns Duration in milliseconds
 */
export function calculateDuration(startTime: Date, endTime: Date): number {
  return Math.max(0, endTime.getTime() - startTime.getTime());
}

/**
 * Create a properly formatted CommuteRecord
 * @param data - Partial record data
 * @returns Complete CommuteRecord with generated fields
 */
export function createCommuteRecord(data: CreateCommuteRecord & { id?: string }): CommuteRecord {
  const now = new Date();
  return {
    id: data.id || generateId(),
    startTime: data.startTime,
    endTime: data.endTime,
    duration: data.duration || calculateDuration(data.startTime, data.endTime),
    route: data.route,
    origin: data.origin,
    destination: data.destination,
    distance: data.distance,
    fare: data.fare,
    vehicleType: data.vehicleType,
    notes: data.notes,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  STORAGE_KEYS,
  DEFAULT_COMMUTE_PREFERENCES,
  validateCommuteRecord,
  calculateDuration,
  createCommuteRecord,
  serializeCommuteRecord,
  deserializeCommuteRecord,
};
