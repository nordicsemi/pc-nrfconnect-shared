#!/usr/bin/env tsx

/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

/* eslint-disable max-classes-per-file, class-methods-use-this */

import { execSync } from 'child_process';
import { Option, program } from 'commander';
import fs from 'fs';
import LowlevelFtpClient from 'ftp';
import semver from 'semver';
import calculateShasum from 'shasum';

import { type AppInfo, type SourceJson } from '../ipc/MetaFiles';
import { type PackageJsonApp } from '../ipc/schema/packageJson';
import checkAppProperties from './check-app-properties';

interface App {
    filename: string;
    name: string;
    version: string;
    shasum: string;
    sourceUrl: string;
    appInfoName: string;
    releaseNotesFilename: string;
    iconFilename: string;
    isOfficial: boolean;
    packageJson: PackageJsonApp;
}

let client: Client;

abstract class Client {
    abstract sourceUrl: string;

    initialise(options: Options): Promise<void> | void {} // eslint-disable-line no-empty-function,@typescript-eslint/no-unused-vars
    abstract end(): void;

    abstract download(filename: string): Promise<string>;
    abstract uploadContent(
        content: Buffer<ArrayBuffer>,
        remoteFilename: string,
    ): Promise<void>;
    abstract uploadLocalFile(
        localFilename: string,
        remoteFilename: string,
    ): Promise<void>;
}

class FtpClient extends Client {
    /*
     * To use this script with an FTP server REPO_HOST, REPO_USER and REPO_PASS need to be set
     */

    ftpClient = new LowlevelFtpClient();

    host = process.env.REPO_HOST || 'localhost';
    port = Number(process.env.REPO_PORT) || 21;
    user = process.env.REPO_USER || 'anonymous';
    password = process.env.REPO_PASS || 'anonymous@';

    sourceDir: string;
    sourceUrl: string;

    constructor(private readonly options: Options) {
        super();
        this.sourceDir = this.getSourceDir();
        this.sourceUrl = this.getSourceUrl();
    }

    getSourceDir = () => {
        const repoDirOfficial = '/.pc-tools/nrfconnect-apps';

        if (process.env.REPO_DIR) return process.env.REPO_DIR;
        if (this.options.deployOfficial) return repoDirOfficial;

        return `${repoDirOfficial}/${this.options.source}`;
    };

    getSourceUrl = () => {
        if (process.env.REPO_URL) return process.env.REPO_URL;
        return `https://developer.nordicsemi.com${this.sourceDir}`;
    };

    connect = () =>
        new Promise<void>((resolve, reject) => {
            console.log(
                `Connecting to ftp://${this.user}@${this.host}:${this.port}`,
            );
            this.ftpClient.once('error', err => {
                this.ftpClient.removeAllListeners('ready');
                reject(err);
            });
            this.ftpClient.once('ready', () => {
                this.ftpClient.removeAllListeners('error');
                resolve();
            });
            this.ftpClient.connect({
                host: this.host,
                port: this.port,
                user: this.user,
                password: this.password,
            });
        });

    changeWorkingDirectory = () =>
        new Promise<void>((resolve, reject) => {
            console.log(`Changing to directory ${this.sourceDir}`);
            this.ftpClient.cwd(this.sourceDir, err => {
                if (err) {
                    reject(
                        new Error(
                            '\nError: Failed to change to directory. ' +
                                'Check whether it exists on the FTP server.',
                        ),
                    );
                } else {
                    resolve();
                }
            });
        });

    initialise = async () => {
        await this.connect();
        await this.changeWorkingDirectory();
    };

    download = (filename: string) =>
        new Promise<string>((resolve, reject) => {
            console.log(`Downloading file ${filename}`);
            let data = '';
            this.ftpClient.get(filename, (err, stream) => {
                if (err) return reject(err);
                stream.once('close', () => resolve(data));
                stream.on('data', chunk => {
                    data += chunk;
                });
                return undefined;
            });
        });

    upload = (
        contentOrLocalFilename: string | Buffer,
        remoteFilename: string,
    ) =>
        new Promise<void>((resolve, reject) => {
            console.log(`Uploading file ${remoteFilename}`);
            this.ftpClient.put(contentOrLocalFilename, remoteFilename, err =>
                err ? reject(err) : resolve(),
            );
        });

