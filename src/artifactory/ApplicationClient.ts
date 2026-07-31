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
        await Promise.all(index.map(fw => this.getIndexedFirmwareWithDeps(fw)));
    }

    public async getIndexedFirmwareWithDeps(fw: Firmware): Promise<Source[]> {
        const fetchedFW: Source = await this.getIndexedFirmware(fw, true);

        let all: Source[] = [fetchedFW];
        if (fetchedFW.dependencies) {
            all = [
                fetchedFW,
                ...(await Promise.all(
                    fetchedFW.dependencies.map(f =>
                        this.getIndexedFirmware({ ...f, device: fw.device }),
                    ),
                )),
            ];
        }

        return all;
    }

    public async getIndexedFirmware(
        fw: Firmware,
        latest?: boolean,
    ): Promise<Source> {
        const match = isSameFirmware(fw);
        const newest = (sources: Source[]) =>
            sources
                .filter(match)
                .sort((a, b) => compareVersionDesc(a.version, b.version))[0];

        const cached = newest(await this.loadSource());
        const bundled = newest(await this.loadIndex());

        if (!latest) {
            if (cached) {
                console.log(`Returning firmware ${cached.name} from cache`);
                return cached;
            }
            if (bundled) return this.copyBundledFirmware(bundled);
        } else {
            const upstream = await this.fetchFirmware(fw, latest);
            if (cached?.version === upstream.version) {
                console.log(`Returning firmware ${cached.name} from cache`);
                return cached;
            }
            if (bundled?.version === upstream.version) {
                return this.copyBundledFirmware(bundled);
            }
            console.log(
                `Downloading firmware ${upstream.name} from artifactory`,
            );
            return this.downloadFirmware(upstream);
        }

        const upstream = await this.fetchFirmware(fw, latest);
        console.log(`Downloading firmware ${upstream.name} from artifactory`);
        return this.downloadFirmware(upstream);
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
