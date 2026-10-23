/*
 * ESLint configuration (flat config)
 *
 * It keeps the rules of the former eslint-config-tamia based configuration, except the ones about formatting, which is
 *  checked by Prettier through eslint-plugin-prettier.
 */

const js = require('@eslint/js');
const globals = require('globals');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = [
    {
        ignores: ['**/*{.,-}min.js', 'coverage/', 'temp/']
    },
    js.configs.recommended,
    eslintPluginPrettierRecommended,
    {
        files: ['**/*.js', 'bin/sth*'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node
            }
        },
        rules: {
            'array-callback-return': 'error',
            'block-scoped-var': 'error',
            camelcase: ['error', { properties: 'never' }],
            'consistent-return': 'error',
            curly: ['error', 'all'],
            'dot-notation': 'error',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'new-cap': ['error', { newIsCap: true, capIsNew: false, properties: true }],
            'no-alert': 'error',
            'no-array-constructor': 'error',
            'no-await-in-loop': 'error',
            'no-caller': 'error',
            'no-console': 'error',
            'no-duplicate-imports': 'error',
            'no-else-return': 'error',
            'no-eval': 'error',
            'no-extend-native': 'error',
            'no-extra-bind': 'error',
            'no-implicit-coercion': ['error', { boolean: false, number: true, string: true }],
            'no-implied-eval': 'error',
            'no-inner-declarations': 'error',
            'no-iterator': 'error',
            'no-labels': ['error', { allowLoop: true, allowSwitch: true }],
            'no-lone-blocks': 'error',
            'no-lonely-if': 'error',
            'no-loop-func': 'error',
            'no-multi-assign': 'error',
            'no-multi-str': 'error',
            'no-new-func': 'error',
            'no-new-wrappers': 'error',
            'no-object-constructor': 'error',
            'no-octal-escape': 'error',
            'no-path-concat': 'error',
            'no-proto': 'error',
            'no-return-assign': 'error',
            'no-script-url': 'error',
            'no-self-compare': 'error',
            'no-sequences': 'error',
            'no-throw-literal': 'error',
            'no-undef-init': 'error',
            'no-unmodified-loop-condition': 'error',
            'no-unneeded-ternary': 'error',
            'no-unused-expressions': 'error',
            'no-unused-vars': ['error', { caughtErrors: 'none' }],
            'no-useless-call': 'error',
            'no-useless-computed-key': 'error',
            'no-useless-concat': 'error',
            'no-useless-constructor': 'error',
            'no-useless-rename': 'error',
            'no-useless-return': 'error',
            'no-var': 'error',
            'no-void': 'error',
            'object-shorthand': ['error', 'always'],
            'one-var': ['error', 'never'],
            'prefer-const': 'error',
            'prefer-rest-params': 'error',
            'prefer-spread': 'error',
            'require-await': 'error',
            strict: ['error', 'never'],
            yoda: ['error', 'never', { exceptRange: true }]
        }
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.mocha
            }
        }
    }
];