    uploadContent = this.upload;
    uploadLocalFile = this.upload;

    end = () => this.ftpClient.end();
}

class ArtifactoryClient extends Client {
    token = process.env.ARTIFACTORY_TOKEN;

    folderName: string;

    sourceUrl: string;
    uploadUrl: string;
    cacheUrl: string;

    filesWhereCacheZappingFailed: string[] = [];

    constructor(private readonly options: Options) {
        super();

        if (this.token == null) {
            throw new Error(
                'The environment variable ARTIFACTORY_TOKEN must be set.',
            );
        }

        this.folderName = `${this.getAccessLevel()}/ncd/apps/${options.source}`;

        this.uploadUrl = `https://files.nordicsemi.com/artifactory/swtools/${this.folderName}`;
        this.sourceUrl = `https://files.nordicsemi.com/ui/api/v1/download?isNativeBrowsing=false&repoKey=swtools&path=${this.folderName}`;
        this.cacheUrl = `https://files.nordicsemi.cn/artifactory/swtools-cache/${this.folderName}`;
    }

    getAccessLevel = () => {
        if (this.options.accessLevel != null) return this.options.accessLevel;

        return this.options.deployOfficial ? 'external' : 'internal';
    };

    download = async (filename: string) => {
        console.log(`Downloading ${filename}`);

        const url = `${this.sourceUrl}/${filename}`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${this.token}` },
        });

        if (!res.ok) {
            throw new Error(`Failed to download ${url}: ${res.statusText}`);
        }

        return res.text();
    };

    zapCache = async (filename: string) => {
        const url = `${this.cacheUrl}/${filename}`;
        const res = await fetch(url, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${this.token}` },
        });

        /* 404 is ok, which happens if the file does not exist on the cache
           server. Can happen when it is new or was not cached yet */
        if (res.ok || res.status === 404) return;

        this.filesWhereCacheZappingFailed.push(
            `${this.folderName}/${filename}`,
        );
    };

    upload = async (content: Buffer<ArrayBuffer>, remoteFilename: string) => {
        const url = `${this.uploadUrl}/${remoteFilename}`;
        console.log('--> url upload', url);
        const res = await fetch(url, {
            method: 'PUT',
            body: content,
            headers: { Authorization: `Bearer ${this.token}` },
        });

        console.log('--> res', JSON.stringify(res));

        if (!res.ok) {
            throw new Error(`Failed to upload ${url}: ${res.statusText}`);
        }

        await this.zapCache(remoteFilename);
    };

    uploadContent = (content: Buffer<ArrayBuffer>, remoteFilename: string) => {
        console.log(`Uploading content for ${remoteFilename}`);

        return this.upload(content, remoteFilename);
    };

    uploadLocalFile = (localFilename: string, remoteFilename: string) => {
        console.log(
            `Uploading local file ${localFilename} as ${remoteFilename}`,
        );

        return this.upload(fs.readFileSync(localFilename), remoteFilename);
    };

    end = () => {
        if (this.filesWhereCacheZappingFailed.length > 0) {
            console.warn(
                `\nCache zapping failed for these files, probably because your Artifactory token lacks permission for it:`,
            );
            this.filesWhereCacheZappingFailed.forEach(file => {
                console.warn(`- ${file}`);
            });

            console.warn(
                '\nGo to https://github.com/nordicsemi/pc-nrfconnect-shared/actions/workflows/zap-cache.yml, run the workflow and paste this string as the list of paths to zap them manually:',
            );
            console.warn('  ', this.filesWhereCacheZappingFailed.join(', '));
        }
    };
}

const hasMessage = (error: unknown): error is { message: unknown } =>
    error != null && typeof error === 'object' && 'message' in error;

const errorAsString = (error: unknown) =>
    hasMessage(error) ? error.message : String(error);

const validAccessLevels = [
    'external',
    'external-confidential',
    'internal',
    'internal-confidential',
] as const;

type AccessLevel = (typeof validAccessLevels)[number];

const isAccessLevel = (value: string): value is AccessLevel =>
    (validAccessLevels as readonly string[]).includes(value);

