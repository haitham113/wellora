const baseConfig = require('../jest.config.cjs');
const withEsm = require('./jest-esm-config.cjs');

/** @type {import('jest').Config} */
module.exports = {
  ...withEsm(baseConfig),
  collectCoverageFrom: undefined,
  rootDir: '..',
  setupFiles: ['<rootDir>/test/setup-environment.cjs'],
  testMatch: ['<rootDir>/test/integration/**/*.integration-spec.ts'],
};
