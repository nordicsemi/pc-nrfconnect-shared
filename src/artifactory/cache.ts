/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { z } from 'zod';

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

export type ReqList = {
    title?: string;
    description?: string;
    documentation?: string | { label: string; href: string };
    firmwares: ReqFirmware[];
}[];

const SourceListScheme = z.object({
    firmwares: z.array(FirmwareScheme),
});

export type SourceList = z.infer<typeof SourceListScheme>;

export class FirmwareManager {
    FILEDIR: string;

    constructor(directory: string) {
        this.FILEDIR = directory;
    }

    async loadSource(): Promise<SourceList> {
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

    async loadReqLists(): Promise<ReqList[]> {
        try {
            const content = await readFile(
                `${this.FILEDIR}index.json`,
                'utf-8',
            );
            return JSON.parse(content);
        } catch {
            return [];
        }
    }

    async saveSource(source: SourceList): Promise<void> {
        await mkdir(dirname(this.FILEDIR), { recursive: true });
        await writeFile(this.FILEDIR, JSON.stringify(source, null, 2), 'utf-8');
    }

    async putSource(fw: Firmware): Promise<void> {
        const source = await this.loadSource();
        source.firmwares.push(fw);
        await this.saveSource(source);
    }

    async getFile(fw: ReqFirmware): Promise<string> {
        const source = await this.loadSource();
        const firmware = source.firmwares.find(
            f =>
                f.name === fw.name &&
                f.device === fw.device &&
                f.type === fw.type,
        );

        if (typeof firmware === 'undefined') {
            throw new Error();
        }

        return firmware.file;
    }

    // TODO add methods for fetching REQFIRMWARE from artifactory and update SOURCELIST
}
