/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { handle, invoke } from './infrastructure/rendererToMain';

const channel = {
    start: 'auth:start',
    logout: 'auth:logout',
    getAccessToken: 'auth:get-access-token',
    getAccount: 'auth:get-account',
};

export interface AccountInfo {
    username: string;
    name?: string;
}

export type LoginResult = { ok: true } | { ok: false; error: string };

// The logical type is not wrapped in a promise. Invoke adds the promise itself.
type StartLogin = () => LoginResult;
type Logout = () => void;
type GetAccessToken = () => string | null;
type GetAccountInfo = () => AccountInfo | null;

const startLogin = invoke<StartLogin>(channel.start);
const registerStartLogin = handle<StartLogin>(channel.start);

const logout = invoke<Logout>(channel.logout);
const registerLogout = handle<Logout>(channel.logout);

const getAccessToken = invoke<GetAccessToken>(channel.getAccessToken);
const registerGetAccessToken = handle<GetAccessToken>(channel.getAccessToken);

const getAccountInfo = invoke<GetAccountInfo>(channel.getAccount);
const registerGetAccountInfo = handle<GetAccountInfo>(channel.getAccount);

export const forRenderer = {
    registerStartLogin,
    registerGetAccountInfo,
    registerLogout,
    registerGetAccessToken,
};
export const inMain = { startLogin, getAccountInfo, logout, getAccessToken };
