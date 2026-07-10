/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

export type AUrlData = {
    server: string;
    repo: string;
    path: string;
};

export class ArtifactoryClient {
    SERVER: string | undefined;
    REPO: string | undefined;
    DIR: string | undefined;

    constructor(server?: string, repo?: string, dir?: string) {
        this.SERVER = server;
        this.REPO = repo;
        this.DIR = dir;
    }

    public getUrl = (input: AUrlData): string =>
        `https://${this.SERVER ?? input.server}/ui/api/v1/download?isNativeBrowsing=false&repoKey=${this.REPO ?? input.repo}&path=${input.path}`;

    public async downloadArtifact(
        input: AUrlData,
        downloadDir: string,
    ): Promise<void> {
        const dir = resolve(
            `${this.DIR ?? downloadDir}${input.path.split('/')[-1]}`,
        );
        mkdir(dirname(dir), { recursive: true });
        const url: string = this.getUrl(input);
        const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
        await writeFile(dir, buffer);
    }

    public async downloadArtifactFromUrl(
        url: string,
        downloadDir: string,
    ): Promise<void> {
        const dir = resolve(this.DIR ?? downloadDir);
        mkdir(dirname(dir), { recursive: true });
        const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
        await writeFile(dir, buffer);
    }
}