const splitSourceAndAccessLevel = (sourceAndMaybeAccessLevel: string) => {
    const match = sourceAndMaybeAccessLevel.match(
        /(?<source>.*?)\s*\((?<accessLevel>.*)\)/,
    );

    if (match == null) {
        return { source: sourceAndMaybeAccessLevel };
    }

    const { source, accessLevel } = match.groups!; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- Can never be null because of the regex

    if (!isAccessLevel(accessLevel)) {
        throw new Error(
            `The specified access level "${accessLevel}" must be one of ${validAccessLevels.join(
                ', ',
            )}.`,
        );
    }

    return { source, accessLevel };
};

interface Options {
    doPack: boolean;
    deployOfficial: boolean;
    source: string;
    sourceName?: string;
    destination: 'ftp' | 'artifactory';
    accessLevel?: AccessLevel;
}

const parseOptions = (): Options => {
    program
        .description('Publish an nRF Connect for Desktop app')
        .requiredOption(
            '-s, --source <source>',
            'Specify the source to publish (e.g. "official" or "releast-test"). ' +
                'When publishing to Artifactory, an access level can be ' +
                'specified at the end in parantheses (e.g. "official (external)").',
        )
        .addOption(
            new Option(
                '-d, --destination <ftp|artifactory>',
                'Specify where to publish.',
            )
                .choices(['ftp', 'artifactory'])
                .makeOptionMandatory(),
        )
        .option(
            '-n, --no-pack',
            'Publish existing .tgz file at the root directory without npm pack.',
        )
        .parse();

    const options = program.opts();

    const { source, accessLevel } = splitSourceAndAccessLevel(options.source);

    const deployOfficial = source === 'official';

    return {
        doPack: options.pack,
        source,
        deployOfficial,
        destination: options.destination,
        accessLevel,
    };
};

const readPackageJson = (): PackageJsonApp =>
    JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

const packPackage = () => {
    console.log('Packing current package');
    execSync('npm pack');
};

const ensurePackageExists = (filename: string) => {
    if (!fs.existsSync(filename)) {
        throw new Error(`Package \`${filename}\` to publish is not found`);
    }
};

const getShasum = (filePath: string) => {
    try {
        return calculateShasum(fs.readFileSync(filePath));
    } catch (error) {
        throw new Error(
            `Unable to read file when verifying shasum: ${filePath}. \nError: ${errorAsString(
                error,
            )}`,
        );
    }
};

const packOrReadPackage = (options: Options): App => {
    const packageJson = readPackageJson();
    const { name, version } = packageJson;
    const filename = `${name}-${version}.tgz`;

    if (options.doPack) {
        packPackage();
    } else {
        ensurePackageExists(filename);
    }
    const shasum = getShasum(filename);

    console.log(`Package name: ${name} version: ${version}`);

    return {
        name,
        version,
        filename,
        shasum,
        sourceUrl: client.sourceUrl,
        isOfficial: options.deployOfficial,
        appInfoName: `${name}.json`,
        releaseNotesFilename: `${name}-Changelog.md`,
        iconFilename: `${name}.svg`,
        packageJson,
    };
};

const assertAppVersionIsValid = (
    latestAppVersion: string | undefined,
    app: App,
) => {
    if (latestAppVersion != null) {
        console.log(`Latest published version ${latestAppVersion}`);

        if (semver.lte(app.version, latestAppVersion) && app.isOfficial) {
            throw new Error(
                'Current package version cannot be published, bump it higher',
            );
        }
    }
};

const downloadSourceJson = async () => {
    let sourceJsonContent;
    try {
        sourceJsonContent = await client.download('source.json');
        const sourceJson = <SourceJson>JSON.parse(sourceJsonContent);
        if (
            sourceJson == null ||
            typeof sourceJson !== 'object' ||
            sourceJson.name == null ||
            (sourceJson.apps !== undefined && !Array.isArray(sourceJson.apps))
        ) {
            throw new Error(
                '`source.json` does not have the expected content.',
            );
        }

        return sourceJson;
    } catch (error) {
        const message = 'Unable to read `source.json` on the server.\nError: ';
        const caughtError = errorAsString(error);
        const maybeSourceJsonContent =
            sourceJsonContent == null
                ? ''
                : `Content: \`${sourceJsonContent}\``;

        throw new Error(message + caughtError + maybeSourceJsonContent);
    }
};

