module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleNameMapper: {
    '^@accesscore/contracts$': '<rootDir>/../../contracts/src/index.ts',
  },
  setupFiles: ['reflect-metadata'],
  testEnvironment: 'node',
};
