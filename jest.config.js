module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  // '/e2e/' keeps Playwright specs (which import @playwright/test) out of the Jest run;
  // they match the generic *.spec glob but belong to Lane B (npm run visual:pixel).
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/__tests__/helpers/', '/__tests__/fixtures/', '/e2e/', 'setupTests.ts'],
  // Never let git worktrees created under .claude/worktrees (e.g. by parallel agent
  // runs) pollute test/module collection with duplicate copies of the suite.
  modulePathIgnorePatterns: ['/.claude/'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setupTests.ts'],
  moduleNameMapper: {
    // Mock CSS imports for Jest
    '\\.css$': '<rootDir>/src/__tests__/helpers/styleMock.js',
    // Path aliases
    '^@context/(.*)$': '<rootDir>/src/context/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@commands/(.*)$': '<rootDir>/src/commands/$1',
    '^@engines/(.*)$': '<rootDir>/src/engines/$1',
    '^@assets/(.*)$': '<rootDir>/src/components/Assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
};
