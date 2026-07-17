/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { copyFile, mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { z } from 'zod';

import { getAppDataDir, getAppDir } from '../utils/appDirs';
import {
    type AQueryProps,
    type AResponse,
    ArtifactoryClient,
} from './ArtifactoryClient';

const FirmwareScheme = z.object({
    name: z.string(),
    file: z.string(),
    type: z.string(),
    device: z.string(),
    version: z.string(),
    latest: z.string().optional(),
});

export type Firmware = z.infer<typeof FirmwareScheme>;

const SourceListScheme = z.object({
    firmwares: z.array(FirmwareScheme),
});

export type SourceList = z.infer<typeof SourceListScheme>;

const ReqFirmwareScheme = z.object({
    name: z.string(),
    type: z.string(),
    device: z.string(),
});

export type ReqFirmware = z.infer<typeof ReqFirmwareScheme>;

const ReqListScheme = z.record(
    z.string(),
    z.array(
        z.object({
            title: z.string().optional(),
            description: z.string().optional(),
            documentation: z
                .union([
                    z.string(),
                    z.object({ label: z.string(), href: z.string() }),
                ])
                .optional(),
            firmwares: z.array(ReqFirmwareScheme),
        }),
    ),
);

export type ReqList = z.infer<typeof ReqListScheme>;

export class FirmwareManager {
    REPO: string;
    SERVER: string;
    BUNDLEDDIR: string;
    DATADIR: string;
    Client: ArtifactoryClient;
    CACHE: boolean;

    constructor(
        dataDirectory: string = getAppDataDir(),
        bundledDirectory: string = join(getAppDir(), 'resources', 'firmware'),
        server: string = 'files.nordicsemi.com',
        repo: string = 'swtools',
        cache: boolean = true,
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
        this.CACHE = cache;
    }

    private async loadBundledSource(): Promise<SourceList> {
        try {
            const content = await readFile(
                join(this.BUNDLEDDIR, 'source.json'),
                'utf-8',
            );
            return SourceListScheme.parse(JSON.parse(content)) as SourceList;
        } catch (e) {
            console.error(`Error loading bundled source file, got error: ${e}`);
            return {
                firmwares: [],
            };
        }
    }

    private async loadCachedSource(): Promise<SourceList> {
        try {
            const content = await readFile(
                join(this.DATADIR, 'source.json'),
                'utf-8',
            );
            return SourceListScheme.parse(JSON.parse(content)) as SourceList;
        } catch (e) {
            console.error(`Error loading cache source file, got error: ${e}`);
            return {
                firmwares: [],
            };
        }
    }

    public async loadReqList(): Promise<ReqList> {
        try {
            const content = await readFile(
                join(this.BUNDLEDDIR, 'requested.json'),
                'utf-8',
            );
            return ReqListScheme.parse(JSON.parse(content)) as ReqList;
        } catch (e) {
            console.error(`Error loading requested firmwares, got error: ${e}`);
            return {
                apps: [],
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
        const source = await this.loadCachedSource();
        source.firmwares.push(fw);
        await this.saveSource(source);
    }

    private async loadBundledFirmware(
        fw: ReqFirmware,
        upstreamFirmware: Firmware,
        version?: string,
    ): Promise<string> {
        const bundledSource = await this.loadBundledSource();
        const bundledFirmware = bundledSource.firmwares.find(
            f =>
                f.name === fw.name &&
                f.device === fw.device &&
                f.type === fw.type &&
                (version === undefined || f.version === version),
        );

        if (
            typeof bundledFirmware === 'undefined' ||
            bundledFirmware.version !== upstreamFirmware.version
        ) {
            console.log(
                `Downloading firmware ${upstreamFirmware.name} from artifactory`,
            );
            return await this.downloadFirmware(upstreamFirmware);
        }

        copyFile(
            join(this.BUNDLEDDIR, bundledFirmware.file),
            join(this.DATADIR, 'firmware', bundledFirmware.file),
        );
        this.putSource(bundledFirmware);
        console.log(`Copying firmware ${bundledFirmware.name} from bundle`);
        return bundledFirmware.file;
    }

    // Returns filename for requested firmware within the directory specified in constructor
    public async getFile(fw: ReqFirmware, version?: string): Promise<string> {
        const cachedSource = await this.loadCachedSource();
        let cachedFirmware;
        if (this.CACHE) {
            cachedFirmware = cachedSource.firmwares.find(
                f =>
                    f.name === fw.name &&
                    f.device === fw.device &&
                    f.type === fw.type &&
                    (version === undefined || f.version === version),
            );
        } else {
            cachedSource.firmwares.forEach(f => this.removeSource(f));
        }

        const upstreamFirmware = await this.fetchFirmware(fw, version);

        if (cachedFirmware === undefined) {
            return await this.loadBundledFirmware(
                fw,
                upstreamFirmware,
                version,
            );
        }

        console.log(cachedFirmware.version);
        console.log(upstreamFirmware.version);

        if (upstreamFirmware.version === cachedFirmware.version) {
            console.log(`Returning firmware ${cachedFirmware.name} from cache`);
            return cachedFirmware.file;
        }

        console.log(
            `Downloading firmware ${upstreamFirmware.name} from artifactory`,
        );
        return await this.downloadFirmware(upstreamFirmware);
    }

    public async searchFirmware(fw: Partial<Firmware>): Promise<AResponse> {
        return await this.Client.searchArtifactory(fw);
    }

    public async removeSource(
        fw: ReqFirmware,
        version?: string,
    ): Promise<void> {
        const source = await this.loadCachedSource();

        const toRemove = source.firmwares.filter(
            f =>
                f.name === fw.name &&
                f.device === fw.device &&
                f.type === fw.type &&
                (version === undefined || f.version === version),
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
                    f.type === fw.type &&
                    (version === undefined || f.version === version)
                ),
        );

        await this.saveSource(source);
    }

    private async downloadFirmware(f: Firmware): Promise<string> {
        await this.Client.downloadArtifactFromUrl(f.file);
        await this.removeSource(f);
        const path = f.file.split('/').pop()?.split('?')[0];
        if (!path) {
            throw new Error(`Could not derive a filename from url: ${f.file}`);
        }
        await this.putSource({ ...f, file: path });
        return path;
    }

    private async fetchFirmware(
        fw: ReqFirmware,
        v?: string,
    ): Promise<Firmware> {
        let props: AQueryProps = {
            type: fw.type,
            name: fw.name,
            device: fw.device,
        };

        if (v) {
            props = { version: v, ...props };
        } else {
            props = { latest: 'true', ...props };
        }

        const res = await this.Client.searchArtifactory(props);

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