const getUpdatedSourceJson = async (app: App): Promise<SourceJson> => {
    const sourceJson = await downloadSourceJson();
    return {
        ...sourceJson,
        apps: [
            ...new Set(sourceJson.apps).add(
                `${app.sourceUrl}/${app.appInfoName}`,
            ),
        ].sort(),
    };
};

const downloadExistingAppInfo = async (
    app: App,
): Promise<Partial<Pick<AppInfo, 'latestVersion' | 'versions'>>> => {
    try {
        const appInfoContent = await client.download(app.appInfoName);
        return JSON.parse(appInfoContent) as AppInfo;
    } catch (error) {
        console.log(
            `No previous app versions found due to: ${errorAsString(error)}`,
        );

        return {};
    }
};

const failBecauseOfMissingProperty = () => {
    throw new Error(
        'This must never happen, because the properties were already checked before',
    );
};

const getUpdatedAppInfo = async (app: App): Promise<AppInfo> => {
    const oldAppInfo = await downloadExistingAppInfo(app);

    assertAppVersionIsValid(oldAppInfo.latestVersion, app);

    const {
        name,
        displayName,
        description,
        homepage,
        version,
        nrfConnectForDesktop,
    } = app.packageJson;

    const nrfutilModules = nrfConnectForDesktop?.nrfutil;
    const nrfutilCore = nrfConnectForDesktop?.nrfutilCore;

    return {
        name,
        displayName: displayName ?? failBecauseOfMissingProperty(),
        description: description ?? failBecauseOfMissingProperty(),
        homepage,
        iconUrl: `${app.sourceUrl}/${app.iconFilename}`,
        releaseNotesUrl: `${app.sourceUrl}/${app.releaseNotesFilename}`,
        latestVersion: version,
        versions: {
            ...oldAppInfo.versions,
            [version]: {
                tarballUrl: `${app.sourceUrl}/${app.filename}`,
                publishTimestamp: new Date().toISOString(),
                shasum: app.shasum,
                nrfutilModules,
                nrfutilCore,
            },
        },
    };
};

const uploadSourceJson = (sourceJson: SourceJson) =>
    client.uploadContent(
        Buffer.from(JSON.stringify(sourceJson, undefined, 2)),
        'source.json',
    );

const uploadAppInfo = (app: App, appInfo: AppInfo) =>
    client.uploadContent(
        Buffer.from(JSON.stringify(appInfo, undefined, 2)),
        app.appInfoName,
    );

const uploadPackage = (app: App) =>
    client.uploadLocalFile(app.filename, app.filename);

const uploadChangelog = (app: App) => {
    const changelogFilename = 'Changelog.md';
    if (!fs.existsSync(changelogFilename)) {
        const errorMsg = `There should be a changelog called "${changelogFilename}". Please provide it!`;
        return Promise.reject(new Error(errorMsg));
    }

    return client.uploadLocalFile(changelogFilename, app.releaseNotesFilename);
};

const uploadIcon = (app: App) => {
    const localIconFilename = 'resources/icon.svg';
    if (!fs.existsSync(localIconFilename)) {
        const errorMsg = `There must be an icon called "${localIconFilename}". Please provide it!`;
        return Promise.reject(new Error(errorMsg));
    }

    return client.uploadLocalFile(localIconFilename, app.iconFilename);
};

const main = async () => {
    try {
        const options = parseOptions();

        client =
            options.destination === 'ftp'
                ? new FtpClient(options)
                : new ArtifactoryClient(options);

        checkAppProperties({
            checkChangelogHasCurrentEntry: options.deployOfficial,
        });

        const app = packOrReadPackage(options);

        await client.initialise(options);

        const sourceJson = await getUpdatedSourceJson(app);
        const appInfo = await getUpdatedAppInfo(app);

        await uploadChangelog(app);
        await uploadIcon(app);
        await uploadPackage(app);
        await uploadAppInfo(app, appInfo);
        await uploadSourceJson(sourceJson);

        console.log('Done');
    } catch (error) {
        console.error('--> full error', error);
        console.error(errorAsString(error));
        process.exitCode = 1;
    }

    client?.end();
};

main();
