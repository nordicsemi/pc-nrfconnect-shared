/*
 * Copyright (c) 2023 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import xRead from '../xRead';

const program = jest.fn();
const programBuffer = jest.fn();
const deviceInfo = jest.fn(() => Promise.resolve({}));
const erase = jest.fn();
const recover = jest.fn();
const reset = jest.fn();
const getProtectionStatus = jest.fn();
const setProtectionStatus = jest.fn();
const getFwInfo = jest.fn();
const setMcuState = jest.fn();
const getCoreInfo = jest.fn();
const list = jest.fn(() => ({
    stop: jest.fn(),
}));
const firmwareRead = jest.fn();
const onLogging = jest.fn();
const setLogLevel = jest.fn();
const setVerboseLogging = jest.fn();
const getModuleVersion = jest.fn();
const programBoardController = jest.fn();

export default {
    program,
    programBuffer,
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
    firmwareRead,
    xRead,
    onLogging,
    setLogLevel,
    setVerboseLogging,
    getModuleVersion,
    programBoardController,
};
