/**
 * Prisma 7 loads its query compiler as ESM. Integration and e2e tests therefore
 * preserve ESM output instead of using the CommonJS transform used by fast unit tests.
 *
 * @param {import('jest').Config} baseConfig
 * @returns {import('jest').Config}
 */
module.exports = function withEsm(baseConfig) {
  const [, swcOptions] = baseConfig.transform['^.+\\.ts$'];

  return {
    ...baseConfig,
    extensionsToTreatAsEsm: ['.ts'],
    transform: {
      '^.+\\.ts$': [
        '@swc/jest',
        {
          ...swcOptions,
          module: { type: 'es6' },
        },
      ],
    },
  };
};
