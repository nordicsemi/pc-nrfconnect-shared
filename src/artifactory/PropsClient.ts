/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { z } from 'zod';

export type AQueryData = {
    server: string;
    repo: string;
    searchProps: { [prop: string]: string };
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

export class PropsClient {
    SERVER: string | undefined;
    REPO: string | undefined;

    constructor(server?: string, repo?: string) {
        this.SERVER = server;
        this.REPO = repo;
    }

    public getUrl(data: AQueryData): string {
        const parts: string[] = [];
        parts.push(
            `https://${this.SERVER ?? data.server}/artifactory/api/search/prop?repos=${this.REPO ?? data.repo}&main_download=true`,
        );

        Object.entries(data.searchProps).forEach(([key, value]) => {
            if (key !== 'repo' && key !== 'server') {
                parts.push(`&${key}=${String(value)}`);
            }
        });

        console.log(parts);
        return parts.join('');
    }

    public async searchArtifactory(
        data: AQueryData,
        authentication?: string,
    ): Promise<AResponse> {
        const url = this.getUrl(data);
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
