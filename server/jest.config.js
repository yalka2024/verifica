/**
 * Jest config for the Verifica server test suite.
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  // A regex avoids Jest's Windows glob normalization bug when an ancestor
  // output directory starts with a dot (for example `.tmp-build`).
  testRegex: 'tests[\\\\/].*\\.test\\.js$',
  collectCoverageFrom: [
    'lib/**/*.js',
    'middleware/**/*.js',
    'routes/**/*.js',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: { lines: 50, functions: 50, branches: 35, statements: 50 },
  },
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  testTimeout: 20000,
};

