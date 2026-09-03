#!/usr/bin/env tsx

/*
 * Copyright (c) 2025 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import semver from 'semver';

import packageJson from '../package.json';
import { versionsByLauncherVersion } from './versions';

const fail = (message: string) => {
    console.error(message);
    process.exit(1);
};

const configuredVersions = Object.values(versionsByLauncherVersion).map(
    ({ electron }) => electron,
);

const checkElectronPeerDependencies = () => {
    const peerDependencyVersions = packageJson.peerDependencies.electron
        .split('||')
        .map(version => version.trim());
    const missingVersions = peerDependencyVersions.filter(
        version => !configuredVersions.includes(version),
    );

    if (missingVersions.length > 0) {
        fail(
            `In 'package.json' there are peer dependencies for Electron version(s) ${missingVersions.join(', ')} but no matching entries in 'scripts/versions.ts'.`,
        );
    }

    const superfluousVersions = configuredVersions.filter(
        version => !peerDependencyVersions.includes(version),
    );

    if (superfluousVersions.length > 0) {
        fail(
            `In 'scripts/versions.ts' there are entries for Electron version(s) ${superfluousVersions.join(', ')} but no corresponding peer dependencies in 'package.json'.`,
        );
    }
};

const checkElectronDevDependency = () => {
    const lowestConfiguredVersion = configuredVersions.reduce(
        (lowestVersion, version) =>
            semver.lt(version, lowestVersion) ? version : lowestVersion,
    );

    if (packageJson.devDependencies.electron !== lowestConfiguredVersion) {
        fail(
            `The Electron development dependency in 'package.json' must be the lowest version in 'scripts/versions.ts' (${lowestConfiguredVersion}), but is ${packageJson.devDependencies.electron}.`,
        );
    }
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
                `Version mismatch! For the launcher version range ${launcherVersionRange}, 'scripts/versions.ts' contains the following entry:

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
    checkElectronPeerDependencies();
    checkElectronDevDependency();

    const electronReleases = await (
        await fetch('https://releases.electronjs.org/releases.json')
    ).json();
    Object.entries(versionsByLauncherVersion).forEach(
        checkVersionsByLauncherEntry(electronReleases),
    );
};

main();
