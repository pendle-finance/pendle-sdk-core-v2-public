/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */
export default {
    coveragePathIgnorePatterns: ['dist/', '/node_modules/', 'test/'],
    coverageProvider: 'v8',
    moduleDirectories: ['node_modules'],
    moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node'],
    roots: ['test/'],
    testEnvironment: 'node',
    testMatch: ['**/__test__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[tj]s?(x)'],
    testPathIgnorePatterns: ['node_modules/'],
    transform: {
        '^.+\\.ts?$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
        }],
    },
    testTimeout: 100000,
};
