/*
 * Copyright (c) 2025 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import semver, { type SemVer } from 'semver';

export const minimalLauncherVersion = '5.2.0';

type VersionsByLauncherVersion = Record<
    string,
    {
        electron: string;
        chrome: string;
        node: string;
    }
>;

export const versionsByLauncherVersion: VersionsByLauncherVersion = {
    '>=5.1.0 <5.4.0': {
        electron: '32.1.2',
        chrome: '128.0.6613',
        node: '20.17.0',
    },

    '>=5.4.0 <5.4.1': {
        electron: '43.4.0',
        chrome: '150.0.7871',
        node: '24.18.1',
    },

    '>=5.4.1': {
        electron: '43.8.6',
        chrome: '150.0.7871',
        node: '24.22.1',
    },
};

export const versionsForLauncherVersion = (
    launcherVersion: string | SemVer,
    versions = versionsByLauncherVersion,
) => {
    const result = Object.entries(versions).find(([range]) =>
        semver.satisfies(launcherVersion, range, { includePrerelease: true }),
    );

    if (result == null) {
        throw new Error(
            `No versions found for launcher version ${launcherVersion}. Please update scripts/versions.ts to include this version.`,
        );
    }

    return result[1];
};
