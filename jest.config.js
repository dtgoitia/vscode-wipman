/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    'src/test/suite/.*',  // tests that run the extension - not interested in this at the moment
    'out/.*',  // JS transpiled from TS
  ],
  moduleDirectories: ['node_modules'],
  resetMocks: true,
  resetModules: true,
  verbose: false, // hides passed/skipped tests from summary
};