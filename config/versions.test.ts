/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import semver from 'semver';

import packageJson from '../package.json';
import {
    minimalLauncherVersion,
    versionsByLauncherVersion,
    versionsForLauncherVersion,
} from './versions';

const lowestSemver = (semvers: string[]) => semvers.toSorted(semver.compare)[0];

describe('minimalLauncherVersion', () => {
    it('should have versions described for it', () => {
        expect(() =>
            versionsForLauncherVersion(minimalLauncherVersion),
        ).not.toThrow();
    });

    it('must be the minimal version described in versionsByLauncherVersion', () => {
        const minimalLauncherVersionInMapping = lowestSemver(
            Object.keys(versionsByLauncherVersion).map(
                range => semver.minVersion(range)!.version,
            ),
        );

        expect(minimalLauncherVersion).toBe(minimalLauncherVersionInMapping);
    });
});

describe('versionsByLauncherVersion', () => {
    const electronVersions = Object.values(versionsByLauncherVersion).map(
        ({ electron }) => electron,
    );

    it('does not have overlapping semver ranges', () => {
        const launcherRanges = Object.keys(versionsByLauncherVersion);

        const overlappingRangePairs = launcherRanges.flatMap((range, index) =>
            launcherRanges
                .slice(index + 1)
                .filter(otherRange => semver.intersects(range, otherRange))
                .map(otherRange => [range, otherRange]),
        );

        expect(overlappingRangePairs).toEqual([]);
    });

    it('has the same electron versions as in the peer dependencies', () => {
        const electronPeerDependencies = packageJson.peerDependencies?.electron
            ?.split('||')
            .map(version => version.trim());

        expect(electronVersions).toEqual(
            expect.arrayContaining(electronPeerDependencies),
        );
        expect(electronPeerDependencies).toEqual(
            expect.arrayContaining(electronVersions),
        );
    });

    it('its lowest electron version matches the dev dependency', () => {
        expect(packageJson.devDependencies.electron).toBe(
            lowestSemver(electronVersions),
        );
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
