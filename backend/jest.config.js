/**
 * Jest Configuration for Para Mobile Backend
 * Targets the backend environment with Node.js test runner
 */

module.exports = {
  // Test environment - Node.js for backend testing
  testEnvironment: 'node',

  // Root directory for tests
  rootDir: '.',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
  ],

  // Setup files to run before tests
  setupFilesAfterEnv: ['./tests/setup.js'],

  // Coverage configuration
  collectCoverageFrom: [
    'services/**/*.js',
    'routes/**/*.js',
    'models/**/*.js',
    '!**/node_modules/**',
  ],

  // Verbose output
  verbose: true,

  // Timeout for async tests (MongoDB operations may take time)
  testTimeout: 30000,

  // Force exit after tests complete (helps with MongoDB connections)
  forceExit: true,

  // Detect open handles (helps debug connection leaks)
  detectOpenHandles: true,

  // Clear mocks between tests
  clearMocks: true,
};
