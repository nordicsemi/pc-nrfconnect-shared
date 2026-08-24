#!/usr/bin/env tsx
/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import semver from 'semver';

import { parsePackageJsonApp } from '../ipc/schema/packageJson';
import { build } from './esbuild-renderer';

const parse = (packageJson: string) => {
    const result = parsePackageJsonApp(packageJson);

    if (!result.success) {
        console.log(result.error.message);
        process.exit(1);
    }

    return result.data;
};

const bundle = () => {
    const packageJson = fs.readFileSync('package.json', 'utf8');

    const parsedPackageJson = parse(packageJson);

    const minimalRequestedLauncher = semver.minVersion(
        parsedPackageJson.engines.nrfconnect,
    );

    if (minimalRequestedLauncher == null) {
        throw new Error(
            `Unable to determine a minimal requested launcher version from ${parsedPackageJson.engines.nrfconnect}.`,
        );
    }

    build(minimalRequestedLauncher, {
        define: {
            'process.env.PACKAGE_JSON': JSON.stringify(packageJson),
        },
        entryPoints: ['./src/index.tsx'],
        outfile: './dist/bundle.js',
    });
};

const fileInShared = (file: string) =>
    require.resolve(`@nordicsemiconductor/pc-nrfconnect-shared/${file}`);

const fileInDist = (file: string) => path.join('dist', path.basename(file));

const copyFileToDist = (file: string) =>
    fs.copyFileSync(fileInShared(file), fileInDist(file));

const copyFiles = () => {
    fs.mkdirSync('dist', { recursive: true });

    copyFileToDist('dist/scripts/nordic-publish.js');
    copyFileToDist('dist/bootstrap.css');
    copyFileToDist('src/index.html');

    if (process.argv.includes('--include-bootloader')) {
        fs.mkdirSync('fw', { recursive: true });

        fs.copyFileSync(
            fileInShared(
                'fw/bootloader/graviton_bootloader_v1.0.1-[nRF5_SDK_15.0.1-1.alpha_f76d012].zip',
            ),
            './fw/graviton_bootloader_v1.0.1-[nRF5_SDK_15.0.1-1.alpha_f76d012].zip',
        );
    }
};

bundle();
copyFiles();
