/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { z } from 'zod';

export const NordicURL: string = 'files.nordicsemi.com';

export type Iurl = {
    server?: string;
    repo: string;
    path: string;
};

export type Platforms = 'win32-ia32' | 'darwin-x64' | 'linux-x64' | 'win32-x64';

export type AQLdata = {
    server: string;
    repo: string;
    version?: string;
    platform?: Platforms;
};

type AQLresult = {
    results: { uri: string }[];
};

const AQLresultsScheme = z.object({
    results: z.array(z.object({ uri: z.string() })),
});

type fullAQLresult = {
    results: string[];
};

const getUrl = ({ server = NordicURL, repo, path }: Iurl): string =>
    `https://${server}/artifactory/${repo}/${path}`;

const getAQLurl = (data: Partial<AQLdata>): string => `https://${
    data.server ? data.server : NordicURL
}/artifactory/api/search/prop?repos=${
    data.repo ? data.repo : 'swtools'
}${data.version ? '&version=' + data.version : ''}
  ${data.platform ? '&platform=' + data.platform : ''}&main_download=true`;

export async function searchAQL(
    AQLdata: Partial<AQLdata>,
): Promise<fullAQLresult> {
    const searchResponse = await fetch(getAQLurl(AQLdata));

    const results: AQLresult = AQLresultsScheme.parse(
        await searchResponse.json(),
    );

    const out: fullAQLresult = { results: [] };

    results.results.forEach(result => {
        out.results.push(result.uri);
    });

    return out;
}

export async function downloadArtifact(url: Iurl) {
    const artifactoryUrl = getUrl(url);

    const response = await fetch(artifactoryUrl, {
        method: 'GET',
        // headers: {
        //  Authorization: "Bearer <your-access-token>",
        //  // Or use Basic Auth:
        //  // 'Authorization': 'Basic ' + btoa('username:password')
        // },
    });

    if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
    }

    const blob = await response.blob();
    return blob;
}
