#!/usr/bin/env tsx

/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { green, red } from 'chalk';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import semver from 'semver';

import {
    minimalLauncherVersion,
    versionsForLauncherVersion,
} from '../config/versions';
import { type PackageJsonApp } from '../ipc/schema/packageJson';

const packageJson: PackageJsonApp = JSON.parse(
    readFileSync('./package.json', 'utf-8'),
);

const info = (message: string) => console.log(`${green('➜')} ${message}`);

function fail(message: string): never {
    console.error(`${red('x')} ${message}`);
    process.exit(1);
}

const npm = (args: string, { showOutput = false } = {}) =>
    execSync(`npm ${args}`, {
        encoding: 'utf-8',
        stdio: ['ignore', showOutput ? 'inherit' : 'pipe', 'inherit'],
    });

const assertCurrentLauncherVersionIsValid = () => {
    const currentLauncherVersion = packageJson.engines?.nrfconnect;

    if (currentLauncherVersion == null) {
        fail(
            'The property `engines.nrfconnect` must already be defined in package.json.',
        );
    }

    if (semver.minVersion(currentLauncherVersion)?.version == null) {
        fail(
            `Unable to determine a launcher version from \`engines.nrfconnect\` being '${currentLauncherVersion}'.`,
        );
    }
};

const currentLauncherVersion = () => {
    assertCurrentLauncherVersionIsValid();

    // Type assertion in the next line is safe because we have already validated it above.
    return semver.minVersion(packageJson.engines.nrfconnect)?.version as string;
};

const newLauncherVersion = () =>
    semver.valid(requestedLauncherVersion) ?? currentLauncherVersion();

const maybePrintUsageAndExit = () => {
    if (
        requestedLauncherVersion == null ||
        semver.valid(requestedLauncherVersion)
    ) {
        return;
    }

    console.log(`Usage: set-minimal-launcher [version]

Sets the minimal launcher version the app requires and installs the matching
Electron version as a dev dependency.

Arguments:
  version      Minimal launcher version, e.g. 5.2.1. Sets \`engines.nrfconnect\`
               in package.json to \`>=<version>\`. If omitted, the version
               already in \`engines.nrfconnect\` is used.

Options:
  -h, --help   Print this help message.`);

    const askedForHelp =
        process.argv.includes('-h') || process.argv.includes('--help');
    process.exit(askedForHelp ? 0 : 1);
};

const setLauncherInPackageJson = () => {
    if (semver.lt(newLauncherVersion(), minimalLauncherVersion)) {
        fail(
            `This version of shared requires at least launcher version ${minimalLauncherVersion} but the launcher version ${newLauncherVersion()} was requested.`,
        );
    }

    if (requestedLauncherVersion == null) {
        info(
            `Using launcher version ${currentLauncherVersion()} from \`engines.nrfconnect\` in package.json.`,
        );
    } else if (currentLauncherVersion() === newLauncherVersion()) {
        info(
            `\`engines.nrfconnect\` in package.json is already '${newLauncherVersion()}'.`,
        );
    } else {
        npm(`pkg set engines.nrfconnect=">=${newLauncherVersion()}"`);
        info(
            `Changed \`engines.nrfconnect\` in package.json from '${currentLauncherVersion()}' to '${newLauncherVersion()}'.`,
        );
    }
};

const currentElectronVersion = () => packageJson.devDependencies?.electron;

const newElectronVersion = () => {
    try {
        return versionsForLauncherVersion(newLauncherVersion()).electron;
    } catch {
        fail(
            `Unable to determine Electron version for launcher version '${newLauncherVersion()}'.`,
        );
    }
};

const installElectron = () => {
    if (currentElectronVersion() === newElectronVersion()) {
        info(
            `Electron ${newElectronVersion()} is already installed as a dev dependency.`,
        );
        return;
    }

    info(
        `Installing Electron ${newElectronVersion()} as a dev dependency (before: ${currentElectronVersion() ?? 'none'}).`,
    );
    npm(`install --save-dev --save-exact electron@${newElectronVersion()}`, {
        showOutput: true,
    });
};

const main = () => {
    maybePrintUsageAndExit();

    assertCurrentLauncherVersionIsValid();

    setLauncherInPackageJson();
    installElectron();
};

const requestedLauncherVersion: string | undefined = process.argv[2];
const isRanAsAScript = require.main === module; // https://nodejs.org/docs/latest/api/modules.html#accessing-the-main-module
if (isRanAsAScript) {
    main();
}
