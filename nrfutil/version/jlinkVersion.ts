/*
 * Copyright (c) 2024 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import semver from 'semver';

import {
    type Dependency,
    findDependency,
    hasVersion,
    type ModuleVersion,
} from './moduleVersion';
import {
    type DiscriminatedVersion,
    isStringVersion,
    versionToString,
} from './version';

export const strippedVersionName = (version: DiscriminatedVersion) =>
    versionToString(version).trim().replace('JLink_V', '');

export const hasExpectedVersionFormat = (
    dependency: Dependency | DiscriminatedVersion,
    logFailure = true,
): dependency is DiscriminatedVersion => {
    if (!hasVersion(dependency)) return false;

    const jlinkVersionRegex = /^JLink_V\d+\.\d+[a-z]?$/;
    const result =
        isStringVersion(dependency) &&
        versionToString(dependency).trim().match(jlinkVersionRegex) != null;

    if (!result && logFailure) {
        console.error(
            `The SEGGER J-Link version was not reported in the expected format. ` +
                `Format: ${dependency.versionFormat}, ` +
                `version: ${JSON.stringify(dependency)}, `,
        );
    }

    return result;
};

export const convertToSemver = (version: DiscriminatedVersion) => {
    const [, majorMinor, patchLetter] =
        strippedVersionName(version).match(/(\d+\.\d+)(.)?/) ?? [];

    const patch = patchLetter
        ? patchLetter.charCodeAt(0) - 'a'.charCodeAt(0) + 1
        : 0;

    return `${majorMinor}.${patch}`;
};

export const existingIsOlderThanExpected = (
    jlinkVersionDependency: Dependency,
) => {
    if (
        jlinkVersionDependency.expectedVersion == null ||
        !hasExpectedVersionFormat(jlinkVersionDependency) ||
        !hasExpectedVersionFormat(jlinkVersionDependency.expectedVersion)
    )
        return false;

    return semver.lt(
        convertToSemver(jlinkVersionDependency),
        convertToSemver(jlinkVersionDependency.expectedVersion),
    );
};

const nrfutilDeviceToJLink = (nrfutilDeviceVersion: string) => {
    // According to https://docs.nordicsemi.com/bundle/nrfutil/page/guides/installing.html#prerequisites
    if (semver.lt(nrfutilDeviceVersion, '2.0.0')) {
        return '7.80c';
    }

    if (semver.lt(nrfutilDeviceVersion, '2.1.0')) {
        return '7.88j';
    }

    if (semver.lt(nrfutilDeviceVersion, '2.5.4')) {
        return '7.94e';
    }

    return '7.94i';
};

export const getJlinkCompatibility = (moduleVersion: ModuleVersion) => {
    const jlinkVersionDependency = findDependency(
        'JlinkARM',
        moduleVersion.dependencies,
    );

    if (!hasVersion(jlinkVersionDependency)) {
        const requiredVersion =
            jlinkVersionDependency?.expectedVersion != null
                ? strippedVersionName(jlinkVersionDependency.expectedVersion)
                : nrfutilDeviceToJLink(moduleVersion.version);
        return {
            kind: 'No SEGGER J-Link installed',
            requiredJlink: requiredVersion,
            actualJlink: 'none',
        } as const;
    }

    if (
        jlinkVersionDependency.expectedVersion &&
        existingIsOlderThanExpected(jlinkVersionDependency)
    ) {
        const requiredJlink = strippedVersionName(
            jlinkVersionDependency.expectedVersion,
        );
        const actualJlink = strippedVersionName(jlinkVersionDependency);

        return {
            kind: 'Outdated SEGGER J-Link',
            requiredJlink,
            actualJlink,
        } as const;
    }

    if (
        jlinkVersionDependency.expectedVersion == null ||
        jlinkVersionDependency.version ===
            jlinkVersionDependency.expectedVersion.version
    ) {
        return {
            kind: 'Tested SEGGER J-Link is used',
        } as const;
    }

    const requiredJlink = strippedVersionName(
        jlinkVersionDependency.expectedVersion,
    );
    const actualJlink = strippedVersionName(jlinkVersionDependency);

    return {
        kind: 'Newer SEGGER J-Link is used',
        requiredJlink,
        actualJlink,
    } as const;
};
