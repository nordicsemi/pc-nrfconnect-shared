/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { existsSync } from 'fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { coerce } from 'semver';
import { z } from 'zod';

import { getAppDataDir } from '../utils/appDirs';
import {
    type AQueryProps,
    type AResponse,
    ArtifactoryClient,
    filenameFromUrl,
} from './ArtifactoryClient';

export const TypeScheme = z.enum(['Modem', 'Network', 'Application']);

export const DependencyScheme = z.object({
    name: z.string(),
    version: z.string(),
});

// Used for searching and sorting
export const FirmwareScheme = z.object({
    // name and device lets you uniquely identify each firmware
    name: z.string().min(1), // Identifier associated with functionality (not version or device)
    device: z.array(z.string()).min(1), // Some firmwares support multiple devices (this should be called devices)

    type: TypeScheme.optional(),
    file: z.string().optional(), // Absolute path or download url
    title: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(), // undefined will usually be understood as "latest is requested"
    documentation: z.string().optional(), // link
    dependencies: z.array(DependencyScheme).optional(), // map of name:version
    checksum: z.string().optional(),
});

// Used for caching and validation
export const SourceScheme = FirmwareScheme.extend({
    type: TypeScheme, // Max one of each per flash (cant have two Modems on one device at a time)
    file: z.string(), // When a file is actually in use a file path is REQUIRED
    version: z.string(), // -- || --
});

export type Dependency = z.infer<typeof DependencyScheme>;
export type Firmware = z.infer<typeof FirmwareScheme>;
export type Source = z.infer<typeof SourceScheme>;

export type FirmwareClientProps = {
    server?: string;
    repo?: string;
    directory?: string;
};

export class FirmwareClient {
    protected DATADIR: string;
    protected CLIENT: ArtifactoryClient;
    protected FIRMWAREDIR: string;
    protected VALIDATED?: Promise<void>;

    constructor({
        server = 'files.nordicsemi.com',
        repo = 'swtools',
        directory = getAppDataDir(),
    }: FirmwareClientProps = {}) {
        this.DATADIR = resolve(directory);
        this.FIRMWAREDIR = join(this.DATADIR, 'firmware');
        this.CLIENT = new ArtifactoryClient(server, repo, this.FIRMWAREDIR);
    }

    protected async saveSource(source: Source[]): Promise<void> {
        await mkdir(this.DATADIR, { recursive: true });
        await writeFile(
            join(this.DATADIR, 'source.json'),
            JSON.stringify(source, null, 2),
            'utf-8',
        );
    }

    public async loadSource(): Promise<Source[]> {
        await this.init();
        return this.getSource();
    }

    protected async getSource(): Promise<Source[]> {
        try {
            const content = await readFile(
                join(this.DATADIR, 'source.json'),
                'utf-8',
            );
            return z.array(SourceScheme).parse(JSON.parse(content));
        } catch (e) {
            Promise.all(
                (await readdir(this.FIRMWAREDIR)).map(f =>
                    unlink(join(this.FIRMWAREDIR, f)),
                ),
            );
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
            console.error(
                `Corrupt firmware cache, returning empty: ${String(e)}`,
            );
            return [];
        }
    }

    protected init(): Promise<void> {
        this.VALIDATED ??= this.validateSource();
        return this.VALIDATED;
    }

    protected async validateSource(): Promise<void> {
        await mkdir(this.FIRMWAREDIR, { recursive: true });
        const source = await this.getSource();

        const valid = source.filter(f => existsSync(f.file));
        const paths: string[] = source.map(f => f.file);

        const entries = await readdir(this.FIRMWAREDIR);
        await Promise.all(
            entries
                .filter(f => !paths.includes(join(this.FIRMWAREDIR, f)))
                .map(f => unlink(join(this.FIRMWAREDIR, f))),
        );

        await this.saveSource(valid);
    }

    protected async putSource(fw: Source): Promise<void> {
        const source = await this.loadSource();
        source.push(fw);
        await this.saveSource(source);
    }

    protected async searchFirmware(
        fw: Firmware,
        allVersions?: boolean,
    ): Promise<AResponse> {
        const version = () => {
            if (allVersions) return 'all';
        };

        const diffProps: AQueryProps[] = fw.device.map(d =>
            mapToQueryProps({ ...fw, device: [d] }, version()),
        );
        const deviceSearches: AResponse[] = await Promise.all(
            diffProps.map(props => this.CLIENT.searchArtifactory(props)),
        );

        const seenPaths = new Set<string>();
        const out: AResponse = [];

        deviceSearches.forEach(results =>
            results.forEach(item => {
                if (!seenPaths.has(item.path)) {
                    seenPaths.add(item.path);
                    out.push(item);
                }
            }),
        );

        return out;
    }

    public async getFirmware(fw: Firmware): Promise<Source> {
        const cachedSource = await this.loadSource();

        const cachedFirmware = cachedSource
            .filter(isSameFirmware(fw))
            .sort((a, b) => compareVersionDesc(a.version, b.version))[0];

        if (cachedFirmware && fw.version) return cachedFirmware;

        const upstreamFirmware = await this.fetchFirmware(fw);

        if (
            cachedFirmware &&
            upstreamFirmware.version === cachedFirmware.version
        ) {
            console.log(`Returning firmware ${cachedFirmware.name} from cache`);
            return cachedFirmware;
        }

        const cachedFirmware2 = cachedSource.filter(
            isSameFirmware(upstreamFirmware),
        )[0];

        if (
            cachedFirmware2 &&
            upstreamFirmware.version === cachedFirmware2.version
        ) {
            console.log(`Returning firmware ${cachedFirmware.name} from cache`);
            return cachedFirmware2;
        }

        console.log(
            `Downloading firmware ${upstreamFirmware.name} from artifactory`,
        );

        return await this.downloadFirmware(upstreamFirmware);
    }

