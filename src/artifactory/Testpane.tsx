/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */
import React from 'react';

import { downloadPath, NordicURL, tester } from '.';
import { ArtifactoryClient } from './ArtifactoryClient.js';
import { type AQueryData, type AResponse, PropsClient } from './PropsClient.js';

export const Testpane: React.FC = () => {
    const [value, setValue] = React.useState('');
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
    const clickTest = () => {
        console.log('test');
    };

    const devices: string[] = [
        'nRF9151DK',
        'nRF9160DK',
        'nRF9161DK',
        'nRF52833DK',
        'nRF52840DK',
    ];

    const types: string[] = ['Application', 'Modem', 'Network'];

    return (
        <>
            <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Type something..."
            />

            <select value={device} onChange={e => setDevice(e.target.value)}>
                {devices.map(d => (
                    <option key={d.toLowerCase()} value={d.toLowerCase()}>
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
                Fetch
            </button>
            <button type="button" onClick={clickTest}>
                Test
            </button>
            <button type="button" onClick={tester}>
                Run
            </button>
        </>
    );
};
