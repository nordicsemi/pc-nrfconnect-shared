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

export type GenericAuthResult<T> =
    | { status: true; data: T }
    | { status: false; error: string };

// export type LoginResult = { ok: true } | { ok: false; error: string };

// The logical type is not wrapped in a promise. Invoke adds the promise itself.
type StartLogin = () => GenericAuthResult<undefined>;
type LocalLogout = () => GenericAuthResult<undefined>;
type SingleSignOut = () => GenericAuthResult<undefined>;
type CheckLoginStatus = () => GenericAuthResult<boolean>;
type GetAccessToken = () => GenericAuthResult<string>;
type GetAccountInfo = () => GenericAuthResult<AccountInfo>;

const startLogin = invoke<StartLogin>(channel.start);
const registerStartLogin = handle<StartLogin>(channel.start);

const localLogout = invoke<LocalLogout>(channel.logout);
const registerLocalLogout = handle<LocalLogout>(channel.logout);

const singleSignOut = invoke<SingleSignOut>(channel.logout);
const registerSingleSignOut = handle<SingleSignOut>(channel.logout);

const checkLoginStatus = invoke<CheckLoginStatus>(channel.start);
const registerCheckLoginStatus = handle<CheckLoginStatus>(channel.start);

const getAccessToken = invoke<GetAccessToken>(channel.getAccessToken);
const registerGetAccessToken = handle<GetAccessToken>(channel.getAccessToken);

const getAccountInfo = invoke<GetAccountInfo>(channel.getAccount);
const registerGetAccountInfo = handle<GetAccountInfo>(channel.getAccount);

export const forRenderer = {
    registerStartLogin,
    registerGetAccountInfo,
    registerLocalLogout,
    registerSingleSignOut,
    registerCheckLoginStatus,
    registerGetAccessToken,
};
export const inMain = {
    startLogin,
    getAccountInfo,
    localLogout,
    singleSignOut,
    checkLoginStatus,
    getAccessToken,
};
