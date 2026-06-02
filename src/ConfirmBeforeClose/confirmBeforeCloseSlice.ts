/*
 * Copyright (c) 2024 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';

import type { AppThunk, RootState } from '../store';
import { packageJsonApp } from '../utils/packageJson';

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export interface ConfirmBeforeCloseApp {
    id: string;
    title: string;
    message: React.ReactNode;
    onClose?: () => void;
}

export type ConfirmBeforeCloseOptionalTitle = Optional<
    ConfirmBeforeCloseApp,
    'title'
>;

type OnCompleteAction = 'close' | 'reload';
export interface ConfirmBeforeCloseState {
    confirmCloseApp: ConfirmBeforeCloseApp[];
    showCloseDialog: boolean;
    actionOnAllComplete: OnCompleteAction;
}

const initialState: ConfirmBeforeCloseState = {
    confirmCloseApp: [],
    showCloseDialog: false,
    actionOnAllComplete: 'close',
};

const slice = createSlice({
    name: 'confirmBeforeCloseDialog',
    initialState,
    reducers: {
        addConfirmBeforeClose(
            state,
            action: PayloadAction<ConfirmBeforeCloseOptionalTitle>,
        ) {
            const index = state.confirmCloseApp.findIndex(
                confirmCloseApp => confirmCloseApp.id === action.payload.id,
            );

            const dialog = {
                title: `Closing ${packageJsonApp().displayName}`,
                ...action.payload,
            };

            if (index !== -1) {
                state.confirmCloseApp[index] = dialog;
            } else {
                state.confirmCloseApp = [dialog, ...state.confirmCloseApp];
            }
        },
        clearConfirmBeforeClose(state, action: PayloadAction<string>) {
            state.confirmCloseApp = state.confirmCloseApp.filter(
                confirmCloseApp => confirmCloseApp.id !== action.payload,
            );
        },
        setShowCloseDialog(state, action: PayloadAction<boolean>) {
            state.showCloseDialog = action.payload;
        },
        setActionOnAllComplete(state, action: PayloadAction<OnCompleteAction>) {
            state.actionOnAllComplete = action.payload;
        },
    },
});

export const {
    reducer,
    actions: {
        addConfirmBeforeClose,
        setShowCloseDialog,
        clearConfirmBeforeClose,
        setActionOnAllComplete,
    },
} = slice;

export const getNextConfirmDialog = (state: RootState) =>
    state.confirmBeforeCloseDialog.confirmCloseApp.length > 0
        ? state.confirmBeforeCloseDialog.confirmCloseApp[0]
        : undefined;

export const getShowConfirmCloseDialog = (state: RootState) =>
    state.confirmBeforeCloseDialog.showCloseDialog;

export const getActionOnComplete = (state: RootState) =>
    state.confirmBeforeCloseDialog.actionOnAllComplete;

export const preventAppCloseUntilComplete =
    (
        dialogInfo: Omit<ConfirmBeforeCloseOptionalTitle, 'id'>,
        promise: Promise<unknown>,
        abortController?: AbortController,
    ): AppThunk =>
    dispatch => {
        const id = uuid();
        dispatch(
            addConfirmBeforeClose({
                ...dialogInfo,
                id,
                onClose: () => {
                    dialogInfo.onClose?.();
                    abortController?.abort();
                },
            }),
        );
        promise.finally(() => dispatch(clearConfirmBeforeClose(id)));
    };
