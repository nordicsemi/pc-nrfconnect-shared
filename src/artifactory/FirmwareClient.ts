/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { z } from 'zod';

import { getAppDataDir } from '../utils/appDirs';
import {
    type AQueryProps,
    type AResponse,
    ArtifactoryClient,
} from './ArtifactoryClient';

export const TypeScheme = z.union([
    z.literal('Modem'),
    z.literal('Network'),
    z.literal('Application'),
]);

export const FirmwareScheme = z.object({
    name: z.string(), // Identifier associated with functionality (not version or device)
    version: z.string(),
    type: TypeScheme, // Max one of each per flash (cant have two Modems on one device at a time)
    device: z.array(z.string()), // Some firmwares support multiple devices (this should be called devices)
    file: z.string(), // Absolute path
});

export const NetworkScheme = FirmwareScheme.extend({
    version: z.string().optional(), // version being undefined assumes latest is requested
    file: z.string().optional(), // Download url if applicable
});

export const ArtifactScheme = NetworkScheme.extend({
    title: z.string().optional(),
    description: z.string().optional(),
    documentation: z
        .union([z.string(), z.object({ label: z.string(), href: z.string() })])
        .optional(),
    dependencies: z.array(NetworkScheme).optional(),
});

export type Firmware = z.infer<typeof FirmwareScheme>;
export type NetworkFirmware = z.infer<typeof NetworkScheme>;
export type Artifact = z.infer<typeof ArtifactScheme>;

export class FirmwareClient extends ArtifactoryClient {
    protected DATADIR: string;
    protected CACHE: boolean = false;

    constructor(
        server: string = 'files.nordicsemi.com',
        repo: string = 'swtools',
        dir: string = getAppDataDir(),
    ) {
        dir = resolve(dir);
        super(server, repo, join(dir, 'firmware'));
        this.DATADIR = dir;
    }

    protected async saveSource(source: Firmware[]): Promise<void> {
        await mkdir(dirname(this.DATADIR), { recursive: true });
        await writeFile(
            join(this.DATADIR, 'source.json'),
            JSON.stringify(source, null, 2),
            'utf-8',
        );
    }

    protected async loadCachedSource(): Promise<Firmware[]> {
        try {
            const content = await readFile(
                join(this.DATADIR, 'source.json'),
                'utf-8',
            );
            return z
                .array(FirmwareScheme)
                .parse(JSON.parse(content)) as Firmware[];
        } catch (e) {
            console.error(`Error loading cache source file, got error: ${e}`);
            return [];
        }
    }

    protected async putSource(fw: Firmware): Promise<void> {
        const source = await this.loadCachedSource();
        source.push(fw);
        await this.saveSource(source);
    }

    public async searchFirmware(fw: NetworkFirmware): Promise<AResponse> {
        if (fw.device === undefined) {
            return await this.searchArtifactory({
                ...fw,
                device: '',
            });
        }

        const deviceSearches: AResponse[] = [];
        fw.device.forEach(async d => {
            deviceSearches.push(
                await this.searchArtifactory({
                    ...fw,
                    device: d,
                }),
            );
        });

        return deviceSearches.flatMap(i => i);
    }

    public async getFile(fw: NetworkFirmware): Promise<Firmware> {
        const cachedSource = await this.loadCachedSource();
        let cachedFirmware;

        if (this.CACHE) {
            cachedFirmware = cachedSource.find(
                f =>
                    f.name === fw.name &&
                    f.device === fw.device &&
                    f.type === fw.type &&
                    (fw.version === undefined || f.version === fw.version),
            );
        } else {
            cachedSource.forEach(f => this.removeSource(f));
        }

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

    public async removeSource(fw: Artifact): Promise<void> {
        let source = await this.loadCachedSource();

        const toRemove = source.filter(
            f =>
                f.name === fw.name &&
                f.device === fw.device &&
                f.type === fw.type &&
                (fw.version === undefined || f.version === fw.version),
        );

        await Promise.all(
            toRemove.map(f =>
                unlink(f.file).catch(err => {
                    console.warn(`Failed to delete file ${f.file}:`, err);
                }),
            ),
        );

        source = source.filter(
            f =>
                !(
                    f.name === fw.name &&
                    f.device === fw.device &&
                    f.type === fw.type &&
                    (fw.version === undefined || f.version === fw.version)
                ),
        );

        await this.saveSource(source);
    }

    public async searchVersions(fw: NetworkFirmware): Promise<string[]> {
        const alternatives = await this.searchFirmware(fw);

        return alternatives.map(f => f.properties.version[0]);
    }

    protected async downloadFirmware(f: NetworkFirmware): Promise<Firmware> {
        if (!f.file) {
            throw new Error('NetworkFirmware did not contain url');
        }
        if (!f.version) {
            throw new Error(
                'NetworkFirmware should contain version at this point',
            );
        }

        await this.downloadArtifactFromUrl(f.file);
        await this.removeSource(f);
        const path = f.file.split('/').pop()?.split('?')[0];
        if (!path) {
            throw new Error(`Could not derive a filename from url: ${f.file}`);
        }

        const outFirmware: Firmware = {
            ...f,
            file: this.absolutePath(path),
            version: f.version,
        };

        await this.putSource(outFirmware);

        return outFirmware;
    }

    protected absolutePath(path: string): string {
        return join(this.DATADIR, 'firmware', path);
    }

    protected fetchApplication(fw: Artifact): NetworkFirmware[] {
        const ins: Artifact[] = [fw];

        const out: NetworkFirmware[] = [];

        if (fw.dependencies) {
            fw.dependencies.forEach(f => ins.push(f));
        }

        ins.forEach(async f => {
            out.push(await this.fetchFirmware(f));
        });

        return out;
    }

    protected async fetchFirmware(fw: Artifact): Promise<Artifact> {
        let props: AQueryProps = {
            name: fw.name,
            device: fw.device[0],
        };

        if (fw.type) {
            props = { type: fw.type, ...props };
        }

        if (fw.version) {
            props = { version: fw.version, ...props };
        } else {
            props = { latest: 'true', ...props };
        }

        const res = await this.searchArtifactory(props);

        if (res.length !== 1) {
            throw new Error('Unexpected artifactory search return');
        }

        let outFirmware: Artifact = {
            name: res[0].properties.name[0],
            type: TypeScheme.parse(res[0].properties.type[0]),
            version: res[0].properties.version[0],
            device: res[0].properties.device,
            file: this.downloadUrl(res[0].path),
        };

        if (res[0].properties.dependencyfile) {
            let depprops: AQueryProps = {
                name: res[0].properties.dependencyfile[0],
                type: 'Dependency',
            };

            if (fw.version) {
                depprops = { version: fw.version, ...depprops };
            } else {
                depprops = { latest: 'true', ...depprops };
            }

            const depsearch = await this.searchArtifactory(depprops);

            const url = this.downloadUrl(depsearch[0].path);

            const depfile = z
                .array(NetworkScheme)
                .parse(await this.downloadArtifactFromUrl(url));

            outFirmware = { ...outFirmware, dependencies: depfile };
        }

        return outFirmware;
    }
}
