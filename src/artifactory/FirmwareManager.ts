/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { z } from 'zod';

import { getAppDataDir, getAppDir } from '../utils/appDirs';
import { ArtifactoryClient } from './ArtifactoryClient';

const FirmwareScheme = z.object({
    name: z.string(),
    file: z.string(),
    type: z.string(),
    device: z.string(),
    version: z.string(),
});

export type Firmware = z.infer<typeof FirmwareScheme>;

export type ReqFirmware = Omit<Firmware, 'file' | 'version'> & {
    documentation?: string | { label: string; href: string };
};

// List of all firmwares that need to be avaliable/downloaded
export type ReqList = {
    [sort: string]: {
        title?: string;
        description?: string;
        documentation?: string | { label: string; href: string };
        firmwares: ReqFirmware[];
    }[];
};

const SourceListScheme = z.object({
    firmwares: z.array(FirmwareScheme),
});

// List of all avaliable firmwares
export type SourceList = z.infer<typeof SourceListScheme>;

export class FirmwareManager {
    REPO: string;
    SERVER: string;
    BUNDLEDDIR: string;
    DATADIR: string;
    Client: ArtifactoryClient;

    constructor(
        dataDirectory: string = join(getAppDataDir(), 'resources', 'firmware'),
        bundledDirectory: string = getAppDir(),
        server: string = 'files.nordicsemi.com',
        repo: string = 'swtools',
    ) {
        this.SERVER = server;
        this.REPO = repo;
        this.DATADIR = resolve(dataDirectory);
        this.BUNDLEDDIR = resolve(bundledDirectory);
        this.Client = new ArtifactoryClient(
            this.SERVER,
            this.REPO,
            join(this.DATADIR, 'firmware'),
        );
    }

    private async loadFile<T>(file: string): Promise<T> {
        try {
            const content = await readFile(join(this.DATADIR, file), 'utf-8');
            return SourceListScheme.parse(JSON.parse(content)) as T;
        } catch {
            const content = await readFile(
                join(this.BUNDLEDDIR, file),
                'utf-8',
            );
            return SourceListScheme.parse(JSON.parse(content)) as T;
        }
    }

    private async loadSource(): Promise<SourceList> {
        try {
            return await this.loadFile<SourceList>('source.json');
        } catch (e) {
            console.log(`couldnt find file, got error: ${e}`);
            return {
                firmwares: [],
            };
        }
    }

    private async loadReqList(): Promise<ReqList> {
        try {
            return await this.loadFile<ReqList>('requested.json');
        } catch (e) {
            console.log(`couldnt find file, got error: ${e}`);
            return {
                firmwares: [],
            };
        }
    }

    public async updateCache(): Promise<void> {
        const req = await this.loadReqList();
        Object.keys(req).forEach(key => {
            req[key].forEach(app => {
                app.firmwares.forEach(f => {
                    this.getFile(f);
                });
            });
        });
    }

    private async saveSource(source: SourceList): Promise<void> {
        await mkdir(dirname(this.DATADIR), { recursive: true });
        await writeFile(
            join(this.DATADIR, 'source.json'),
            JSON.stringify(source, null, 2),
            'utf-8',
        );
    }

    private async putSource(fw: Firmware): Promise<void> {
        const source = await this.loadSource();
        source.firmwares.push(fw);
        await this.saveSource(source);
    }

    // Returns filename for requested firmware within the directory specified in constructor
    public async getFile(fw: ReqFirmware): Promise<string> {
        const source = await this.loadSource();
        const localFirmware = source.firmwares.find(
            f =>
                f.name === fw.name &&
                f.device === fw.device &&
                f.type === fw.type,
        );

        const upstreamFirmware = await this.fetchFirmware(fw);

        if (
            typeof localFirmware !== 'undefined' &&
            upstreamFirmware.version === localFirmware.version
        ) {
            return localFirmware.file;
        }

        return await this.downloadFirmware(upstreamFirmware);
    }

    private async removeSource(fw: ReqFirmware): Promise<void> {
        const source = await this.loadSource();

        const toRemove = source.firmwares.filter(
            f =>
                f.name === fw.name &&
                f.device === fw.device &&
                f.type === fw.type,
        );

        await Promise.all(
            toRemove.map(f =>
                unlink(f.file).catch(err => {
                    console.warn(`Failed to delete file ${f.file}:`, err);
                }),
            ),
        );

        source.firmwares = source.firmwares.filter(
            f =>
                !(
                    f.name === fw.name &&
                    f.device === fw.device &&
                    f.type === fw.type
                ),
        );

        await this.saveSource(source);
    }

    private async downloadFirmware(f: Firmware): Promise<string> {
        await this.Client.downloadArtifactFromUrl(f.file);
        await this.removeSource(f);
        const path = f.file.split('/')[-1];
        await this.putSource({ ...f, file: path });
        return path;
    }

    private async fetchFirmware(fw: ReqFirmware): Promise<Firmware> {
        const res = await this.Client.searchArtifactory({
            type: fw.type,
            name: fw.name,
            device: fw.device,
            latest: 'true',
        });

        if (res.length !== 1) {
            throw new Error('Unexpected artifactory search return');
        }

        return {
            name: res[0].properties.name[0],
            type: res[0].properties.type[0],
            version: res[0].properties.version[0],
            device: res[0].properties.device[0],
            file: this.Client.downloadUrl(res[0].path),
        };
    }
}
