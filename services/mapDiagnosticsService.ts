/**
 * Map Diagnostics Service
 * Tracks map initialization, style URL resolution, blank-map detection, and errors.
 * Provides operational visibility and debugging insights for map rendering.
 */

export type MapDiagnosticEvent = {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  event: string;
  details?: Record<string, any>;
};

class MapDiagnosticsService {
  private events: MapDiagnosticEvent[] = [];
  private maxEvents = 100; // Keep last 100 events in memory
  private onBlankMapDetected: ((details: Record<string, any>) => void) | null = null;

  /**
   * Log a map diagnostic event
   */
  logEvent(level: 'info' | 'warn' | 'error', event: string, details?: Record<string, any>) {
    const timestamp = Date.now();
    const logEntry: MapDiagnosticEvent = {
      timestamp,
      level,
      event,
      details,
    };

    this.events.push(logEntry);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Console output with timestamps
    const timeStr = new Date(timestamp).toISOString();
    const prefix = `[MapDiag-${level.toUpperCase()}] ${timeStr}`;
    const msg = details ? `${event} ${JSON.stringify(details)}` : event;

    if (level === 'error') {
      console.error(prefix, msg);
    } else if (level === 'warn') {
      console.warn(prefix, msg);
    } else {
      console.log(prefix, msg);
    }
  }

  /**
   * Log style URL resolution with resolved path and strategy
   */
  logStyleResolution(strategy: string, resolvedUrl: string, pinnedUrl?: string, fallbackUrl?: string) {
    this.logEvent('info', 'Style URL Resolution', {
      strategy,
      resolvedUrl,
      pinnedUrl: pinnedUrl ? '***masked***' : '(none)',
      fallbackUrl: fallbackUrl ? '***masked***' : '(none)',
      resolutionTime: new Date().toISOString(),
    });
  }

  /**
   * Log map initialization start
   */
  logMapInitStart(centerCoord: [number, number], zoom: number) {
    this.logEvent('info', 'Map Initialization Started', {
      centerLng: centerCoord[0],
      centerLat: centerCoord[1],
      zoom,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log map successfully loaded
   */
  logMapReady(duration?: number) {
    this.logEvent('info', 'Map Ready', {
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Detect and log blank map (no visible tiles)
   */
  logBlankMapDetected(details: Record<string, any>) {
    this.logEvent('warn', 'Blank Map Detected - No visible tiles', {
      ...details,
      detectionTime: new Date().toISOString(),
    });

    if (this.onBlankMapDetected) {
      this.onBlankMapDetected(details);
    }
  }

  /**
   * Log initialization error
   */
  logInitError(error: Error | string, context?: string) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    this.logEvent('error', `Map Initialization Error${context ? ` (${context})` : ''}`, {
      error: errorMsg,
      stack: stack ? stack.split('\n').slice(0, 3).join('; ') : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log camera event (for gesture tracking)
   */
  logCameraEvent(type: 'gesture' | 'animation', pitch?: number, heading?: number) {
    this.logEvent('info', `Camera Event (${type})`, {
      pitch,
      heading,
    });
  }

  /**
   * Log marker/overlay event for debugging overlay rendering
   */
  logOverlayEvent(type: 'marker' | 'line', count: number, change: 'added' | 'updated' | 'removed') {
    this.logEvent('info', `Overlay ${change}: ${type}`, {
      count,
      type,
      change,
    });
  }

  /**
   * Set callback for blank-map detection (e.g., to show user alert)
   */
  onBlankMapDetectedCallback(callback: (details: Record<string, any>) => void) {
    this.onBlankMapDetected = callback;
  }

  /**
   * Get all logged events (for debugging/export)
   */
  getEvents(): MapDiagnosticEvent[] {
    return [...this.events];
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 10): MapDiagnosticEvent[] {
    return this.events.filter((e) => e.level === 'error').slice(-limit);
  }

  /**
   * Clear all events
   */
  clearEvents() {
    this.events = [];
  }

  /**
   * Export diagnostics as JSON for debugging
   */
  exportDiagnostics(): Record<string, any> {
    return {
      exportTime: new Date().toISOString(),
      eventCount: this.events.length,
      events: this.events,
      recentErrors: this.getRecentErrors(10),
    };
  }
}

// Singleton instance
export const mapDiagnostics = new MapDiagnosticsService();
