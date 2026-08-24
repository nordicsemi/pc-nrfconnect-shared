/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import semver from 'semver';

import { versionsByLauncherVersion } from './versions';

describe('versionsByLauncherVersion', () => {
    it('does not have overlapping semver ranges', () => {
        const ranges = Object.keys(versionsByLauncherVersion);

        const overlappingRangePairs = ranges.flatMap((range, index) =>
            ranges
                .slice(index + 1)
                .filter(otherRange => semver.intersects(range, otherRange))
                .map(otherRange => [range, otherRange]),
        );

        expect(overlappingRangePairs).toEqual([]);
    });
});
