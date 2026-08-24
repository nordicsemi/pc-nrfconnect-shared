/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import semver from 'semver';

import {
    minimalLauncherVersion,
    versionsByLauncherVersion,
    versionsForLauncherVersion,
} from './versions';

describe('minimalLauncherVersion', () => {
    it('should have versions described for it', () => {
        expect(() =>
            versionsForLauncherVersion(minimalLauncherVersion),
        ).not.toThrow();
    });
});

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

describe('versionsForLauncherVersion', () => {
    const exampleVersionsByLauncher = {
        '>=5.1.0 <=5.3.99': {
            electron: '32',
            chrome: '',
            node: '',
        },

        '>5.3.99': {
            electron: '43',
            chrome: '',
            node: '',
        },
    };

    it('returns the versions for a version within the Range', () => {
        expect(
            versionsForLauncherVersion('5.3.0', exampleVersionsByLauncher)
                .electron,
        ).toEqual('32');

        expect(
            versionsForLauncherVersion(
                semver.parse('5.3.0')!,
                exampleVersionsByLauncher,
            ).electron,
        ).toEqual('32');
    });

    it('returns the right versions for pre-releases', () => {
        expect(
            versionsForLauncherVersion('5.4.0-pre1', exampleVersionsByLauncher)
                .electron,
        ).toEqual('43');
    });

    it('throws when no matching launcher range exists', () => {
        expect(() =>
            versionsForLauncherVersion('5.0.9', exampleVersionsByLauncher),
        ).toThrow();
    });
});
