import { Config } from 'jest';
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
        '^.+\\.ts?$': [
            'ts-jest',
            {
                tsconfig: 'tsconfig.json',
            },
        ],
    },
    testTimeout: 300000,
    notify: true,
    maxWorkers: 1,
} satisfies Config;
