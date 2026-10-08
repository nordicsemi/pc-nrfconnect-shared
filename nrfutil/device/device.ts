/*
 * Copyright (c) 2023 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { getModule } from '..';
import { type LogLevel, type LogMessage } from '../sandboxTypes';
import { Batch } from './batch';
import boardController from './boardController';
import deviceInfo from './deviceInfo';
import erase from './erase';
import getBoardControllerConfig from './getBoardControllerConfig';
import getBoardControllerVersion from './getBoardControllerVersion';
import getCoreInfo from './getCoreInfo';
import getFwInfo from './getFwInfo';
import getProtectionStatus from './getProtectionStatus';
import list from './list';
import program from './program';
import programBoardController from './programBoardController';
import recover from './recover';
import reset from './reset';
import setMcuState from './setMcuState';
import setProtectionStatus from './setProtectionStatus';

const onLogging = async (handler: (logging: LogMessage) => void) => {
    const sandbox = await getModule('device');
    return sandbox.onLogging(handler);
};

const setLogLevel = async (level: LogLevel) => {
    const sandbox = await getModule('device');
    sandbox.setLogLevel(level);
};

const setVerboseLogging = async (verbose: boolean) => {
    const sandbox = await getModule('device');
    const fallbackLevel =
        process.env.NODE_ENV === 'production' ? 'off' : 'error';

    sandbox.setLogLevel(verbose ? 'trace' : fallbackLevel);
};
const getModuleVersion = async () => {
    const sandbox = await getModule('device');
    return sandbox.getModuleVersion();
};

export default {
    program,
    deviceInfo,
    erase,
    recover,
    reset,
    getProtectionStatus,
    setProtectionStatus,
    getFwInfo,
    setMcuState,
    getCoreInfo,
    list,
    onLogging,
    setLogLevel,
    setVerboseLogging,
    getModuleVersion,
    boardController,
    getBoardControllerVersion,
    getBoardControllerConfig,
    programBoardController,
    batch: () => new Batch(),
};
