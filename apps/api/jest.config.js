module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!**/*.module.ts', '!main.ts', '!migrate.ts'],
  coverageDirectory: '../coverage/unit',
  coverageReporters: ['json'],
  testEnvironment: 'node',
};
