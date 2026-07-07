/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export type AUrlData = {
    server: string;
    repo: string;
    path: string;
};

export class ArtifactoryClient {
    public getUrl(input: AUrlData): string {
        return `https://${input.server}/ui/api/v1/download?isNativeBrowsing=false&repoKey=${input.repo}&path=${input.path}`;
    }

    public async downloadArtifact(input: AUrlData, dir: string): Promise<void> {
        dir = path.resolve(`${dir}${input.path.split('/')[-1]}`);
        mkdir(path.dirname(dir), { recursive: true });
        const url: string = this.getUrl(input);
        const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
        await writeFile(dir, buffer);
    }

    public async downloadArtifactFromUrl(
        url: string,
        dir: string,
    ): Promise<void> {
        mkdir(path.dirname(dir), { recursive: true });
        const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
        await writeFile(dir, buffer);
    }
}
