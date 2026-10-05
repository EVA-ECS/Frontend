module.exports = {
  preset: 'jest-expo',
  testEnvironment: '<rootDir>/tests/unit/environment.cjs',
  testMatch: ['<rootDir>/tests/unit/**/*.test.[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/tests/unit/setup.ts'],
  collectCoverageFrom: ['src/**/*.{js,jsx,ts,tsx}', '!src/**/*.d.ts'],
  coverageDirectory: 'tests/coverage',
  coverageReporters: ['text', 'html', 'lcov', 'json', 'json-summary'],
  coverageThreshold: { global: { statements: 80, branches: 80, functions: 80, lines: 80 } },
  clearMocks: true,
  testTimeout: 30000,
  moduleNameMapper: { '\\.css$': '<rootDir>/tests/unit/style-mock.cjs', '^@/(.*)$': '<rootDir>/src/$1' },
};
