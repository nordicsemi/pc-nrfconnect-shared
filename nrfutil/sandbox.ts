/*
 * Copyright (c) 2023 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { exec, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import treeKill from 'tree-kill';

import describeError from '../src/logging/describeError';
import telemetry from '../src/telemetry/telemetry';
import { isDevelopment } from '../src/utils/environment';
import CollectingResultParser from './collectingResultParser';
import {
    collectErrorMessages,
    convertNrfutilProgress,
    parseJsonBuffers,
} from './common';
import { createDisposableTempDir } from './fs';
import { getNrfutilLogger } from './nrfutilLogger';
import type {
    BackgroundTask,
    LogLevel,
    LogMessage,
    NrfutilJson,
    OnProgress,
    OnTaskBegin,
    OnTaskEnd,
} from './sandboxTypes';
import {
    coreVersionsToInstall,
    type ModuleVersion,
    versionToInstall,
} from './version/moduleVersion';

const CORE_VERSION_FOR_LEGACY_APPS = '8.1.1';

export const getTriplet = () => {
    switch (process.platform) {
        case 'darwin':
            return process.arch === 'arm64'
                ? 'aarch64-apple-darwin'
                : 'x86_64-apple-darwin';
        case 'linux':
            return process.arch === 'arm64'
                ? 'aarch64-unknown-linux-gnu'
                : 'x86_64-unknown-linux-gnu';
        case 'win32':
            return 'x86_64-pc-windows-msvc';
        default:
            throw new Error(`Unsupported platform: ${process.platform}`);
    }
};

export class NrfutilSandbox {
    private readonly onLoggingHandlers: ((
        logging: LogMessage,
        pid?: number,
    ) => void)[] = [];
    private logLevel: LogLevel = isDevelopment ? 'error' : 'off';

    private readonly sandboxPath;
    private readonly env;
    private readonly coreVersion;

    public static async create(
        baseDir: string,
        module: string,
        version?: string,
        coreVersion?: string,
        onProgress?: OnProgress,
    ) {
        const sandbox = new NrfutilSandbox(
            baseDir,
            module,
            versionToInstall(module, version),
            coreVersionsToInstall(coreVersion),
        );

        onProgress?.(convertNrfutilProgress({ progressPercentage: 0 }));

        if (!(await sandbox.isSandboxInstalled())) {
            await sandbox.prepareSandbox(onProgress);
        }

        onProgress?.(convertNrfutilProgress({ progressPercentage: 100 }));

        return sandbox;
    }

    private constructor(
        private readonly baseDir: string,
        private readonly module: string,
        private readonly version: string,
        coreVersion?: string, // Must only be undefined when the launcher creates a sandbox for a legacy app, which does not specify the required core version
    ) {
        this.sandboxPath = path.join(
            this.baseDir,
            'nrfutil-sandboxes',
            ...(process.platform === 'darwin' && process.arch !== 'x64'
                ? [process.arch]
                : []),
            ...(coreVersion != null ? [coreVersion] : []),
            this.module,
            this.version,
        );

        this.coreVersion = coreVersion ?? CORE_VERSION_FOR_LEGACY_APPS;
        this.env = this.prepareEnv();
    }

    private prepareEnv() {
        const env = { ...process.env };
        env.NRFUTIL_HOME = this.sandboxPath;
        fs.mkdirSync(env.NRFUTIL_HOME, { recursive: true });

        env.NRFUTIL_EXEC_PATH = path.join(env.NRFUTIL_HOME, 'bin');

        if (
            process.env.NODE_ENV === 'production' &&
            !process.env.NRF_OVERRIDE_NRFUTIL_SETTINGS
        ) {
            delete env.NRFUTIL_BOOTSTRAP_CONFIG_URL;
            delete env.NRFUTIL_BOOTSTRAP_TARBALL_PATH;
            delete env.NRFUTIL_DEVICE_PLUGINS_DIR_FORCE_NRFDL_LOCATION;
            delete env.NRFUTIL_DEVICE_PLUGINS_DIR_FORCE_NRFUTIL_LIBDIR;
            delete env.NRFUTIL_IGNORE_MISSING_SUBCOMMAND;
            delete env.NRFUTIL_LOG;
            delete env.NRFUTIL_PACKAGE_INDEX_URL;
        }

        return env;
    }

    public getModuleVersion = async () => {
        const results = await this.spawnNrfutil<ModuleVersion>(this.module, [
            '--version',
        ]);

        if (results.info.length === 1) {
            return results.info[0];
        }

        throw new Error('Unexpected result');
    };

    public getCoreVersion = async () => {
        const results = await this.spawnNrfutil<ModuleVersion>('--version', []);

        if (results.info.length === 1) {
            return results.info[0];
        }

        throw new Error('Unexpected result');
    };

    public isSandboxInstalled = () =>
        this.executableExists() && this.commandReportsCorrectVersion();

    private log = (message: LogMessage, pid: number | undefined) => {
        this.onLoggingHandlers.forEach(onLogging => onLogging(message, pid));
    };

    private executableExists() {
        return fs.existsSync(
            path.join(
                this.sandboxPath,
                'bin',
                `nrfutil-${this.module}${
                    os.platform() === 'win32' ? '.exe' : ''
                }`,
            ),
        );
    }

    private async commandReportsCorrectVersion() {
        const moduleVersion = await this.getModuleVersion();
        return moduleVersion.version === this.version;
    }

    public prepareSandbox = async (onProgress?: OnProgress) => {
        try {
            // Clean up any residual sandbox from before if any
            if (this.env.NRFUTIL_HOME && fs.existsSync(this.env.NRFUTIL_HOME)) {
                fs.rmSync(this.env.NRFUTIL_HOME, {
                    recursive: true,
                    force: true,
                });
            }
            await this.installNrfUtilCore(onProgress);
            await this.installNrfUtilCommand(onProgress);
        } catch (error) {
            if (this.env.NRFUTIL_HOME && fs.existsSync(this.env.NRFUTIL_HOME)) {
                fs.rmSync(this.env.NRFUTIL_HOME, {
                    recursive: true,
                    force: true,
                });
            }

            throw error;
        }
    };

    private installNrfUtilCore = async (onProgress?: OnProgress) => {
        using tmpDir = createDisposableTempDir();

        const nrfutilTarGzFile = await this.downloadNrfutilTarGz(tmpDir.path);

        await this.install(
            'core',
            this.coreVersion,
            '--version',
            [],
            onProgress,
            undefined,
            undefined,
            undefined,
            env => ({
                ...env,
                NRFUTIL_BOOTSTRAP_TARBALL_PATH: nrfutilTarGzFile,
            }),
        );
    };

    private downloadNrfutilTarGz = async (folder: string) => {
        const baseUrl =
            'https://files.nordicsemi.com/ui/api/v1/download?isNativeBrowsing=true&repoKey=swtools&path=external/nrfutil/packages/nrfutil/';
        const fileName = `nrfutil-${getTriplet()}-${this.coreVersion}.tar.gz`;
        const url = baseUrl + fileName;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }

        const filePath = path.join(folder, fileName);
        fs.writeFileSync(filePath, new DataView(await response.arrayBuffer()));

        return filePath;
    };

    public installNrfUtilCommand = (onProgress?: OnProgress) =>
        this.install(
            this.module,
            this.version,
            'install',
            [`${this.module}=${this.version}`, '--force'],
            onProgress,
        );

    public install = async (
        module: string,
        version: string,
        ...args: Parameters<typeof this.spawnNrfutil>
    ) => {
        try {
            await this.spawnNrfutil(...args);
            getNrfutilLogger()?.info(
                `Successfully installed nrfutil ${module} version: ${version}`,
            );
        } catch (error) {
            const errorMessage = `Error while installing nrfutil ${module} version ${version}: ${describeError(
                error,
            )}`;

            getNrfutilLogger()?.error(errorMessage);
            throw new Error(errorMessage);
        }
    };

    public getNrfutilExePath = () => path.join(this.baseDir, 'nrfutil');

    public spawnNrfutilSubcommand = <Result>(
        command: string,
        args: string[],
        onProgress?: OnProgress,
        onTaskBegin?: OnTaskBegin,
        onTaskEnd?: OnTaskEnd<Result>,
        controller?: AbortController,
        editEnv?: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv,
    ) =>
        this.spawnNrfutil<Result>(
            this.module,
            [command, ...args],
            onProgress,
            onTaskBegin,
            onTaskEnd,
            controller,
            editEnv,
        );

    private spawnNrfutilCommand = (
        command: string,
        args: string[],
        parser: (data: Buffer, pid?: number) => Buffer | undefined,
        onStdError: (data: Buffer, pid?: number) => void,
        controller?: AbortController,
        editEnv?: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv,
    ) =>
        this.spawnCommand(
            this.getNrfutilExePath(),
            [
                command,
                ...args,
                '--json',
                '--log-output=stdout',
                '--log-level',
                this.logLevel,
            ],
            parser,
            onStdError,
            controller,
            editEnv,
        );

    private spawnNrfutil = async <Result>(
        command: string,
        args: string[],
        onProgress?: OnProgress,
        onTaskBegin?: OnTaskBegin,
        onTaskEnd?: OnTaskEnd<Result>,
        controller?: AbortController,
        editEnv?: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv,
    ) => {
        let stdErr: string | undefined;
        let pid: number | undefined;

        const parser = new CollectingResultParser(
            this.log,
            onProgress,
            onTaskBegin,
            onTaskEnd,
        );

        try {
            await this.spawnNrfutilCommand(
                command,
                args,
                parser.handleData,
                (data, processId) => {
                    pid = processId;
                    stdErr = (stdErr ?? '') + data.toString();
                },
                controller,
                editEnv,
            );

            if (stdErr || parser.hasFailures()) throw new Error('Task failed.');

            return parser.result();
        } catch (e) {
            const error = e as Error;

            error.message = collectErrorMessages(
                error.message,
                stdErr,
                parser.errorMessage(),
            );

            telemetry.sendErrorReport(
                `${this.pidIfTraceLogging(pid)}${describeError(error)}`,
            );
            throw error;
        }
    };

    public spawnCommand = (
        command: string,
        args: string[],
        parser: (data: Buffer, pid?: number) => Buffer | undefined,
        onStdError: (data: Buffer, pid?: number) => void,
        controller?: AbortController,
        editEnv: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv = env => env,
    ) =>
        new Promise<void>((resolve, reject) => {
            if (controller?.signal.aborted) {
                reject(
                    new Error(
                        `Aborted before start executing ${path.basename(
                            command,
                        )} ${JSON.stringify(args)}`,
                    ),
                );
                return;
            }
            let aborting = false;
            telemetry.sendEvent(`running nrfutil ${this.module}`, {
                args,
                exec: command,
            });
            const nrfutil = spawn(command, args, {
                env: editEnv(this.env),
            });

            const listener = () => {
                aborting = true;
                if (nrfutil.pid) {
                    treeKill(nrfutil.pid);
                } else {
                    nrfutil.kill('SIGINT');
                }
            };

            controller?.signal.addEventListener('abort', listener);

            let buffer: Buffer<ArrayBufferLike> = Buffer.from('');

            nrfutil.stdout.on('data', (data: Buffer) => {
                if (controller?.signal.aborted) return;

                buffer = Buffer.concat([buffer, data]);
                const remainingBytes = parser(buffer, nrfutil.pid);
                if (remainingBytes) {
                    buffer = remainingBytes;
                } else {
                    buffer = Buffer.from('');
                }
            });

            nrfutil.stderr.on('data', (data: Buffer) => {
                onStdError(data, nrfutil.pid);
            });

            nrfutil.on('error', err => {
                reject(err);
            });

            nrfutil.on('close', code => {
                controller?.signal.removeEventListener('abort', listener);
                if (aborting) {
                    reject(
                        new Error(
                            `Aborted ongoing ${path.basename(
                                command,
                            )} ${JSON.stringify(args)}`,
                        ),
                    );
                    return;
                }

                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Failed with exit code ${code}.`));
                }
            });
        });

    public execNrfutilSubcommand = <Result>(
        command: string,
        args: string[],
        onProgress?: OnProgress,
        onTaskBegin?: OnTaskBegin,
        onTaskEnd?: OnTaskEnd<Result>,
        controller?: AbortController,
        editEnv?: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv,
    ) =>
        this.execNrfutilCommand<Result>(
            this.module,
            [command, ...args],
            onProgress,
            onTaskBegin,
            onTaskEnd,
            controller,
            editEnv,
        );

    private execNrfutilCommand = async <Result>(
        command: string,
        args: string[],
        onProgress?: OnProgress,
        onTaskBegin?: OnTaskBegin,
        onTaskEnd?: OnTaskEnd<Result>,
        controller?: AbortController,
        editEnv?: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv,
    ) => {
        let stdErr: string | undefined;
        let pid: number | undefined;

        const parser = new CollectingResultParser(
            this.log,
            onProgress,
            onTaskBegin,
            onTaskEnd,
        );

        try {
            await this.execCommand(
                command,
                args,
                parser.handleData,
                (data, processId) => {
                    pid = processId;
                    stdErr = (stdErr ?? '') + data.toString();
                },
                controller,
                editEnv,
            );

            if (stdErr || parser.hasFailures()) throw new Error('Task failed.');

            return parser.result();
        } catch (e) {
            const error = e as Error;

            error.message = collectErrorMessages(
                error.message,
                stdErr,
                parser.errorMessage(),
            );

            telemetry.sendErrorReport(
                `${this.pidIfTraceLogging(pid)}${describeError(error)}`,
            );
            throw error;
        }
    };

    public execCommand = (
        command: string,
        args: string[],
        onData: (data: Buffer, pid?: number) => void,
        onStdError: (data: Buffer, pid?: number) => void,
        controller?: AbortController,
        editEnv: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv = env => env,
    ) =>
        new Promise<void>((resolve, reject) => {
            let aborting = false;
            telemetry.sendEvent(`running nrfutil ${this.module}`, {
                args,
                exec: command,
            });

            const nrfutil = exec(`"${command}" ${args.join(' ')}`, {
                env: editEnv(this.env),
            });

            const listener = () => {
                getNrfutilLogger()?.info(
                    `Aborting the ongoing command nrfutil ${
                        this.module
                    } ${command} ${JSON.stringify(args)}`,
                );
                aborting = true;
                if (nrfutil.pid) {
                    treeKill(nrfutil.pid);
                } else {
                    nrfutil.kill('SIGINT');
                }
            };

            controller?.signal.addEventListener('abort', listener);

            nrfutil.stdout?.on('data', (data: Buffer) => {
                if (controller?.signal.aborted) return;

                onData(data, nrfutil.pid);
            });

            nrfutil.stderr?.on('data', (data: Buffer) => {
                onStdError(data, nrfutil.pid);
            });

            nrfutil.on('close', code => {
                controller?.signal.removeEventListener('abort', listener);
                if (aborting) {
                    reject(
                        new Error(
                            `Aborted ongoing ${path.basename(command)} ${
                                args[0] ?? ''
                            }`,
                        ),
                    );
                    return;
                }

                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Failed with exit code ${code}.`));
                }
            });
        });

    public spawnBackgroundSubcommand = <Result>(
        command: string,
        args: string[],
        processors: BackgroundTask<Result>,
        editEnv?: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv,
    ) => {
        const controller = new AbortController();
        let running = true;
        const closedHandlers: ((error?: Error) => void)[] = [];

        const operation = this.spawnNrfutilCommand(
            this.module,
            [command, ...args],
            (data, pid) => {
                const parsedData: NrfutilJson<Result>[] | undefined =
                    parseJsonBuffers(data);

                if (!parsedData) {
                    return data;
                }

                parsedData.forEach(item => {
                    if (item.type === 'log') {
                        this.log(item.data, pid);
                    }

                    if (item.type === 'info') {
                        processors.onData(item.data);
                    }
                });
            },
            (data, pid) => {
                processors.onError(new Error(data.toString()), pid);
            },
            controller,
            editEnv,
        );

        operation
            .then(() => {
                running = false;
                closedHandlers.forEach(callback => callback());
            })
            .catch(error => {
                telemetry.sendErrorReport(describeError(error));
                running = false;
                closedHandlers.forEach(callback => callback(error));
            });

        return {
            stop: (handler?: () => void) => {
                if (handler) closedHandlers.push(handler);
                controller.abort();
            },
            isRunning: () => running,
            onClosed: (handler: (error?: Error) => void) => {
                closedHandlers.push(handler);

                return () =>
                    closedHandlers.splice(closedHandlers.indexOf(handler), 1);
            },
        };
    };

    public singleTaskEndOperationWithData = async <T>(
        command: string,
        onProgress?: OnProgress,
        controller?: AbortController,
        args: string[] = [],
    ) => {
        const data = await this.singleTaskEndOperationOptionalData<T>(
            command,
            onProgress,
            controller,
            args,
        );

        if (data != null) {
            return data;
        }
        throw new Error('Unexpected result');
    };

    public singleTaskEndOperationOptionalData = async <T = void>(
        command: string,
        onProgress?: OnProgress,
        controller?: AbortController,
        args: string[] = [],
    ) => {
        const results = await this.spawnNrfutilSubcommand<T>(
            command,
            args,
            onProgress,
            undefined,
            undefined,
            controller,
        );

        if (results.taskEnd.length === 1) {
            return results.taskEnd[0].data ?? results.taskEnd[0].task.data;
        }
        throw new Error('Unexpected result');
    };

    public singleInfoOperationOptionalData = async <T = void>(
        command: string,
        controller?: AbortController,
        args: string[] = [],
    ) => {
        const results = await this.spawnNrfutilSubcommand<T>(
            command,
            args,
            undefined,
            undefined,
            undefined,
            controller,
        );

        if (results.info.length === 1) {
            return results.info[0];
        }
        throw new Error('Unexpected result');
    };

    public onLogging = (
        handler: (logging: LogMessage, pid?: number) => void,
    ) => {
        this.onLoggingHandlers.push(handler);

        return () =>
            this.onLoggingHandlers.splice(
                this.onLoggingHandlers.indexOf(handler),
                1,
            );
    };

    public pidIfTraceLogging = (pid?: number) =>
        pid != null && this.logLevel === 'trace' ? `[PID:${pid}] ` : '';

    public setLogLevel = (level: LogLevel) => {
        this.logLevel = level;
    };
}
