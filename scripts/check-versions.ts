#!/usr/bin/env tsx

/*
 * Copyright (c) 2025 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { execSync } from 'node:child_process';

import * as versions from './versions';

const runNpmLsElectron = () => {
    try {
        return execSync('npm ls electron --json', { encoding: 'utf8' });
    } catch {
        console.error(
            '\nFailed to get the currently used version of electron. Maybe running `npm ci` is needed.',
        );
        process.exit(1);
    }
};

const main = async () => {
    const npmLsElectronResult = runNpmLsElectron();
    const installedElectronVersion =
        JSON.parse(npmLsElectronResult).dependencies.electron.version;

    const electronReleases = await (
        await fetch('https://releases.electronjs.org/releases.json')
    ).json();
    const currentElectronRelease = electronReleases.find(
        (release: { version: string }) =>
            release.version === installedElectronVersion,
    );

    if (
        currentElectronRelease.version !== versions.electron ||
        currentElectronRelease.chrome !== versions.chrome ||
        currentElectronRelease.node !== versions.node
    ) {
        console.error(
            `Version mismatch! scripts/versions.ts contains the following versions:

- electron: ${versions.electron}
- chrome: ${versions.chrome}
- node: ${versions.node}

but it should contain these:

- electron: ${currentElectronRelease.version}
- chrome: ${currentElectronRelease.chrome}
- node: ${currentElectronRelease.node}
`,
        );
        process.exit(1);
    }
};

main();
