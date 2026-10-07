/*
 * Copyright (c) 2024 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import {
    convertToSemver,
    existingIsOlderThanExpected,
    getJlinkCompatibility,
    hasExpectedVersionFormat,
    strippedVersionName,
} from './jlinkVersion';
import type { Dependency, ModuleVersion } from './moduleVersion';

// Note: In this test the space at the end of 'JLink_V7.96 ' or '7.96 ' is
// intentional because it is also reported like that by nrfutil.

test('strippedVersionName', () => {
    expect(
        strippedVersionName({
            version: '7.94i',
            versionFormat: 'string',
        }),
    ).toBe('7.94i');
    expect(
        strippedVersionName({
            version: '7.96 ',
            versionFormat: 'string',
        }),
    ).toBe('7.96');
    expect(
        strippedVersionName({
            version: '10.00b',
            versionFormat: 'string',
        }),
    ).toBe('10.00b');
});

describe('expectedFormat', () => {
    it('fails if the version format is not string', () => {
        expect(
            hasExpectedVersionFormat(
                {
                    version: 18,
                    versionFormat: 'incremental',
                },
                false,
            ),
        ).toBe(false);

        expect(
            hasExpectedVersionFormat(
                {
                    version: { major: 1, minor: 2, patch: 3 },
                    versionFormat: 'semantic',
                },
                false,
            ),
        ).toBe(false);
    });

    it('fails if the content is unexpected', () => {
        const noJlinkPrefix = {
            version: '7.94i',
            versionFormat: 'string',
        } as const;
        expect(hasExpectedVersionFormat(noJlinkPrefix, false)).toBe(false);

        const wrongCasing = {
            version: 'jlink_v7.96',
            versionFormat: 'string',
        } as const;
        expect(hasExpectedVersionFormat(wrongCasing, false)).toBe(false);

        const unexpectedPostfix = {
            version: 'JLink_V7.96-beta',
            versionFormat: 'string',
        } as const;
        expect(hasExpectedVersionFormat(unexpectedPostfix, false)).toBe(false);
    });

    it('succeeds for expected content', () => {
        expect(
            hasExpectedVersionFormat(
                {
                    version: 'JLink_V7.94i',
                    versionFormat: 'string',
                },
                false,
            ),
        ).toBe(true);
        expect(
            hasExpectedVersionFormat(
                {
                    version: 'JLink_V7.96 ',
                    versionFormat: 'string',
                },
                false,
            ),
        ).toBe(true);
        expect(
            hasExpectedVersionFormat(
                {
                    version: 'JLink_V8.10',
                    versionFormat: 'string',
                },
                false,
            ),
        ).toBe(true);
        expect(
            hasExpectedVersionFormat(
                {
                    version: 'JLink_V10.00 ',
                    versionFormat: 'string',
                },
                false,
            ),
        ).toBe(true);
    });
});

test('convertToSemver', () => {
    expect(
        convertToSemver({ version: 'JLink_V7.94', versionFormat: 'string' }),
    ).toBe('7.94.0');
    expect(
        convertToSemver({ version: 'JLink_V7.96 ', versionFormat: 'string' }),
    ).toBe('7.96.0');
    expect(
        convertToSemver({ version: 'JLink_V7.98a', versionFormat: 'string' }),
    ).toBe('7.98.1');
    expect(
        convertToSemver({ version: 'JLink_V8.10b', versionFormat: 'string' }),
    ).toBe('8.10.2');
    expect(
        convertToSemver({ version: 'JLink_V10.10z', versionFormat: 'string' }),
    ).toBe('10.10.26');
});

describe('existingIsOlderThanExpected', () => {
    const version794i = {
        version: 'JLink_V7.94i',
        versionFormat: 'string',
    } as const;
    const version794k = {
        version: 'JLink_V7.94k',
        versionFormat: 'string',
    } as const;
    const version796 = {
        version: 'JLink_V7.96 ',
        versionFormat: 'string',
    } as const;
    const version1010b = {
        version: 'JLink_V10.10b',
        versionFormat: 'string',
    } as const;

    it('is false if no expected is specified', () => {
        expect(
            existingIsOlderThanExpected({ ...version794i, name: 'JlinkARM' }),
        ).toBe(false);
    });
    it('is false if the actual is equal the expected', () => {
        expect(
            existingIsOlderThanExpected({
                ...version794i,
                name: 'JlinkARM',
                expectedVersion: version794i,
            }),
        ).toBe(false);
    });
    it('is false if the actual is newer than the expected', () => {
        expect(
            existingIsOlderThanExpected({
                ...version794k,
                name: 'JlinkARM',
                expectedVersion: version794i,
            }),
        ).toBe(false);
        expect(
            existingIsOlderThanExpected({
                ...version796,
                name: 'JlinkARM',
                expectedVersion: version794i,
            }),
        ).toBe(false);
        expect(
            existingIsOlderThanExpected({
                ...version1010b,
                name: 'JlinkARM',
                expectedVersion: version794i,
            }),
        ).toBe(false);
    });

    it('is true if the actual is older than the expected', () => {
        expect(
            existingIsOlderThanExpected({
                ...version794i,
                name: 'JlinkARM',
                expectedVersion: version794k,
            }),
        ).toBe(true);
        expect(
            existingIsOlderThanExpected({
                ...version794i,
                name: 'JlinkARM',
                expectedVersion: version796,
            }),
        ).toBe(true);
        expect(
            existingIsOlderThanExpected({
                ...version794i,
                name: 'JlinkARM',
                expectedVersion: version1010b,
            }),
        ).toBe(true);
    });
});

describe('getJlinkCompatibility', () => {
    const createModuleVersion = (
        ...dependencies: Dependency[]
    ): ModuleVersion => ({
        classification: 'nrf-external',
        name: 'nrfutil device',
        version: '2.5.0',
        build_timestamp: '',
        commit_date: '',
        commit_hash: '',
        dependencies: [
            {
                classification: 'nrf-external',
                name: 'nrfdl',
                versionFormat: 'semantic',
                version: {
                    major: 0,
                    minor: 17,
                    patch: 38,
                },
                dependencies,
            },
        ],
        host: '',
    });

    it(`Reports no installed SEGGER J-Link for for module versions reported by nrfutil device before v2.7`, () => {
        expect(getJlinkCompatibility(createModuleVersion())).toEqual({
            kind: 'No SEGGER J-Link installed',
            requiredJlink: '7.94e',
            actualJlink: 'none',
        });
    });

    it(`Reports no installed SEGGER J-Link for for module versions reported by nrfutil device since v2.7`, () => {
        expect(
            getJlinkCompatibility(
                createModuleVersion({
                    name: 'JlinkARM',
                    expectedVersion: {
                        versionFormat: 'string',
                        version: 'JLink_V8.10f',
                    },
                }),
            ),
        ).toEqual({
            kind: 'No SEGGER J-Link installed',
            requiredJlink: '8.10f',
            actualJlink: 'none',
        });
    });

    it(`Reports an outdated SEGGER J-Link version`, () => {
        expect(
            getJlinkCompatibility(
                createModuleVersion({
                    name: 'JlinkARM',
                    version: 'JLink_V7.94e',
                    versionFormat: 'string',
                    expectedVersion: {
                        version: 'JLink_V7.94i',
                        versionFormat: 'string',
                    },
                }),
            ),
        ).toEqual({
            kind: 'Outdated SEGGER J-Link',
            requiredJlink: '7.94i',
            actualJlink: '7.94e',
        });
    });

    it(`Reports a newer SEGGER J-Link version is used`, () => {
        expect(
            getJlinkCompatibility(
                createModuleVersion({
                    name: 'JlinkARM',
                    version: 'JLink_V11.10f',
                    versionFormat: 'string',
                    expectedVersion: {
                        version: 'JLink_V10.94i',
                        versionFormat: 'string',
                    },
                }),
            ),
        ).toEqual({
            kind: 'Newer SEGGER J-Link is used',
            requiredJlink: '10.94i',
            actualJlink: '11.10f',
        });
    });

    it(`Reports the tested SEGGER J-Link version is used`, () => {
        expect(
            getJlinkCompatibility(
                createModuleVersion({
                    name: 'JlinkARM',
                    version: 'JLink_V7.94i',
                    versionFormat: 'string',
                    expectedVersion: {
                        version: 'JLink_V7.94i',
                        versionFormat: 'string',
                    },
                }),
            ),
        ).toEqual({ kind: 'Tested SEGGER J-Link is used' });
    });

    it(`Reports the tested SEGGER J-Link version is used by specifying no expected version`, () => {
        expect(
            getJlinkCompatibility(
                createModuleVersion({
                    name: 'JlinkARM',
                    version: 'JLink_V7.94i',
                    versionFormat: 'string',
                }),
            ),
        ).toEqual({ kind: 'Tested SEGGER J-Link is used' });
    });
});
