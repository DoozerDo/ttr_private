/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],

  // Calibration suite lives in /test/cx-fit and uses *.test.ts
  // Some calibration specs may also live in /src and use *.spec.ts
  testMatch: [
    '<rootDir>/test/cx-fit/**/*.test.ts',
    '<rootDir>/src/**/?(*.)calibration*.spec.ts',
    '<rootDir>/src/**/?(*.)calibration*.test.ts',
  ],

  // Tripwire: do not allow "green with zero tests"
  passWithNoTests: false,

  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },

  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },

  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
};
