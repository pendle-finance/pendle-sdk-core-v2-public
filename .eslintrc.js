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
    plugins: ['prettier'],
    rules: {
        'prettier/prettier': ['error'],
        indent: ['error', 4, { SwitchCase: 1 }],
        'linebreak-style': ['error', 'unix'],
        quotes: ['error', 'single', { avoidEscape: true }],
        semi: ['error', 'always'],
        'spaced-comment': ['error', 'always', { exceptions: ['-', '+'] }],
    },
};
