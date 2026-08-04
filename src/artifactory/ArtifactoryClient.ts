/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
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
    protected SERVER: string;
    protected REPO: string;
    protected DIR: string;

    constructor(server: string, repo: string, dir: string) {
        this.SERVER = server;
        this.REPO = encodeURIComponent(repo);
        this.DIR = dir;
    }

    public downloadUrl = (path: string): string =>
        `https://${this.SERVER}/ui/api/v1/download?isNativeBrowsing=false&repoKey=${this.REPO}&path=${encodeURIComponent(path)}`;

    public async downloadArtifactFromPath(
        path: string,
        checksum?: string,
        algorithm: 'md5' | 'sha1' | 'sha256' = 'sha256',
    ): Promise<boolean | undefined> {
        return await this.downloadArtifactFromUrl(
            this.downloadUrl(path),
            checksum,
            algorithm,
        );
    }

    public async downloadArtifactFromUrl(
        url: string,
        checksum?: string,
        algorithm: 'md5' | 'sha1' | 'sha256' = 'sha256',
    ): Promise<boolean | undefined> {
        const filename = filenameFromUrl(url);

        const dir = resolve(this.DIR);
        const target = join(dir, filename);

        await mkdir(dir, { recursive: true });
        const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());

        let isValid: boolean | undefined;

        if (checksum) {
            const actualChecksum = createHash(algorithm)
                .update(buffer)
                .digest('hex');

            isValid = checksum.toLowerCase() === actualChecksum.toLowerCase();
        }

        writeFile(target, buffer);

        return isValid;
    }

    public queryUrl(props: AQueryProps): string {
        const params = new URLSearchParams({
            repos: this.REPO,
            main_download: 'true',
        });

        Object.entries(props).forEach(([k, v]) => {
            if (k !== 'repo' && k !== 'server') params.set(k, v);
        });

        return `https://${this.SERVER}/artifactory/api/search/prop?${params}`;
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

    public async downloadJsonFromPath(path: string): Promise<unknown> {
        const url = this.downloadUrl(path);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
        return res.json();
    }
}

export function filenameFromUrl(url: string): string {
    const path = new URL(url).searchParams.get('path');
    const name = path?.split('/').pop();
    if (!name) throw new Error(`Could not derive a filename from url: ${url}`);
    return name;
}
