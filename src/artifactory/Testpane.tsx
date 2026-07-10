/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */
import React from 'react';

import { downloadPath, NordicURL } from '.';
import { ArtifactoryClient } from './ArtifactoryClient';
import { type AQueryData, type AResponse, PropsClient } from './PropsClient';

export const Testpane: React.FC = () => {
    const [name, setName] = React.useState('');
    const [device, setDevice] = React.useState('');
    const [type, setType] = React.useState('');

    const searcher = new PropsClient();
    const fetcher = new ArtifactoryClient();

    const handleSearch = async (inDevice: string, inType: string) => {
        console.log({ type, device });

        const query: AQueryData = {
            server: NordicURL,
            repo: 'swtools',
            searchProps: {
                device: inDevice,
                type: inType,
            },
        };

        const res: AResponse = await searcher.searchArtifactory(query);

        fetcher.downloadArtifact(
            {
                server: NordicURL,
                repo: 'swtools',
                path: res[0].path,
            },
            downloadPath,
        );
    };

    const devices: string[] = [
        'nRF9151DK',
        'nRF9160DK',
        'nRF9161DK',
        'nRF52833DK',
        'nRF52840DK',
    ];

    const names: string[] = [
        'hello_world',
        'lbs',
        'peripheral_uart',
        'power_profiling',
        'asset_tracker',
    ];

    const types: string[] = ['Application', 'Modem', 'Network'];

    return (
        <>
            <select value={name} onChange={e => setName(e.target.value)}>
                {names.map(n => (
                    <option key={n} value={n.toLowerCase()}>
                        {n}
                    </option>
                ))}
            </select>

            <select value={device} onChange={e => setDevice(e.target.value)}>
                {devices.map(d => (
                    <option key={d} value={d.toLowerCase()}>
                        {d}
                    </option>
                ))}
            </select>

            <select value={type} onChange={e => setType(e.target.value)}>
                {types.map(t => (
                    <option key={t} value={t}>
                        {t}
                    </option>
                ))}
            </select>

            <button
                type="button"
                onClick={() => {
                    handleSearch(device, type);
                }}
            >
                Test
            </button>
        </>
    );
};
