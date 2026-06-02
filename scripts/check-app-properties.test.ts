/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { sameRepoURLs } from './check-app-properties';

describe('sameRepoURLs', () => {
    it('accepts equal URLs', () => {
        expect(
            sameRepoURLs(
                'https://github.com/nordicsemi/pc-nrfconnect-ppk',
                'https://github.com/nordicsemi/pc-nrfconnect-ppk',
            ),
        ).toBe(true);
    });

    it('rejects different URLs', () => {
        expect(
            sameRepoURLs(
                'https://github.com/nordicsemi/pc-nrfconnect-ppk',
                'https://github.com/nordicsemi/pc-nrfconnect-shared',
            ),
        ).toBe(false);
    });

    it('ignores a .git postfix on either URL', () => {
        expect(
            sameRepoURLs(
                'https://github.com/nordicsemi/pc-nrfconnect-ppk.git',
                'https://github.com/nordicsemi/pc-nrfconnect-ppk',
            ),
        ).toBe(true);
        expect(
            sameRepoURLs(
                'https://github.com/nordicsemi/pc-nrfconnect-ppk',
                'https://github.com/nordicsemi/pc-nrfconnect-ppk.git',
            ),
        ).toBe(true);
    });

    it('treats the protocol https and git as the same', () => {
        expect(
            sameRepoURLs(
                'https://github.com/nordicsemi/pc-nrfconnect-ppk',
                'git@github.com:nordicsemi/pc-nrfconnect-ppk.git',
            ),
        ).toBe(true);
    });

    it('ignores the host name for the git protocol', () => {
        expect(
            sameRepoURLs(
                'https://github.com/nordicsemi/pc-nrfconnect-ppk',
                'git@nordic-git:nordicsemi/pc-nrfconnect-ppk.git',
            ),
        ).toBe(true);
    });
});
