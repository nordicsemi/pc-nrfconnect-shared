/*
 * Copyright (c) 2022 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

const path = require('path');

const mockDir = path.join(__dirname, '..', 'mocks');

module.exports = (disabledMocks = []) => ({
    testEnvironment: 'jsdom',
    moduleNameMapper: {
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2)$': `${mockDir}/fileMock.ts`,
        '\\.(css|scss)$': `${mockDir}/emptyMock.ts`,
        applicationinsights: `${mockDir}/emptyMock.ts`,
        '^electron$': `${mockDir}/electronMock.ts`,
        '^electron-store$': `${mockDir}/electronStoreMock.ts`,
        '@electron/remote': `${mockDir}/remoteMock.ts`,
        '^react-markdown$': `${mockDir}/reactMarkdownMock.tsx`,
        ...(disabledMocks.includes('packageJson')
            ? {}
            : {
                  packageJson$: `${mockDir}/packageJsonMock.ts`,
              }),
        ...(disabledMocks.includes('serialport')
            ? {}
            : { serialport: `${mockDir}/emptyMock.ts` }),
    },
    transform: {
        '^.+\\.[jt]sx?$': '@swc/jest',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(@nordicsemiconductor/pc-nrfconnect-shared|react-resize-detector|rehype-external-links|hast-util-is-element|is-absolute-url|space-separated-tokens|unist-util-visit|unist-util-visit-parents|unist-util-is)/)',
    ],
    setupFilesAfterEnv: [`${__dirname}/../test/setupTests.ts`],
    resolver: `${__dirname}/../test/jestResolver.js`,
    modulePathIgnorePatterns: ['dist'],
});
