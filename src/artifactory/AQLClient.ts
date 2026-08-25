/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */
/**
 * @deprecated Nordic fileserver doesn't allow external AQL searches use ArtifactoryClient for props based searching and downloading instead,
 * The file is preserved for future reference if the above statement where to change,
 * Note that this code is not up to date and wont interact correctly the current artifactory property setup.
 */

import { z } from 'zod';

export type AQueryData = {
    server: string;
    repo: string;
    searchProps: { [prop: string]: string };
    returnProps: string[];
};

const AQLResponseScheme = z.object({
    results: z.array(
        z.object({
            repo: z.string(),
            path: z.string(),
            name: z.string(),
            size: z.coerce.number(),
            created: z.coerce.date(),
            properties: z.array(
                z.object({ key: z.string(), value: z.string() }),
            ),
        }),
    ),
    range: z.object({
        start_pos: z.number(),
        end_pos: z.number(),
        total: z.number(),
    }),
});

export type AQLResponse = z.infer<typeof AQLResponseScheme>;

export class AQLClient {
    SERVER: string;
    REPO: string;

    constructor(server: string, repo: string) {
        this.SERVER = server;
        this.REPO = repo;
    }

    Url = () => `https://${this.SERVER}/artifactory/api/search/aql`;

    getProps(data: AQueryData): string {
        const searchProps: string[] = [
            `"@main_download": "true"`,
            `"repo": "${this.REPO}"`,
        ];

        Object.entries(data.searchProps).forEach(([key, value]) => {
            if (key !== 'server') {
                searchProps.push(`"@${key}": "${value}"`);
            }
        });

        const returnProps: string[] = [];
        data.returnProps.forEach(value => {
            returnProps.push(`"property.${value}"`);
        });

        return `items.find({ ${searchProps.join(', ')}}).include("repo", "path", "name", "size", "ceated", ${returnProps.join(', ')})`;
    }

    public async searchAQL(
        data: AQueryData,
        authentication?: string,
    ): Promise<AQLResponse> {
        const res = AQLResponseScheme.parse(
            await fetch(this.Url(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',

                    Authorization: `${authentication || ''}`,
                },
                body: this.getProps(data),
            }),
        );

        return res;
    }
}
