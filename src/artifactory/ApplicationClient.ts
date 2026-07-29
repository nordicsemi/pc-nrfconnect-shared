/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { copyFile, mkdir, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { z } from 'zod';

import { getAppDataDir, getAppDir } from '../utils/appDirs';
import {
    compareVersionDesc,
    type Firmware,
    FirmwareClient,
    isSameFirmware,
    type Source,
    SourceScheme,
} from './FirmwareClient';

type ApplicationClientProps = {
    dataDirectory?: string;
    bundledDirectory?: string;
    server?: string;
    repo?: string;
};

export class ApplicationClient extends FirmwareClient {
    protected BUNDLEDDIR: string;

    constructor({
        dataDirectory = getAppDataDir(),
        bundledDirectory = join(getAppDir(), 'resources', 'firmware'),
        server = 'files.nordicsemi.com',
        repo = 'swtools',
    }: ApplicationClientProps = {}) {
        super({ server, repo, directory: dataDirectory });
        this.BUNDLEDDIR = resolve(bundledDirectory);
    }

    public async loadIndex(): Promise<Source[]> {
        try {
            const content = await readFile(
                join(this.BUNDLEDDIR, 'index.json'),
                'utf-8',
            );
            return z.array(SourceScheme).parse(JSON.parse(content));
        } catch (e) {
            console.error(`Error loading indexed firmwares: ${String(e)}`);
            return [];
        }
    }

    public async updateCache(): Promise<void> {
        const index = await this.loadIndex();
        await Promise.all(index.map(fw => this.getApplication(fw)));
    }

    public async getApplication(fw: Firmware): Promise<Source[]> {
        const all: Firmware[] = [fw, ...(fw.dependencies ?? [])];
        return await Promise.all(all.map(f => this.getIndexedFirmware(f)));
    }

    protected async getIndexedFirmware(fw: Firmware): Promise<Source> {
        const match = isSameFirmware(fw);

        const cachedFirmware = (await this.loadSource())
            .filter(match)
            .sort((a, b) => compareVersionDesc(a.version, b.version))[0];

        if (cachedFirmware && fw.version) return cachedFirmware;

        const upstreamFirmware = await this.fetchFirmware(fw);

        if (
            cachedFirmware &&
            cachedFirmware.version === upstreamFirmware.version
        ) {
            console.log(`Returning firmware ${cachedFirmware.name} from cache`);
            return cachedFirmware;
        }

        const bundledFirmware = (await this.loadIndex())
            .filter(match)
            .sort((a, b) => compareVersionDesc(a.version, b.version))[0];

        if (
            bundledFirmware &&
            bundledFirmware.version === upstreamFirmware.version
        ) {
            return this.copyBundledFirmware(bundledFirmware);
        }

        console.log(
            `Downloading firmware ${upstreamFirmware.name} from artifactory`,
        );
        return this.downloadFirmware(upstreamFirmware);
    }

    protected async copyBundledFirmware(bundled: Source): Promise<Source> {
        const destination = join(this.FIRMWAREDIR, bundled.file);

        await mkdir(this.FIRMWAREDIR, { recursive: true });
        await copyFile(join(this.BUNDLEDDIR, bundled.file), destination);

        const outFirmware: Source = { ...bundled, file: destination };
        await this.putSource(outFirmware);

        console.log(`Copying firmware ${outFirmware.name} from bundle`);
        return outFirmware;
    }
}
