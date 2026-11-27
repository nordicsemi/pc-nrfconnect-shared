/*
 * Copyright (c) 2021 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import type {
    AutoDetectTypes,
    SetOptions,
    UpdateOptions,
} from '@serialport/bindings-cpp';
import EventEmitter from 'node:events';
import type { SerialPortOpenOptions } from 'serialport';

import { forMain, inMain, type OverwriteOptions } from '../../ipc/serialPort';
import logger from '../logging';

export type SerialPort = Awaited<ReturnType<typeof createSerialPort>>;

export const createSerialPort = async (
    options: SerialPortOpenOptions<AutoDetectTypes>,
    overwriteOptions: OverwriteOptions = {
        overwrite: false,
        settingsLocked: false,
    },
) => {
    const { path } = options;
    const eventEmitter = new EventEmitter();
    let closed = false;

    forMain.registerOnDataReceived(path)(data =>
        eventEmitter.emit('onData', data),
    );
    forMain.registerOnDataWritten(path)(data =>
        eventEmitter.emit('onDataWritten', data),
    );

    forMain.registerOnClosed(path)(() => {
        eventEmitter.emit('onClosed');
        closed = true;
    });
    forMain.registerOnUpdated(path)(newOptions =>
        eventEmitter.emit('onUpdate', newOptions),
    );
    forMain.registerOnSet(path)(newOptions =>
        eventEmitter.emit('onSet', newOptions),
    );
    forMain.registerOnChanged(path)(newOptions =>
        eventEmitter.emit('onChange', newOptions),
    );

    const openWithRetries = async (retryCount: number) => {
        try {
            await inMain.open(options, overwriteOptions);
            return undefined;
        } catch (error) {
            if (
                (error as Error).message.includes(
                    'PORT_IS_ALREADY_BEING_OPENED',
                ) &&
                retryCount > 0
            ) {
                return new Promise<string | undefined>(resolve => {
                    setTimeout(
                        async () => {
                            resolve(await openWithRetries(retryCount - 1));
                        },
                        50 + Math.random() * 100,
                    );
                });
            }
            return (error as Error).message;
        }
    };

    const close = async () => {
        if (closed) return;
        await inMain.close(path);

        try {
            if (await inMain.isOpen(path)) {
                logger.info(
                    `Port ${options.path} still in use by other window(s)`,
                );
            }
        } catch {
            logger.info(`Closed port: ${options.path}`);
        }
    };

    const write = (data: string | number[] | Buffer) =>
        inMain.write(path, data);
    const update = (newOptions: UpdateOptions) =>
        inMain.update(path, newOptions); // Only supports baudRate, same as serialport.io
    const set = (newOptions: SetOptions) => inMain.set(path, newOptions);

    const error = await openWithRetries(3);

    if (error) {
        if (error.includes('FAILED_DIFFERENT_SETTINGS')) {
            logger.warn(
                `Failed to connect to port: ${path}. Port is open with different settings.`,
            );
        } else {
            logger.error(
                `Failed to connect to port: ${path}. Make sure the port is not already taken, if you are not sure, try to power cycle the device and try to connect again.`,
            );
        }
        throw new Error(error);
    } else {
        logger.info(`Opened port with options: ${JSON.stringify(options)}`);
    }

    return {
        path,

        close,
        write,
        update,
        set,

        isOpen: () => inMain.isOpen(path),
        getOptions: () => inMain.getOptions(path),

        onData: (handler: (data: Uint8Array) => void) => {
            eventEmitter.on('onData', handler);
            return () => {
                eventEmitter.removeListener('onData', handler);
            };
        },
        onClosed: (handler: () => void) => {
            eventEmitter.on('onClosed', handler);
            return () => {
                eventEmitter.removeListener('onClosed', handler);
            };
        },
        onUpdate: (handler: (newOptions: UpdateOptions) => void) => {
            eventEmitter.on('onUpdate', handler);
            return () => {
                eventEmitter.removeListener('onUpdate', handler);
            };
        },
        onSet: (handler: (newOptions: SetOptions) => void) => {
            eventEmitter.on('onSet', handler);
            return () => {
                eventEmitter.removeListener('onSet', handler);
            };
        },
        onChange: (
            handler: (
                newOptions: SerialPortOpenOptions<AutoDetectTypes>,
            ) => void,
        ) => {
            eventEmitter.on('onChange', handler);
            return () => {
                eventEmitter.removeListener('onChange', handler);
            };
        },
        onDataWritten: (handler: (data: Uint8Array) => void) => {
            eventEmitter.on('onDataWritten', handler);
            return () => {
                eventEmitter.removeListener('onDataWritten', handler);
            };
        },
    };
};

export const getSerialPortOptions = async (path: string) => {
    try {
        console.log('will fetch options from path=', path);

        return await inMain.getOptions(path);
    } catch {
        logger.error(`Failed to get options for port: ${path}`);
    }
};
