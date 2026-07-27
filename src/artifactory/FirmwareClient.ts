/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { z } from 'zod';

import { getAppDataDir } from '../utils/appDirs';
import {
    type AQueryProps,
    type AResponse,
    ArtifactoryClient,
    filenameFromUrl,
} from './ArtifactoryClient';

export const TypeScheme = z.union([
    z.literal('Modem'),
    z.literal('Network'),
    z.literal('Application'),
]);

export const FirmwareScheme = z.object({
    name: z.string(), // Identifier associated with functionality (not version or device)
    version: z.string().optional(), // Not optional for source / cache
    type: TypeScheme, // Max one of each per flash (cant have two Modems on one device at a time)
    device: z.array(z.string()), // Some firmwares support multiple devices (this should be called devices)
    file: z.string().optional(), // Absolute path or download url
    latest: z.string().optional(),
});

export const ArtifactScheme = FirmwareScheme.extend({
    title: z.string().optional(),
    description: z.string().optional(),
    documentation: z
        .union([z.string(), z.object({ label: z.string(), href: z.string() })])
        .optional(),
    dependencies: z.array(FirmwareScheme).optional(),
});

export type Artifact = z.infer<typeof ArtifactScheme>;

export class FirmwareClient extends ArtifactoryClient {
    protected DATADIR: string;

    constructor(
        server: string = 'files.nordicsemi.com',
        repo: string = 'swtools',
        dir: string = getAppDataDir(),
    ) {
        dir = resolve(dir);
        super(server, repo, join(dir, 'firmware'));
        this.DATADIR = dir;
    }

    protected async saveSource(source: Artifact[]): Promise<void> {
        await mkdir(this.DATADIR, { recursive: true });
        await writeFile(
            join(this.DATADIR, 'source.json'),
            JSON.stringify(source, null, 2),
            'utf-8',
        );
    }

    public async loadSource(): Promise<Artifact[]> {
        try {
            const content = await readFile(
                join(this.DATADIR, 'source.json'),
                'utf-8',
            );
            return z
                .array(FirmwareScheme)
                .parse(JSON.parse(content)) as Artifact[];
        } catch (e) {
            console.error(`Error loading cache source file, got error: ${e}`);
            return [];
        }
    }

    protected async putSource(fw: Artifact): Promise<void> {
        if (fw.version === undefined) {
            throw new Error('sourced artifact needs version');
        }
        const source = await this.loadSource();
        source.push(fw);
        await this.saveSource(source);
    }

    protected async searchFirmware(
        fw: Artifact,
        allVersions?: boolean,
    ): Promise<AResponse> {
        const diffProps: AQueryProps[] = fw.device.map(d =>
            mapToQueryProps({ ...fw, device: [d] }, allVersions),
        );

        const deviceSearches: AResponse[] = await Promise.all(
            diffProps.map(props => this.searchArtifactory(props)),
        );

        const out: AResponse = [];
        deviceSearches.forEach(results =>
            results.forEach(item => {
                if (!out.map(f => f.path).includes(item.path)) {
                    out.push(item);
                }
            }),
        );

        return out;
    }

    public async getFirmware(fw: Artifact): Promise<Artifact> {
        const cachedSource = await this.loadSource();

        const cachedFirmware = cachedSource.find(f => isSameArtifact(f, fw));

        const upstreamFirmware = await this.fetchFirmware(fw);

        if (cachedFirmware !== undefined) {
            if (upstreamFirmware.version === cachedFirmware.version) {
                if (cachedFirmware.file === undefined) {
                    throw new Error('cachedFirmware did not contain path');
                }

                console.log(
                    `Returning firmware ${cachedFirmware.name} from cache`,
                );
                return cachedFirmware;
            }
        }

        console.log(
            `Downloading firmware ${upstreamFirmware.name} from artifactory`,
        );

        return await this.downloadFirmware(upstreamFirmware);
    }

