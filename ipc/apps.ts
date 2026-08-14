/*
 * Copyright (c) 2022 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { handle, invoke } from './infrastructure/rendererToMain';
import type {
    AppVersions,
    NrfutilModules,
    NrfutilModuleVersion,
    UrlString,
} from './MetaFiles';
import { LOCAL, type SourceName } from './sources';

export interface AppSpec {
    name: string;
    source: SourceName;
}

interface BaseApp {
    name: string;
    displayName: string;
    description: string;
    iconPath: string;
}

interface Downloadable {
    source: SourceName;
    homepage?: UrlString;
    versions?: AppVersions;
    releaseNotes?: string;
    latestVersion: string;
}

interface Installed {
    currentVersion: string;
    engineVersion?: string;
    repositoryUrl?: UrlString;
    html?: string;
    nrfutil?: NrfutilModules;
    nrfutilCore?: NrfutilModuleVersion;
    autoUpdate?: boolean;
    fixedSize?: {
        width: number;
        height: number;
    };
    installed: {
        publishTimestamp?: string;
        path: string;
        shasum?: string;
    };
}

export interface LocalApp extends Installed, BaseApp {
    source: typeof LOCAL;
}

export interface InstalledDownloadableApp
    extends BaseApp,
        Installed,
        Downloadable {
    isWithdrawn: false;
}

export interface UninstalledDownloadableApp extends BaseApp, Downloadable {
    isWithdrawn: false;
}

export interface WithdrawnApp extends BaseApp, Installed, Downloadable {
    isWithdrawn: true;
}

export type DownloadableApp =
    | InstalledDownloadableApp
    | UninstalledDownloadableApp
    | WithdrawnApp;

export type LaunchableApp = LocalApp | InstalledDownloadableApp | WithdrawnApp;

export type App = LocalApp | DownloadableApp;

export const channel = {
    getDownloadableApps: 'apps:get-downloadable-apps',
    installDownloadableApp: 'apps:install-downloadable-app',
};

export const isDownloadable = (app?: App): app is DownloadableApp =>
    app != null && app?.source !== LOCAL;

export const isInstalled = (app?: App): app is LaunchableApp =>
    app != null && 'installed' in app;

export const isWithdrawn = (app?: App): app is WithdrawnApp =>
    isDownloadable(app) && app.isWithdrawn;

const latestVersionHasDifferentChecksum = (app: InstalledDownloadableApp) => {
    const shaOfLatest = app.versions?.[app.latestVersion]?.shasum;
    const shaOfInstalled = app.installed.shasum;

    return (
        shaOfLatest != null &&
        shaOfInstalled != null &&
        shaOfInstalled !== shaOfLatest
    );
};

export const isUpdatable = (app?: App): app is InstalledDownloadableApp =>
    !isWithdrawn(app) &&
    isInstalled(app) &&
    isDownloadable(app) &&
    (app.currentVersion !== app.latestVersion ||
        latestVersionHasDifferentChecksum(app));

// getDownloadableApps
export type GetDownloadableAppsResult = {
    apps: DownloadableApp[];
};

type GetDownloadableApps = () => GetDownloadableAppsResult;

const getDownloadableApps = invoke<GetDownloadableApps>(
    channel.getDownloadableApps,
);
const registerGetDownloadableApps = handle<GetDownloadableApps>(
    channel.getDownloadableApps,
);

// installDownloadableApp
type InstallDownloadableApp = (
    app: DownloadableApp,
    version?: string,
) => DownloadableApp;

const installDownloadableApp = invoke<InstallDownloadableApp>(
    channel.installDownloadableApp,
);
const registerInstallDownloadableApp = handle<InstallDownloadableApp>(
    channel.installDownloadableApp,
);

export const forRenderer = {
    registerGetDownloadableApps,
    registerInstallDownloadableApp,
};

export const inMain = {
    getDownloadableApps,
    installDownloadableApp,

    isDownloadable,
    isInstalled,
    isWithdrawn,
    isUpdatable,
};
