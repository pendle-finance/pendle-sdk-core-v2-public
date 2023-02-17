module.exports = {
    parser: '@typescript-eslint/parser',
    extends: ['prettier'],
    env: {
        es6: true,
    },
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
    plugins: ['prettier', 'unused-imports'],
    rules: {
        'prettier/prettier': ['error'],
        'linebreak-style': ['error', 'unix'],
        quotes: ['error', 'single', { avoidEscape: true }],
        semi: ['error', 'always'],
        'spaced-comment': ['error', 'always', { exceptions: ['-', '+'] }],
        'unused-imports/no-unused-imports': 'error',
    },
};
