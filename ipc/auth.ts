/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { type WebContents } from 'electron';

import { broadcast, onBroadcasted } from './infrastructure/mainToRenderer';
import { handle, invoke } from './infrastructure/rendererToMain';

const channel = {
    startSignIn: 'auth:start',
    cancelSignIn: 'auth:cancel-sign-in',
    singleSignOut: 'auth:single-sign-out',
    getIdToken: 'auth:get-id-token',
    getAccessToken: 'auth:get-access-token',
    getProfileInfo: 'auth:get-profile-info',
    getStatus: 'auth:get-status',
    onStateChanged: 'auth:on-state-changed',
};

const AUTH_STATE_SUBCHANNEL = 'auth-state';

export type AuthStatus =
    | 'signedIn'
    | 'signedOut'
    | 'signingIn'
    | 'signingOut'
    | 'interactionRequired';

export interface AuthState {
    status: AuthStatus;
    message?: string;
    account?: AccountInfo;
}

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

type GetAuthStatus = () => AuthState;
type OnStateChanged = (state: AuthState) => void;
type StartSignIn = () => GenericAuthResult<null>;
type CancelSignIn = () => GenericAuthResult<null>;
type SingleSignOut = () => GenericAuthResult<null>;
type GetAccessToken = (scopes?: string[]) => GenericAuthResult<string>;
type GetIdToken = (scopes?: string[]) => GenericAuthResult<string>;
type GetProfileInfo = () => GenericAuthResult<ProfileInfo>;

const broadcastStateChangedRaw = broadcast<OnStateChanged>(
    channel.onStateChanged,
);
const broadcastStateChanged = (
    targets: Pick<WebContents, 'send'>[],
    state: AuthState,
) => broadcastStateChangedRaw(AUTH_STATE_SUBCHANNEL, targets, state);

const registerOnStateChanged = onBroadcasted<OnStateChanged>(
    channel.onStateChanged,
    AUTH_STATE_SUBCHANNEL,
);

const getAuthStatus = invoke<GetAuthStatus>(channel.getStatus);
const registerGetAuthStatus = handle<GetAuthStatus>(channel.getStatus);

const startSignIn = invoke<StartSignIn>(channel.startSignIn);
const registerStartSignIn = handle<StartSignIn>(channel.startSignIn);
const cancelSignIn = invoke<CancelSignIn>(channel.cancelSignIn);
const registerCancelSignIn = handle<CancelSignIn>(channel.cancelSignIn);

const singleSignOut = invoke<SingleSignOut>(channel.singleSignOut);
const registerSingleSignOut = handle<SingleSignOut>(channel.singleSignOut);

const getIdToken = invoke<GetIdToken>(channel.getIdToken);
const registerGetIdToken = handle<GetIdToken>(channel.getIdToken);
const getAccessToken = invoke<GetAccessToken>(channel.getAccessToken);
const registerGetAccessToken = handle<GetAccessToken>(channel.getAccessToken);

const getProfileInfo = invoke<GetProfileInfo>(channel.getProfileInfo);
const registerGetProfileInfo = handle<GetProfileInfo>(channel.getProfileInfo);

export const forRenderer = {
    registerStartSignIn,
    registerCancelSignIn,
    registerSingleSignOut,
    registerGetIdToken,
    registerGetAccessToken,
    registerGetProfileInfo,
    registerGetAuthStatus,
    registerOnStateChanged,
    broadcastStateChanged,
};
export const inMain = {
    startSignIn,
    cancelSignIn,
    singleSignOut,
    getAccessToken,
    getIdToken,
    getProfileInfo,
    registerOnStateChanged,
    getAuthStatus,
};
