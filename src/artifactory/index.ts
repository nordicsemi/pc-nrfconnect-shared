/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import path from 'path';

import { ArtifactoryClient, type AUrlData } from './ArtifactoryClient';
import { type AQueryData, type AResponse, PropsClient } from './PropsClient';

export const downloadPath: string = path.resolve(
    __dirname,
    '../resources/firmware/downloads',
);

export const NordicURL: string = 'files.nordicsemi.com';

export const tester = async () => {
    const testData: AQueryData = {
        server: NordicURL,
        repo: 'swtools',
        searchProps: { device: 'nrf9160', type: 'Modem', latest: 'true' },
    };

    const fetcher = new PropsClient();

    const data: AResponse = await fetcher.searchArtifactory(testData);

    console.log('Test fetch:');
    console.log(data);

    const url: AUrlData = {
        server: NordicURL,
        path: data[0].path,
        repo: data[0].repo,
    };

    const downloader = new ArtifactoryClient();

    downloader.downloadArtifact(url, downloadPath);
};