    public async deleteFirmware(fw: Artifact): Promise<void> {
        let source = await this.loadSource();

        const toRemove = source.filter(f => isSameArtifact(f, fw));

        await Promise.all(
            toRemove.map(async f => {
                if (f.file === undefined) {
                    console.error(
                        `Failed to delete firmware ${f}: no file specified in source`,
                    );
                    return;
                }
                await unlink(f.file).catch(err => {
                    console.warn(`Failed to delete file ${f.file}:`, err);
                });
            }),
        );

        source = source.filter(f => isSameArtifact(f, fw));

        await this.saveSource(source);
    }

    public async clearCache(): Promise<void> {
        const source = await this.loadSource();
        await Promise.all(
            source.map(f =>
                f.file ? unlink(f.file).catch(() => {}) : undefined,
            ),
        );
        await this.saveSource([]);
    }

    public async searchVersions(fw: Artifact): Promise<string[]> {
        const alternatives = await this.searchFirmware(fw, true);

        return alternatives.map(f => f.properties.version[0]);
    }

    protected async downloadFirmware(f: Artifact): Promise<Artifact> {
        if (!f.file) {
            throw new Error(
                'NetworkFirmware should contain download path at this point',
            );
        }

        if (!f.version) {
            throw new Error(
                'NetworkFirmware should contain version at this point',
            );
        }

        await this.downloadArtifactFromUrl(f.file);
        const path = filenameFromUrl(f.file);

        const outFirmware: Artifact = {
            ...f,
            file: join(this.DIR, path),
            version: f.version,
        };

        await this.putSource(outFirmware);

        return outFirmware;
    }

    protected async fetchApplication(fw: Artifact): Promise<Artifact[]> {
        const ins: Artifact[] = [fw];

        if (fw.dependencies) {
            fw.dependencies.forEach(f => ins.push(f));
        }

        const out: Artifact[] = await Promise.all(
            ins.map(f => this.fetchFirmware(f)),
        );

        return out;
    }

    protected async fetchFirmware(fw: Artifact): Promise<Artifact> {
        const res = await this.searchArtifactory(mapToQueryProps(fw));

        if (res.length === 0) {
            throw new Error(`No artifact found for ${fw.name} (${fw.type})`);
        }
        if (res.length > 1) {
            console.error(`Multiple matches for ${fw}, trying first`);
        }

        return await this.mapToArtifact(res);
    }

    protected async mapToArtifact(res: AResponse): Promise<Artifact> {
        if (res.length !== 1) {
            throw new Error('Expect one artifact at a time');
        }
        const r = res[0];

        let outFirmware: Artifact = {
            name: r.properties.name[0],
            type: TypeScheme.parse(r.properties.type[0]),
            version: r.properties.version[0],
            device: r.properties.device,
            file: this.downloadUrl(r.path),
        };

        if (r.properties.dependencyfile[0]) {
            let depprops: AQueryProps = {
                name: r.properties.dependencyfile[0],
                type: 'Dependency',
            };

            if (outFirmware.version) {
                depprops = { version: outFirmware.version, ...depprops };
            } else {
                depprops = { latest: 'true', ...depprops };
            }

            const depsearch = await this.searchArtifactory(depprops);

            const url = this.downloadUrl(depsearch[0].path);

            const depfile = z
                .array(FirmwareScheme)
                .parse(await this.downloadArtifactFromUrl(url));

            outFirmware = { ...outFirmware, dependencies: depfile };
        }
        return outFirmware;
    }
}

function mapToQueryProps(fw: Artifact, allVersions?: boolean): AQueryProps {
    const props: AQueryProps = {
        name: fw.name,
        device: fw.device[0],
        type: fw.type,
    };

    if (allVersions) return props;
    if (fw.version) props.version = fw.version;
    else props.latest = 'true';

    return props;
}

function isSameArtifact(i: Artifact, j: Artifact): boolean {
    return (
        i.name === j.name &&
        i.device.every(d => j.device.includes(d)) &&
        i.type === j.type &&
        (i.version === j.version ||
            j.version === undefined ||
            i.version === undefined)
    );
}
