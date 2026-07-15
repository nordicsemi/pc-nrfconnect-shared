/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { handle, invoke } from './infrastructure/rendererToMain';

const channel = {
    start: 'auth:start',
    logout: 'auth:logout',
    singleSignOut: 'auth:single-sign-out',
    checkLoginStatus: 'auth:check-login-status',
    getAccessToken: 'auth:get-access-token',
    getAccount: 'auth:get-account',
    getProfileInfo: 'auth:get-profile-info',
};

export interface AccountInfo {
    username: string;
    name?: string;
}

export interface ProfileInfo {
    displayName?: string;
    givenName?: string;
    surname?: string;
    mail?: string;
}

export type GenericAuthResult<T> =
    | { status: true; data: T }
    | { status: false; error: string };

// The logical type is not wrapped in a promise. Invoke adds the promise itself.
type StartLogin = () => GenericAuthResult<null>;
type LocalLogout = () => GenericAuthResult<null>;
type SingleSignOut = () => GenericAuthResult<null>;
type CheckLoginStatus = () => GenericAuthResult<boolean>;
type GetAccessToken = (scopes?: string[]) => GenericAuthResult<string>;
type GetAccountInfo = () => GenericAuthResult<AccountInfo>;
type GetProfileInfo = () => GenericAuthResult<ProfileInfo>;

const startLogin = invoke<StartLogin>(channel.start);
const registerStartLogin = handle<StartLogin>(channel.start);

const localLogout = invoke<LocalLogout>(channel.logout);
const registerLocalLogout = handle<LocalLogout>(channel.logout);

const singleSignOut = invoke<SingleSignOut>(channel.singleSignOut);
const registerSingleSignOut = handle<SingleSignOut>(channel.singleSignOut);

const checkLoginStatus = invoke<CheckLoginStatus>(channel.checkLoginStatus);
const registerCheckLoginStatus = handle<CheckLoginStatus>(
    channel.checkLoginStatus,
);

const getAccessToken = invoke<GetAccessToken>(channel.getAccessToken);
const registerGetAccessToken = handle<GetAccessToken>(channel.getAccessToken);

const getAccountInfo = invoke<GetAccountInfo>(channel.getAccount);
const registerGetAccountInfo = handle<GetAccountInfo>(channel.getAccount);

const getProfileInfo = invoke<GetProfileInfo>(channel.getProfileInfo);
const registerGetProfileInfo = handle<GetProfileInfo>(channel.getProfileInfo);

export const forRenderer = {
    registerStartLogin,
    registerGetAccountInfo,
    registerLocalLogout,
    registerSingleSignOut,
    registerCheckLoginStatus,
    registerGetAccessToken,
    registerGetProfileInfo,
};
export const inMain = {
    startLogin,
    getAccountInfo,
    localLogout,
    singleSignOut,
    checkLoginStatus,
    getAccessToken,
    getProfileInfo,
};
