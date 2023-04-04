module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    extends: ['prettier'],
    env: {
        es2022: true,
    },
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.json'],
    },
    plugins: ['prettier', 'unused-imports'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
    ],
    rules: {
        'prettier/prettier': ['error'],
        'linebreak-style': ['error', 'unix'],
        quotes: ['error', 'single', { avoidEscape: true }],
        semi: ['error', 'always'],
        'spaced-comment': ['error', 'always', { exceptions: ['-', '+'] }],
        'unused-imports/no-unused-imports': 'error',
        
        "no-empty-function": "off",
        "@typescript-eslint/no-empty-function": "off",
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-unsafe-argument": "warn",
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-call": "warn",
        "@typescript-eslint/no-unsafe-member-access": "warn",
        "@typescript-eslint/no-unsafe-return": "warn",
        
        // There are cases we want an async function to have sync body, as we
        // still want the result to be a Promise.
        // This rule forse it to be written as `return Promise.resolve(...)`.
        // TypeScript type system is strong enough so there will not be
        // an useless `async` mark on the function.
        "@typescript-eslint/require-await": "off",
        
        "prefer-const": ["error", {"destructuring": "all"}],
    },
};
