/*
 * Copyright (c) 2022 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

const fs = require('node:fs');

const entriesInGitignore = fs
    .readFileSync('.gitignore', 'utf8')
    .split('\n')
    .filter(Boolean);

module.exports = {
    reportUnusedDisableDirectives: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        projectService: {
            allowDefaultProject: ['Changelog.md.ts*'],
        },
    },
    extends: [
        'eslint:recommended',
        'airbnb',
        'plugin:@typescript-eslint/strict',
        'plugin:import/recommended',
        'plugin:import/typescript',
        'plugin:jsonc/recommended-with-jsonc',
        'prettier',
    ],
    ignorePatterns: [
        'doc/docs/',
        'package-lock.json',
        'dist/',
        ...entriesInGitignore,
    ],
    rules: {
        'prefer-destructuring': 'off',
        '@typescript-eslint/ban-ts-comment': [
            'error',
            { 'ts-expect-error': 'allow-with-description' },
        ],
        '@typescript-eslint/no-shadow': 'error',
        '@typescript-eslint/consistent-type-imports': [
            'error',
            { fixStyle: 'inline-type-imports' },
        ],
        'import/default': 'error',
        'import/enforce-node-protocol-usage': ['error', 'always'],
        'import/extensions': 'off',
        'import/named': 'error',
        'import/no-extraneous-dependencies': 'off',
        'import/no-unresolved': [
            'error',
            {
                ignore: [
                    'serialport',
                    'electron',
                    'pc-nrfconnect-shared',
                    '@nordicsemiconductor/pc-nrfconnect-shared',
                    '@electron/remote',
                ],
            },
        ],
        'import/prefer-default-export': 'off',
        'jsx-a11y/control-has-associated-label': 'off',
        'linebreak-style': 'off',
        'lines-between-class-members': 'off',
        'md/remark': [
            'error',
            {
                plugins: [
                    'preset-lint-markdown-style-guide',
                    'frontmatter',
                    ['lint-emphasis-marker', false],
                    ['lint-list-item-content-indent', false],
                    ['lint-list-item-indent', false],
                    ['lint-list-item-spacing', false],
                    ['lint-no-duplicate-headings', false],
                    ['lint-no-literal-urls', false],
                ],
            },
        ],
        'no-console': 'off',
        'no-param-reassign': 'off',
        'no-restricted-imports': [
            'error',
            {
                name: 'process',
                message:
                    'Do not import process, it is available as a global `process` and importing it may cause issues with replacing NODE_ENV.',
            },
            {
                name: 'node:process',
                message:
                    'Do not import node:process, it is available as a global `process` and importing it may cause issues with replacing NODE_ENV.',
            },
        ],
        'no-shadow': 'off',
        'no-undef': 'error',
        'no-unused-expressions': 'off',
        'no-use-before-define': 'off',
        'prettier/prettier': 'error',
        'react-hooks/exhaustive-deps': 'error',
        'react-hooks/rules-of-hooks': 'error',
        'react/function-component-definition': [
            'error',
            {
                namedComponents: 'arrow-function',
                unnamedComponents: 'arrow-function',
            },
        ],
        'react/jsx-filename-extension': [
            'error',
            { extensions: ['.jsx', '.tsx'] },
        ],
        'react/jsx-key': ['error', { checkFragmentShorthand: true }],
        'react/jsx-no-useless-fragment': ['error', { allowExpression: true }],
        'react/jsx-one-expression-per-line': 'off',
        'react/jsx-props-no-spreading': 'off',
        'react/require-default-props': 'off',
        'require-await': 'error',
        'simple-import-sort/imports': [
            'error',
            {
                /* This configures the order of the imports.
                   The obscure format using regexps is described at
                   https://github.com/lydell/eslint-plugin-simple-import-sort#custom-grouping
                   and there are examples at
                   https://github.com/lydell/eslint-plugin-simple-import-sort/blob/main/examples/.eslintrc.js
                */
                groups: [
                    // First all side effect imports. That strange token is
                    // described in the eslint-plugin-simple-import-sort docs
                    ['^\\u0000'],

                    // All package imports (starting with a letter, optionally
                    // prepended by an '@'), with React packages coming first.
                    ['^react', '^@?\\w'],

                    // All relative imports (starting with a '.')
                    ['^\\.'],

                    // All styles imports (ending with '.css' or '.scss')
                    ['^.+\\.s?css$'],
                ],
            },
        ],
        'valid-jsdoc': ['error', { prefer: { return: 'returns' } }],
        'no-empty-function': [
            'error',
            { allow: ['arrowFunctions', 'constructors'] },
        ],
        'no-return-await': 'off',
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                args: 'all',
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            },
        ],
    },
    overrides: [
        {
            files: ['*.d.ts'],
            rules: {
                'max-classes-per-file': 'off',
                'react/prefer-stateless-function': 'off',
                '@typescript-eslint/no-explicit-any': 'off',
            },
        },
        {
            files: ['*.ts', '*.tsx'],
            rules: {
                'default-case': 'off',
                'consistent-return': 'off',
                'react/prop-types': 'off',
            },
        },
        {
            files: ['*.md'],
            parser: 'markdown-eslint-parser',
            rules: {
                'prettier/prettier': ['error', { parser: 'markdown' }],
                '@typescript-eslint/consistent-type-imports': 'off',
            },
        },
        {
            files: ['*.test.*'],
            rules: {
                '@typescript-eslint/no-non-null-assertion': 'off',
            },
        },
        {
            files: ['*.json'],
            parser: 'jsonc-eslint-parser',
            rules: {
                'no-template-curly-in-string': 'off',
                '@typescript-eslint/consistent-type-imports': 'off',
            },
        },
        {
            files: ['*.js'],
            rules: {
                '@typescript-eslint/no-require-imports': 'off',
            },
            extends: ['plugin:@typescript-eslint/disable-type-checked'],
        },
        {
            files: [
                '**/__tests__/**/*.[jt]s?(x)',
                '**/?(*.)+(spec|test).[jt]s?(x)',
            ],
            extends: ['plugin:testing-library/react'],
        },
    ],
    plugins: [
        'react',
        'import',
        'react-hooks',
        'prettier',
        'simple-import-sort',
        'md',
    ],
    env: {
        es2021: true,
        browser: true,
        node: true,
        jasmine: true,
        jest: true,
    },
    globals: {
        NodeJS: true,
        React: true,
    },
};
