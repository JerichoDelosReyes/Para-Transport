/**
 * Jest Test Setup File
 * Runs before each test suite
 */

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global console spy to suppress expected warnings during tests
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(() => {
  // Suppress specific warnings during tests
  console.warn = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    // Allow through important warnings
    if (!message.includes('[Stopwatch]')) {
      originalConsoleWarn.apply(console, args);
    }
  };
});

afterAll(() => {
  // Restore console
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});
