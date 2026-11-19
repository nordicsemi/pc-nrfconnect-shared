#!/usr/bin/env tsx

/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { build } from 'esbuild';
import { execSync } from 'node:child_process';

import { minimalLauncherVersion } from '../config/versions';
import { build as esbuildRenderer } from './esbuild-renderer';

const main = async () => {
    console.log('Generate types');
    execSync(
        'tsc --emitDeclarationOnly --declaration --declarationMap --outDir ./dist/typings --rootDir .',
        { encoding: 'utf-8', stdio: 'inherit' },
    );

    console.log('Build bootstrap.css');
    await esbuildRenderer(minimalLauncherVersion, {
        logLevel: 'warning',
        entryPoints: ['./src/bootstrap.scss'],
        outfile: 'dist/bootstrap.css',
        sourcemap: false,
    });

    console.log('Build nordic-publish.js');
    await build({
        entryPoints: ['scripts/nordic-publish.ts'],
        outdir: 'dist/scripts/',
        bundle: true,
        platform: 'node',
        logLevel: 'warning',
        minify: true,
    });
};

main().catch(() => {
    process.exit(1);
});
