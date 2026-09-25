/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { createHash } from 'crypto';
import EventEmitter from 'events';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { z } from 'zod';

import logger from '../logging';

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
    protected eventEmitter = new EventEmitter();
    protected TOKEN: string;

    constructor(server: string, repo: string, dir: string, token: string = '') {
        this.DIR = resolve(dir);
        mkdir(this.DIR, { recursive: true });

        this.SERVER = server;
        this.REPO = encodeURIComponent(repo);

        this.TOKEN = token;
    }

    public downloadUrl = (path: string): string =>
        `https://${this.SERVER}/ui/api/v1/download?isNativeBrowsing=false&repoKey=${this.REPO}&path=${encodeURIComponent(path)}`;

    public async downloadArtifactFromPath(
        path: string,
        checksum?: string,
        algorithm: 'md5' | 'sha1' | 'sha256' = 'sha256',
    ): Promise<boolean | null> {
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
    ): Promise<boolean | null> {
        const filename = filenameFromUrl(url);

        const target = join(this.DIR, filename);

        const res = await this.safeFetch(url);

        if (!res) return null;

        const buffer = Buffer.from(await res.arrayBuffer());

        let isValid: boolean = true;

        if (checksum) {
            const actualChecksum = createHash(algorithm)
                .update(buffer)
                .digest('hex');

            isValid = checksum.toLowerCase() === actualChecksum.toLowerCase();
            if (isValid) {
                this.eventEmitter.emit('checksumInvalid');
                unlink(target);
            }
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

    public async searchArtifactory(props: AQueryProps): Promise<AResponse> {
        const url = this.queryUrl(props);
        const res = await this.safeFetch(url, {
            headers: {
                'X-Result-Detail': 'info, properties',
            },
        });

        if (!res) return [];

        const resJson = await res.json();

        const out: AResponse = AResponseScheme.parse(resJson.results);

        return out;
    }

    public async downloadJsonFromPath(path: string): Promise<unknown> {
        const url = this.downloadUrl(path);
        const res = await this.safeFetch(url);
        if (!res) return;
        return res.json();
    }

    protected async safeFetch(
        url: string,
        settings: RequestInit = {},
    ): Promise<Response | null> {
        let res: Response;
        const headers = new Headers(settings.headers);
        headers.set('Authorization', this.TOKEN);

        try {
            res = await fetch(url, {
                ...settings,
                headers,
            });
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') {
                return null;
            }
            logger.error(e);
            if (e instanceof DOMException && e.name === 'TimeoutError') {
                this.eventEmitter.emit('serverError', { url });
            } else {
                this.eventEmitter.emit('networkError', { url });
            }
            return null;
        }

        if (!res.ok) {
            logger.error(`HTTP ${res.status}: ${url}`);
            this.eventEmitter.emit('httpError', { url, status: res.status });
            return null;
        }

        return res;
    }
    public onAnyNetworkFail(handler: () => void) {
        this.eventEmitter.on('networkError', handler);
        this.eventEmitter.on('serverError', handler);
        this.eventEmitter.on('httpError', handler);
        return () => {
            this.eventEmitter.removeListener('networkError', handler);
            this.eventEmitter.removeListener('serverError', handler);
            this.eventEmitter.removeListener('httpError', handler);
        };
    }

    public onUpstreamFail(handler: () => void) {
        this.eventEmitter.on('serverError', handler);
        this.eventEmitter.on('httpError', handler);
        return () => {
            this.eventEmitter.removeListener('serverError', handler);
            this.eventEmitter.removeListener('httpError', handler);
        };
    }

    public onNetworkFail(handler: () => void) {
        this.eventEmitter.on('networkError', handler);
        return () => {
            this.eventEmitter.removeListener('networkError', handler);
        };
    }

    public onChecksumFail(handler: () => void) {
        this.eventEmitter.on('checksumInvalid', handler);
        return () => {
            this.eventEmitter.removeListener('checksumInvalid', handler);
        };
    }

    public setServer(server: string): void {
        this.SERVER = server;
    }

    public getServer(): string {
        return this.SERVER;
    }

    public setRepo(repo: string): void {
        this.REPO = encodeURIComponent(repo);
    }

    public getRepo(): string {
        return this.REPO;
    }

    public setDir(dir: string): void {
        this.DIR = resolve(dir);
        mkdir(this.DIR);
    }

    public getDir(): string {
        return this.DIR;
    }

    public setToken(token: string): void {
        this.TOKEN = token;
    }
}

export function filenameFromUrl(url: string): string {
    const path = new URL(url).searchParams.get('path');
    const name = path?.split('/').pop();
    if (!name) throw new Error(`Could not derive a filename from url: ${url}`);
    return name;
}
