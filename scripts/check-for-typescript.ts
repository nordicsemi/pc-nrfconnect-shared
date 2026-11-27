#!/usr/bin/env tsx

/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import klaw from 'klaw';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const launchNextCommand = () => {
    const [, , command, ...args] = process.argv;

    process.exit(
        spawnSync(command, args, {
            shell: true,
            stdio: 'inherit',
        }).status ?? undefined,
    );
};

const assertNoTypeScriptFilesExist = () => {
    const excludeNodeModules = (path: string) => !path.endsWith('node_modules');

    klaw('.', { filter: excludeNodeModules }).on('data', ({ path }) => {
        if (path.endsWith('.ts') || path.endsWith('.tsx')) {
            console.log(
                "Your project contains TypeScript files (with the file ending .ts or .tsx), so it also must contain a file 'tsconfig.json'.\n",
            );
            process.exit(1);
        }
    });
};

if (existsSync('tsconfig.json')) {
    launchNextCommand();
} else {
    assertNoTypeScriptFilesExist();
}
