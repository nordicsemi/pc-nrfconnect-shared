/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { execSync } from 'node:child_process';

export default () => {
    if (process.platform !== 'linux') {
        return true;
    }

    try {
        execSync('dpkg -l nrf-udev');
    } catch {
        return false;
    }

    return true;
};
