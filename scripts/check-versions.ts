#!/usr/bin/env tsx

/*
 * Copyright (c) 2025 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { versionsByLauncherVersion } from './versions';

const fail = (message: string) => {
    console.error(message);
    process.exit(1);
};

type ElectronReleases = { version: string; chrome: string; node: string }[];

const find = (electronReleases: ElectronReleases, version: string) =>
    electronReleases.find(release => release.version === version) ??
    fail(
        `Found no info on Electron release ${version} in the list of all Electron releases at https://releases.electronjs.org/releases.json.`,
    );

const checkVersionsByLauncherEntry =
    (electronReleases: ElectronReleases) =>
    ([launcherVersionRange, expectedVersions]: [
        string,
        { electron: string; chrome: string; node: string },
    ]): void => {
        const electronRelease = find(
            electronReleases,
            expectedVersions.electron,
        );

        if (
            electronRelease.node !== expectedVersions.node ||
            !electronRelease.chrome.startsWith(expectedVersions.chrome)
        ) {
            const chromeWithoutBuild = electronRelease.chrome
                .split('.')
                .slice(0, 3)
                .join('.');

            fail(
                `Version mismatch! For the launcher version range ${launcherVersionRange}, the scripts/versions.ts contains the following entry:

    '${launcherVersionRange}': {
        electron: '${expectedVersions.electron}',
        chrome: '${expectedVersions.chrome}',
        node: '${expectedVersions.node}',
    },

but according to the electron release it should be:

    '${launcherVersionRange}': {
        electron: '${electronRelease.version}',
        chrome: '${chromeWithoutBuild}',
        node: '${electronRelease.node}',
    },
`,
            );
        }
    };

const main = async () => {
    const electronReleases = await (
        await fetch('https://releases.electronjs.org/releases.json')
    ).json();
    Object.entries(versionsByLauncherVersion).forEach(
        checkVersionsByLauncherEntry(electronReleases),
    );
};

main();
