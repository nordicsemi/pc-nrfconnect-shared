/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { z } from 'zod';

export type AQueryProps = {
    [prop: string]: string;
};

const AResponseScheme = z.array(
    z.object({
        checksums: z
            .object({
                md5: z.string(),
                sha1: z.string(),
                sha256: z.string(),
            })
            .partial(),
        created: z.coerce.date(),
        createdBy: z.string(),
        downloadUri: z.string(),
        lastModified: z.coerce.date(),
        lastUpdated: z.coerce.date(),
        mimeType: z.string(),
        modifiedBy: z.string(),
        originalChecksums: z
            .object({
                md5: z.string(),
                sha1: z.string(),
                sha256: z.string(),
            })
            .partial(),
        path: z.string(),
        properties: z.record(z.string(), z.array(z.string())),
        repo: z.string(),
        size: z.coerce.number(),
        uri: z.string(),
    }),
);

export type AResponse = z.infer<typeof AResponseScheme>;

export class ArtifactoryClient {
    SERVER: string;
    REPO: string;
    DIR: string;

    constructor(server: string, repo: string, dir: string) {
        this.SERVER = server;
        this.REPO = repo;
        this.DIR = dir;
    }

    public downloadUrl = (path: string): string =>
        `https://${this.SERVER}/ui/api/v1/download?isNativeBrowsing=false&repoKey=${this.REPO}&path=${path}`;

    public async downloadArtifact(path: string): Promise<void> {
        const dir = resolve(`${this.DIR}${path.split('/')[-1]}`);
        mkdir(dirname(dir), { recursive: true });
        const url: string = this.downloadUrl(path);
        const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
        await writeFile(dir, buffer);
    }

    public async downloadArtifactFromUrl(url: string): Promise<void> {
        const filename = url.split('/').pop()?.split('?')[0];
        if (!filename) {
            throw new Error(`Could not derive a filename from url: ${url}`);
        }

        const dir = resolve(this.DIR);
        const target = join(dir, filename);

        await mkdir(dir, { recursive: true }); // the folder we write INTO, and awaited
        const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
        await writeFile(target, buffer);
    }

    public queryUrl(props: AQueryProps): string {
        const parts: string[] = [];
        parts.push(
            `https://${this.SERVER}/artifactory/api/search/prop?repos=${this.REPO}&main_download=true`,
        );

        Object.entries(props).forEach(([key, value]) => {
            if (key !== 'repo' && key !== 'server') {
                parts.push(`&${key}=${String(value)}`);
            }
        });

        console.log(parts);
        return parts.join('');
    }

    public async searchArtifactory(
        props: AQueryProps,
        authentication?: string,
    ): Promise<AResponse> {
        const url = this.queryUrl(props);
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: authentication || '',
                'X-Result-Detail': 'info, properties',
            },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);

        const resJson = await res.json();

        console.log(resJson);

        const out: AResponse = AResponseScheme.parse(resJson.results);

        return out;
    }
}
