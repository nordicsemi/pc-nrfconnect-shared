/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */
import React from 'react';
import { join } from 'node:path';

import { getAppDataDir } from '../utils/appDirs';
import { type AResponse, ArtifactoryClient } from './ArtifactoryClient';

const NordicURL = 'files.noridcsemi.com';
const downloadPath = join(getAppDataDir(), 'firmware');

export const Testpane: React.FC = () => {
    const [name, setName] = React.useState('');
    const [device, setDevice] = React.useState('');
    const [type, setType] = React.useState('');

    const Client = new ArtifactoryClient(NordicURL, 'swtools', downloadPath);

    const handleSearch = async (
        inDevice: string,
        inType: string,
        inName: string,
    ) => {
        console.log({ name, device, type });

        const query = {
            device: inDevice,
            type: inType,
            name: inName,
        };

        const res: AResponse = await Client.searchArtifactory(query);

        Client.downloadArtifact(res[0].path);
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

    const types: string[] = ['', 'Application', 'Modem', 'Network'];

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
                    handleSearch(device, type, name);
                }}
            >
                Test
            </button>
        </>
    );
};
