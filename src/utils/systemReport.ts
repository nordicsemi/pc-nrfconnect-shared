/*
 * Copyright (c) 2023 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import fs from 'node:fs';
import { EOL } from 'node:os';
import path from 'node:path';
import pretty from 'prettysize';
import si from 'systeminformation';

import { getAllModuleVersions } from '../../nrfutil';
import {
    describeVersion,
    findDependency,
} from '../../nrfutil/version/moduleVersion';
import { deviceInfo as getDeviceInfo } from '../Device/deviceInfo/deviceInfo';
import { type Device } from '../Device/deviceSlice';
import logger from '../logging';
import appDetails from './appDetails';
import { getAppDataDir } from './appDirs';
import { openFile } from './open';

const generalInfoReport = async () => {
    const [
        { manufacturer, model },
        { vendor, version },
        { platform, distro, release, arch },
        { kernel, git, node, python, python3 },
        {
            manufacturer: cpuManufacturer,
            brand,
            speed,
            cores,
            physicalCores,
            processors,
        },
        { total, free },
        fsSize,
    ] = await Promise.all([
        si.system(),
        si.bios(),
        si.osInfo(),
        si.versions(),
        si.cpu(),
        si.mem(),
        si.fsSize(),
    ]);

    const result = [
        `- System:     ${manufacturer} ${model}`,
        `- BIOS:       ${vendor} ${version}`,
        `- CPU:        ${processors} x ${cpuManufacturer} ${brand} ${speed} GHz` +
            ` ${cores} cores (${physicalCores} physical)`,
        `- Memory:     ${pretty(free)} free of ${pretty(total)} total`,
        `- Filesystem: ${fsSize[0].fs} (${fsSize[0].type})` +
            ` ${pretty(Number(fsSize[0].size) || 0)}` +
            ` ${fsSize[0].use.toFixed(1)}% used`,
        '',
        `- OS:         ${distro} (${release}) ${platform} ${arch}`,
        '',
        '- Versions',
        `    - kernel: ${kernel}`,
        `    - git: ${git}`,
        `    - node: ${node}`,
        `    - python: ${python}`,
        `    - python3: ${python3}`,
    ];

    const moduleVersions = await getAllModuleVersions();

    moduleVersions.forEach(moduleVersion => {
        result.push(
            `    - nrfutil ${moduleVersion.name}: ${moduleVersion.version}`,
        );
        if (moduleVersion.name === 'device') {
            const dependencies = moduleVersion.dependencies;
            result.push(
                ...[
                    `    - nrf-probe: ${describeVersion(
                        findDependency('nrf-probe', dependencies),
                    )}`,
                    `    - SEGGER J-Link: ${describeVersion(
                        findDependency('JlinkARM', dependencies),
                    )}`,
                    '',
                ],
            );
        }
    });

    return result;
};

const allDevicesReport = (allDevices: Device[] = []) => [
    '- Connected devices:',
    ...allDevices.map(
        d =>
            `    - ${d.serialNumber} ${
                d.devkit?.boardVersion || ''
            }: ${d.serialPorts?.map(s => s.comName).join(', ')}`,
    ),
    '',
];

const currentDeviceReport = (device?: Device, currentSerialNumber?: string) => {
    if (device == null) {
        return [];
    }

    const deviceInfo = getDeviceInfo(device);

    return [
        '- Current device:',
        `    - name:          ${deviceInfo.name}`,
        `    - serialNumber:  ${currentSerialNumber}`,
        `    - cores:         ${deviceInfo.cores ?? 'Unknown'}`,
        `    - website:       ${deviceInfo.website.productPage ?? 'Unknown'}`,
        '',
    ];
};

const appInfoReport = () =>
    appDetails()
        .then(app => [
            `- App: ${app.displayName}`,
            `- Version: ${app.currentVersion}`,
            `- Source: ${app.source}`,
            `- Core version: ${app.coreVersion}`,
            `- Engine version: ${app.engineVersion}`,
        ])
        .catch(() => []);

export const generateSystemReport = async (
    timestamp: string,
    allDevices?: Device[],
    currentDevice?: Device,
    currentSerialNumber?: string,
) =>
    [
        `# nRFConnect System Report - ${timestamp}`,
        '',
        ...(await appInfoReport()),
        ...(await generalInfoReport()),
        ...allDevicesReport(allDevices),
        ...currentDeviceReport(currentDevice, currentSerialNumber),
    ].join(EOL);

export default async (
    allDevices: Device[],
    currentSerialNumber: string,
    currentDevice?: Device,
) => {
    logger.info('Generating system report...');
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const report = await generateSystemReport(
        timestamp,
        allDevices,
        currentDevice,
        currentSerialNumber,
    );

    const fileName = `nrfconnect-system-report-${timestamp}.txt`;
    const filePath = path.resolve(getAppDataDir(), fileName);

    try {
        fs.writeFileSync(filePath, report);
        logger.info(`System report: ${filePath}`);
        await openFile(filePath);
    } catch (error) {
        logger.logError('Failed to generate system report', error);
    }
};
