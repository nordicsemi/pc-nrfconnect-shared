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

export const TypeScheme = z.enum(['Modem', 'Network', 'Application']);

export const ArtifactScheme = z.object({
    name: z.string(), // Identifier associated with functionality (not version or device)
    version: z.string().optional(), // undefined will usually be understood as "latest is requested"
    type: TypeScheme, // Max one of each per flash (cant have two Modems on one device at a time)
    device: z.array(z.string()), // Some firmwares support multiple devices (this should be called devices)
    file: z.string().optional(), // Absolute path or download url
});

export const FirmwareScheme = ArtifactScheme.extend({
    title: z.string().optional(),
    description: z.string().optional(),
    documentation: z
        .union([z.string(), z.object({ label: z.string(), href: z.string() })])
        .optional(),
    dependencies: z.array(ArtifactScheme).optional(),
});

export const SourceScheme = FirmwareScheme.extend({
    file: z.string(), // Sometimes a url or file path is REQUIRED
    version: z.string(), // -- || --
});

export type Firmware = z.infer<typeof FirmwareScheme>;
export type Source = z.infer<typeof SourceScheme>;

export class FirmwareClient {
    protected DATADIR: string;
    protected CLIENT: ArtifactoryClient;
    protected FIRMWAREDIR: string;

    constructor(
        server: string = 'files.nordicsemi.com',
        repo: string = 'swtools',
        dir: string = getAppDataDir(),
    ) {
        this.DATADIR = resolve(dir);
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
        try {
            const content = await readFile(
                join(this.DATADIR, 'source.json'),
                'utf-8',
            );
            return z.array(SourceScheme).parse(JSON.parse(content));
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
            console.error(`Corrupt firmware cache, resetting: ${String(e)}`);
            await this.saveSource([]);
            return [];
        }
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
        const diffProps: AQueryProps[] = fw.device.map(d =>
            mapToQueryProps({ ...fw, device: [d] }, allVersions),
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

    public async getFirmware(fw: Firmware): Promise<Firmware> {
        const cachedSource = await this.loadSource();

        const cachedFirmware = cachedSource.find(isSameFirmware(fw));

        if (cachedFirmware && fw.version) return cachedFirmware;

        const upstreamFirmware = await this.fetchFirmware(fw);

        if (
            cachedFirmware &&
            upstreamFirmware.version === cachedFirmware.version
        ) {
            console.log(`Returning firmware ${cachedFirmware.name} from cache`);
            return cachedFirmware;
        }

        console.log(
            `Downloading firmware ${upstreamFirmware.name} from artifactory`,
        );

        return await this.downloadFirmware(upstreamFirmware);
    }

    public async getFirmwareWithDeps(fw: Firmware): Promise<Firmware[]> {
        const all = [fw, ...(fw.dependencies ?? [])];
        return await Promise.all(all.map(f => this.getFirmware(f)));
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
    }): Promise<Firmware[]> {
        const props: AQueryProps = { latest: 'true' };
        if (filter.type) props.type = filter.type;
        if (filter.device) props.device = filter.device;

        const res = await this.CLIENT.searchArtifactory(props);
        const artifacts = await this.mapToFirmwareFormat(res);

        const unique = new Map<string, Firmware>();
        artifacts.forEach(a => unique.set(`${a.name}:${a.type}`, a));
        return [...unique.values()];
    }

    protected async downloadFirmware(f: Source): Promise<Source> {
        await this.CLIENT.downloadArtifactFromUrl(f.file);
        const path = filenameFromUrl(f.file);

        const outFirmware: Source = {
            ...f,
            file: join(this.FIRMWAREDIR, path),
        };

        await this.putSource(outFirmware);

        return outFirmware;
    }

    protected async fetchFirmware(fw: Firmware): Promise<Source> {
        const res = await this.CLIENT.searchArtifactory(mapToQueryProps(fw));
        if (res.length === 0) {
            throw new Error(`No artifact found for ${fw.name} (${fw.type})`);
        }
        if (res.length > 1) {
            console.error(
                `Multiple firmwares found for query ${JSON.stringify(fw)}, trying first index`,
            );
        }
        return (await this.mapToFirmwareFormat(res))[0];
    }

    protected mapToFirmwareFormat(res: AResponse): Promise<Source[]> {
        return Promise.all(
            res.map(async r => {
                let outFirmware: Source = {
                    name: r.properties.name[0],
                    type: TypeScheme.parse(r.properties.type[0]),
                    version: r.properties.version[0],
                    device: r.properties.device,
                    file: this.CLIENT.downloadUrl(r.path),
                };

                if (r.properties.dependencyfile?.[0]) {
                    let depprops: AQueryProps = {
                        name: r.properties.dependencyfile[0],
                        type: 'Dependency',
                    };

                    if (outFirmware.version) {
                        depprops = {
                            version: outFirmware.version,
                            ...depprops,
                        };
                    } else {
                        depprops = { latest: 'true', ...depprops };
                    }

                    const depsearch =
                        await this.CLIENT.searchArtifactory(depprops);

                    if (depsearch.length === 0) {
                        throw new Error(
                            `Dependency manifest '${r.properties.dependencyfile[0]}' not found for ${r.properties.name[0]}`,
                        );
                    }

                    const depfile = z
                        .array(SourceScheme)
                        .parse(
                            await this.CLIENT.fetchJsonFromPath(
                                depsearch[0].path,
                            ),
                        );

                    outFirmware = { ...outFirmware, dependencies: depfile };
                }
                return outFirmware;
            }),
        );
    }
}

function mapToQueryProps(fw: Firmware, allVersions?: boolean): AQueryProps {
    const props: AQueryProps = {
        name: fw.name,
        type: fw.type,
        device: fw.device[0],
    };

    if (allVersions) return props;
    if (fw.version) props.version = fw.version;
    else props.latest = 'true';

    return props;
}

export const isSameFirmware = (i: Firmware) => (j: Firmware) =>
    i.name === j.name &&
    i.device.every(d => j.device.includes(d)) &&
    i.type === j.type &&
    (i.version === j.version ||
        j.version === undefined ||
        i.version === undefined);

export const compareVersionDesc = (n: string, m: string): number => {
    const parse = (v: string) => v.split('.').map(p => Number.parseInt(p, 10));
    const nList = parse(n);
    const mList = parse(m);

    for (let i = 0; i < Math.max(nList.length, mList.length); i += 1) {
        const a = nList[i] ?? 0;
        const b = mList[i] ?? 0;
        if (Number.isNaN(a) || Number.isNaN(b)) return n.localeCompare(m);
        if (a !== b) return b - a;
    }
    return 0;
};