    public async getFirmwareWithDeps(fw: Firmware): Promise<Source[]> {
        const fetchedFW: Source = await this.getFirmware(fw);

        let all: Source[] = [fetchedFW];
        if (fetchedFW.dependencies) {
            all = [
                fetchedFW,
                ...(await Promise.all(
                    fetchedFW.dependencies.map(f =>
                        this.getFirmware({ ...f, device: fw.device }),
                    ),
                )),
            ];
        }

        return all;
    }

    public async deleteFirmware(fw: Firmware): Promise<void> {
        const source = await this.loadSource();

        const match = isSameFirmware(fw);
        const toRemove = source.filter(match);
        const toKeep = source.filter(f => !match(f));

        await Promise.all(
            toRemove.map(async f => {
                if (f.file === undefined) {
                    console.error(
                        `Failed to delete firmware ${JSON.stringify(f)}: no file specified in source`,
                    );
                    return;
                }
                await unlink(f.file).catch(err => {
                    console.warn(`Failed to delete file ${f.file}:`, err);
                });
            }),
        );

        await this.saveSource(toKeep);
    }

    public async clearCache(): Promise<void> {
        const source = await this.loadSource();
        await Promise.all(source.map(f => unlink(f.file).catch(() => {})));

        await this.saveSource([]);
    }

    public async searchVersions(fw: Firmware): Promise<string[]> {
        const alternatives = await this.searchFirmware(fw, true);

        return [
            ...new Set(alternatives.map(a => a.properties.version[0])),
        ].sort(compareVersionDesc);
    }

    public async listFirmware(filter: {
        type?: Firmware['type'];
        device?: string;
    }): Promise<Source[]> {
        const props: AQueryProps = { latest: 'true' };
        if (filter.type) props.type = filter.type;
        if (filter.device) props.device = filter.device;

        const res = (await this.CLIENT.searchArtifactory(props)).filter(
            r => r.properties.type[0] !== 'Dependency',
        );
        const artifacts = this.mapToFirmwareFormat(res);

        const unique = new Map<string, Source>();
        artifacts.forEach(a => unique.set(`${a.file}:${a.type}`, a));
        return [...unique.values()];
    }

    protected async downloadFirmware(f: Source): Promise<Source> {
        const valid = await this.CLIENT.downloadArtifactFromUrl(
            f.file,
            f.checksum,
        );

        if (!valid) {
            console.error('invalid checksum'); // TODO add proper error handling
        }

        const path = filenameFromUrl(f.file);

        const outFirmware: Source = {
            ...f,
            file: join(this.FIRMWAREDIR, path),
        };

        await this.putSource(outFirmware);

        return outFirmware;
    }

    public onChecksumFail(handler: () => void) {
        return this.CLIENT.onChecksumFail(handler);
    }

    public async fetchFirmware(
        fw: Firmware,
        latest?: boolean,
    ): Promise<Source> {
        const version = () => {
            if (latest) return 'latest';
        };

        const res = await this.CLIENT.searchArtifactory(
            mapToQueryProps(fw, version()),
        );
        if (res.length === 0) {
            throw new Error(`No artifact found for ${fw.name} (${fw.type})`);
        }
        if (res.length > 1) {
            console.error(
                `Multiple firmwares found for query ${JSON.stringify(fw)}, trying first index`,
            );
        }
        return this.mapToFirmwareFormat(res)[0];
    }

    protected mapToFirmwareFormat(res: AResponse): Source[] {
        return res.map(r => {
            const outFirmware: Source = {
                name: r.properties.name[0],
                type: TypeScheme.parse(r.properties.type[0]),
                version: r.properties.version[0],
                device: r.properties.device,
                file: this.CLIENT.downloadUrl(r.path),
                title: r.properties.title?.[0],
                documentation: r.properties.documentation?.[0],
                description: r.properties.description?.[0],
                checksum: r.checksums.sha256,
            };

            const deps = r.properties.dependencies;

            if (deps) {
                const outDeps: Dependency[] = [];

                deps.forEach(dep => {
                    const d = dep.split(':');

                    outDeps.push({ name: d[0], version: d[1] });
                });

                outFirmware.dependencies = outDeps;
            }
            return outFirmware;
        });
    }
}

export function mapToQueryProps(
    fw: Firmware,
    version: 'latest' | 'all' | 'exact' = 'exact',
): AQueryProps {
    const props: AQueryProps = {
        name: fw.name,
        device: fw.device[0],
    };

    switch (version) {
        case 'all':
            return props;
        case 'latest':
            props.latest = 'true';
            break;
        case 'exact':
            if (!fw.version) props.latest = 'true';
            else props.version = fw.version;
            break;
    }
    return props;
}

export const isSameFirmware = (i: Firmware) => (j: Firmware) =>
    i.name === j.name &&
    j.device.includes(i.device[0]) &&
    // i.device.length === j.device.length &&
    // new Set(i.device).size === new Set([...i.device, ...j.device]).size &&
    (i.version === j.version ||
        j.version === undefined ||
        i.version === undefined);

export const compareVersionDesc = (n: string, m: string): number => {
    const nsem = coerce(n);
    const msem = coerce(m);

    if (!(nsem && msem)) {
        console.error('Semver could not coerce version');
        return 0;
    }

    return msem.compare(nsem);
};
