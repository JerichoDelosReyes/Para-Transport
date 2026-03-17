/**
 * Jest Test Setup for Para Mobile Backend
 * Runs before all test suites
 */

// Increase timeout for MongoDB operations
jest.setTimeout(30000);

// Suppress console.log during tests (optional - comment out for debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
// };

// Keep console.warn and console.error for debugging
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(() => {
  // Optionally suppress specific warnings
  console.warn = (...args) => {
    const message = args[0]?.toString() || '';
    // Allow through important warnings
    if (!message.includes('skipping...')) {
      originalConsoleWarn.apply(console, args);
    }
  };
});

afterAll(() => {
  // Restore console
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});
