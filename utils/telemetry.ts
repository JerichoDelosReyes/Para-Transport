type TelemetryContext = Record<string, unknown> | undefined;

export function logTrace(_scope: string, _event: string, _context?: TelemetryContext): void {
  // Telemetry disabled intentionally.
}

export function logError(_scope: string, _event: string, _error: unknown, _context?: TelemetryContext): void {
  // Telemetry disabled intentionally.
}
