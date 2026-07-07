/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { z } from 'zod';

import { NordicURL } from '.';
import { ArtifactoryClient } from './ArtifactoryClient';
import { PropsClient } from './PropsClient';

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
    FILEDIR: string;
    REQFIRMFILE: string;
    Fetcher: PropsClient;
    Downloader: ArtifactoryClient;

    constructor(
        directory: string,
        requriedfirmwarefile: string,
        server: string = NordicURL,
        repo: string = 'swtools',
    ) {
        this.SERVER = server;
        this.REPO = repo;
        this.FILEDIR = resolve(directory);
        this.REQFIRMFILE = resolve(requriedfirmwarefile);
        this.Fetcher = new PropsClient();
        this.Downloader = new ArtifactoryClient();
    }

    private async loadSource(): Promise<SourceList> {
        try {
            const content = await readFile(
                `${this.FILEDIR}source.json`,
                'utf-8',
            );
            return SourceListScheme.parse(JSON.parse(content));
        } catch {
            return {
                firmwares: [],
            };
        }
    }

    private async loadReqList(): Promise<ReqList> {
        try {
            const content = await readFile(this.REQFIRMFILE, 'utf-8');
            return JSON.parse(content);
        } catch {
            return {};
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
        await mkdir(dirname(this.FILEDIR), { recursive: true });
        await writeFile(this.FILEDIR, JSON.stringify(source, null, 2), 'utf-8');
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
        await this.Downloader.downloadArtifactFromUrl(f.file, this.FILEDIR);
        await this.removeSource(f);
        const path = f.file.split('/')[-1];
        await this.putSource({ ...f, file: path });
        return path;
    }

    private async fetchFirmware(fw: ReqFirmware): Promise<Firmware> {
        const res = await this.Fetcher.searchArtifactory({
            server: this.SERVER,
            repo: this.REPO,
            searchProps: {
                type: fw.type,
                name: fw.name,
                device: fw.device,
                latest: 'true',
            },
        });

        if (res.length !== 1) {
            throw new Error('Unexpected artifactory search return');
        }

        return {
            name: res[0].properties.name[0],
            type: res[0].properties.type[0],
            version: res[0].properties.version[0],
            device: res[0].properties.device[0],
            file: this.Downloader.getUrl({
                server: this.SERVER,
                repo: this.REPO,
                path: res[0].path,
            }),
        };
    }
    // TODO add methods for fetching REQFIRMWARE from artifactory and update SOURCELIST
}
