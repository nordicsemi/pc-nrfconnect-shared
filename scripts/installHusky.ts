#!/usr/bin/env tsx

/*
 * Copyright (c) 2022 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { install as installHusky } from 'husky';
import { existsSync } from 'node:fs';

if (existsSync('.git')) {
    installHusky();
} else {
    console.log(
        `Not installing husky, because ${process.cwd()} is no git repo.`,
    );
}
