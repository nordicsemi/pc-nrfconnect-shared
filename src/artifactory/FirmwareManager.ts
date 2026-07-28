/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { copyFile, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { z } from 'zod';

import { getAppDataDir, getAppDir } from '../utils/appDirs';
import {
    type Firmware,
    FirmwareClient,
    FirmwareScheme,
    type Source,
    SourceScheme,
} from './FirmwareClient';

export class FirmwareManager extends FirmwareClient {
    BUNDLEDDIR: string;
    CACHE: boolean;
    DOWNLOADDEPS: boolean;

    constructor(
        dataDirectory: string = getAppDataDir(),
        bundledDirectory: string = join(getAppDir(), 'resources', 'firmware'),
        server: string = 'files.nordicsemi.com',
        repo: string = 'swtools',
        deps: boolean = true,
    ) {
        super(server, repo, dataDirectory);
        this.BUNDLEDDIR = resolve(bundledDirectory);
        this.CACHE = true;
        this.DOWNLOADDEPS = deps;
    }

    private async loadBundledSource(): Promise<Source[]> {
        try {
            const content = await readFile(
                join(this.BUNDLEDDIR, 'source.json'),
                'utf-8',
            );
            return z.array(SourceScheme).parse(JSON.parse(content));
        } catch (e) {
            console.error(`Error loading bundled source file, got error: ${e}`);
            return [];
        }
    }

    public async loadReqList(): Promise<Firmware[]> {
        try {
            const content = await readFile(
                join(this.BUNDLEDDIR, 'requested.json'),
                'utf-8',
            );
            return z
                .array(FirmwareScheme)
                .parse(JSON.parse(content)) as Firmware[];
        } catch (e) {
            console.error(`Error loading requested firmwares, got error: ${e}`);
            return [];
        }
    }

    public async updateCache(): Promise<void> {
        const req = await this.loadReqList();
        req.forEach(app => {
            this.getFirmwares(app);
        });
    }

    // Syncs with bundle and upstream and returns list of firmwares (dependencies and application itself)
    public getFirmwares(fw: Firmware): Firmware[] {
        const ins: Firmware[] = [fw];

        const out: Firmware[] = [];

        if (fw.dependencies) {
            fw.dependencies.forEach(f => ins.push(f));
        }

        ins.forEach(async f => {
            out.push(await this.getFirmware(f));
        });

        return out;
    }

    protected async getFileOrBundle(fw: Firmware) {
        const cachedSource = await this.loadSource();
        let cachedFirmware;

        if (this.CACHE) {
            cachedFirmware = cachedSource.find(
                f =>
                    f.name === fw.name &&
                    f.device === fw.device &&
                    f.type === fw.type &&
                    (fw.version === undefined || f.version === fw.version),
            );
        }

        const upstreamFirmware = await this.fetchFirmware(fw);

        if (cachedFirmware === undefined) {
            return await this.loadBundledFirmware(fw, upstreamFirmware);
        }

        if (upstreamFirmware.version === cachedFirmware.version) {
            if (cachedFirmware.file === undefined) {
                throw new Error('cachedFirmware did not contain path');
            }

            console.log(`Returning firmware ${cachedFirmware.name} from cache`);
            return cachedFirmware;
        }

        console.log(
            `Downloading firmware ${upstreamFirmware.name} from artifactory`,
        );

        return await this.downloadFirmware(upstreamFirmware);
    }

    protected async loadBundledFirmware(
        fw: Firmware,
        upstreamFirmware: Source,
    ): Promise<Firmware> {
        const bundledSource = await this.loadBundledSource();
        const bundledFirmware = bundledSource.find(
            f =>
                f.name === fw.name &&
                f.device === fw.device &&
                f.type === fw.type &&
                (fw.version === undefined || f.version === fw.version),
        );

        if (
            bundledFirmware === undefined ||
            bundledFirmware.version !== upstreamFirmware.version
        ) {
            console.log(
                `Downloading firmware ${upstreamFirmware.name} from artifactory`,
            );
            return await this.downloadFirmware(upstreamFirmware);
        }

        if (bundledFirmware.file === undefined)
            throw new Error('bundledSources should have path field');

        copyFile(
            join(this.BUNDLEDDIR, bundledFirmware.file),
            join(this.DATADIR, 'firmware', bundledFirmware.file),
        );

        this.putSource({
            ...bundledFirmware,
            file: join(this.BUNDLEDDIR, bundledFirmware.file),
        });

        console.log(`Copying firmware ${bundledFirmware.name} from bundle`);

        return {
            ...bundledFirmware,
            file: join(this.BUNDLEDDIR, bundledFirmware.file),
        };
    }
}
