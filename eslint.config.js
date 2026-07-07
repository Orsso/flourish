export default [{
    ignores: ['node_modules/**', 'dist/**'],
}, {
    files: ['flourish@orsso.github.io/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        globals: {
            console: 'readonly',
            global: 'readonly',
            assertClose: 'readonly',
            assertDeepEqual: 'readonly',
            assertEqual: 'readonly',
            test: 'readonly',
        },
    },
    rules: {
        'array-bracket-spacing': ['error', 'never'],
        'comma-dangle': ['error', 'always-multiline'],
        eqeqeq: ['error', 'always'],
        indent: ['error', 4, {SwitchCase: 1}],
        'no-trailing-spaces': 'error',
        'no-undef': 'error',
        'no-unused-vars': ['error', {
            argsIgnorePattern: '^_',
            caughtErrors: 'none',
            varsIgnorePattern: '^_',
        }],
        'object-curly-spacing': ['error', 'never'],
        quotes: ['error', 'single', {avoidEscape: true}],
        semi: ['error', 'always'],
    },
}];
