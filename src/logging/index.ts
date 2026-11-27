/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import path from 'node:path';
import { SPLAT } from 'triple-beam';
import {
    createLogger,
    format,
    type LogEntry,
    type Logger,
    transports,
} from 'winston';
import type Transport from 'winston-transport';

import { getAppLogDir, getUserDataDir } from '../utils/appDirs';
import { openFile, openFileLocation } from '../utils/open';
import { isLauncher } from '../utils/packageJson';
import AppTransport from './appTransport';
import describeError from './describeError';
import createLogBuffer from './logBuffer';

const isDevelopment = process.env.NODE_ENV === 'development';

const isConsoleAvailable = (() => {
    try {
        process.stdout.write('');
    } catch {
        return false;
    }
    return true;
})();

const filePrefix = new Date().toISOString().replace(/:/gi, '_');

const logFilePath = () =>
    isLauncher()
        ? path.join(getUserDataDir(), 'logs', 'renderer.log')
        : path.join(getAppLogDir(), `${filePrefix}-log.txt`);

const logBuffer = createLogBuffer();

const logTransports: Transport[] = [
    new AppTransport({
        level: 'info',
        onLogEntry: logBuffer.addEntry,
    }),
];

if (isDevelopment && isConsoleAvailable) {
    logTransports.push(new transports.Console({ level: 'silly' }));
}

interface SharedLogger extends Logger {
    initialise: () => void;
    getAndClearEntries: () => LogEntry[];
    openLogFile: () => void;
    openLogFileLocation: () => Promise<void>;
    logError: (message: string, error: unknown) => void;
}

const logger = createLogger({
    format: format.combine(
        format(info => ({
            ...info,
            message: Array.isArray(info[SPLAT])
                ? `${info.message} ${info[SPLAT].join(' ')}`
                : info.message,
        }))(),
        format.timestamp(),
        format.printf(
            ({ timestamp, level, message }) =>
                `${timestamp} ${level.toUpperCase()} ${message || ''}`,
        ),
    ),
    transports: logTransports,
}) as SharedLogger;

logger.initialise = () => {
    logger.add(
        new transports.File({
            filename: logFilePath(),
            level: 'debug',
        }),
    );
};

logger.getAndClearEntries = () => logBuffer.clear();

logger.openLogFile = async () => {
    try {
        await openFile(logFilePath());
    } catch (error) {
        logger.logError('Unable to open the log file', error);
    }
};

logger.openLogFileLocation = async () => {
    try {
        await openFileLocation(logFilePath());
    } catch (error) {
        logger.logError('Unable to open the log file location', error);
    }
};

logger.logError = (message: string, error: unknown) => {
    const errorMessage =
        error == null ? message : `${message}: ${describeError(error)}`;

    logger.error(errorMessage);
};

export default logger;
