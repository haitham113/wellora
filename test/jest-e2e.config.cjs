const baseConfig = require('../jest.config.cjs');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  collectCoverageFrom: undefined,
  rootDir: '..',
  setupFiles: ['<rootDir>/test/setup-environment.cjs'],
  testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
};
