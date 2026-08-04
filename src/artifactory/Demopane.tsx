/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */
import React from 'react';
import { join } from 'path';

import { getAppDataDir } from '../utils/appDirs';
import { ApplicationClient } from './ApplicationClient';
import {
    type AQueryProps,
    type AResponse,
    ArtifactoryClient,
} from './ArtifactoryClient';
import { type Firmware } from './FirmwareClient';

const NordicURL = 'files.nordicsemi.com';
const demoPath = join(getAppDataDir(), 'demo');

type type = 'Modem' | 'Application' | 'Network' | undefined;

const ArtClient = new ArtifactoryClient(
    NordicURL,
    'swtools',
    join(demoPath, 'downloads'),
);
const AppClient = new ApplicationClient({ dataDirectory: demoPath });

export const Demopane: React.FC = () => {
    const [name, setName] = React.useState('');
    const [device, setDevice] = React.useState('');
    const [type, setType] = React.useState('');

    const handleArtifactDemo = async (props: AQueryProps) => {
        const res: AResponse = await ArtClient.searchArtifactory(props);

        ArtClient.downloadArtifactFromPath(res[0].path);
    };

    const handleFirmwareDemo = async (fw: Firmware, intype: string) => {
        const outtype: type = intype as type;
        await AppClient.getFirmware({ ...fw, type: outtype });
    };

    const handleApplicationDemo = async (fw: Firmware) => {
        await AppClient.getIndexedFirmwareWithDeps(fw);
    };

    const devices: string[] = [
        '',
        'nRF9151DK',
        'nRF9160DK',
        'nRF9161DK',
        'nRF52833DK',
        'nRF52840DK',
    ];

    const names: string[] = [
        '',
        'hello_world',
        'lbs',
        'peripheral_uart',
        'power_profiling',
        'asset_tracker',
        'modemfirmware',
    ];

    const types: type[] = [undefined, 'Application', 'Modem', 'Network'];

    return (
        <>
            <select
                className="m-10 tw-min-w-20"
                value={name}
                onChange={e => setName(e.target.value)}
            >
                {names.map(n => (
                    <option key={n} value={n.toLowerCase()}>
                        {n}
                    </option>
                ))}
            </select>

            <select
                className="m-10 tw-min-w-20"
                value={device}
                onChange={e => setDevice(e.target.value)}
            >
                {devices.map(d => (
                    <option key={d} value={d.toLowerCase()}>
                        {d}
                    </option>
                ))}
            </select>

            <select
                className="m-10 tw-min-w-20"
                value={type}
                onChange={e => setType(e.target.value)}
            >
                {types.map(t => (
                    <option key={t} value={t}>
                        {t}
                    </option>
                ))}
            </select>

            <button
                type="button"
                onClick={() => {
                    handleArtifactDemo({ device, type, name });
                }}
            >
                Test ArtifactoryClient
            </button>

            <button
                type="button"
                onClick={() => {
                    handleFirmwareDemo({ device: [device], name }, type);
                }}
            >
                Test FirmwareClient
            </button>

            <button
                type="button"
                onClick={() => {
                    handleApplicationDemo({ device: [device], name });
                }}
            >
                Test ApplicationClient
            </button>
        </>
    );
};
