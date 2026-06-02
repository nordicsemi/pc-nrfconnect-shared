/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getCurrentWindow } from '@electron/remote';

import { ConfirmationDialog } from '../Dialog/Dialog';
import { type AppThunk } from '../store';
import {
    addConfirmBeforeClose,
    clearConfirmBeforeClose,
    type ConfirmBeforeCloseApp,
    getNextConfirmDialog,
    getShowConfirmCloseDialog,
    setActionOnAllComplete,
    setShowCloseDialog,
} from './confirmBeforeCloseSlice';
import { onUserConfirmAll } from './effects';

export default () => {
    const dispatch = useDispatch();
    const [confirmedDialogs, setConfirmedDialogs] = useState<
        ConfirmBeforeCloseApp[]
    >([]);

    const showCloseDialog = useSelector(getShowConfirmCloseDialog);
    const nextConfirmDialog = useSelector(getNextConfirmDialog);

    useEffect(() => {
        if (!nextConfirmDialog && showCloseDialog) {
            confirmedDialogs.forEach(confirmedDialog => {
                if (confirmedDialog.onClose) confirmedDialog.onClose();
            });
            setConfirmedDialogs([]);
            dispatch(onUserConfirmAll());
        }
    }, [nextConfirmDialog, dispatch, showCloseDialog, confirmedDialogs]);

    useEffect(() => {
        const action = (ev: BeforeUnloadEvent) =>
            dispatch<AppThunk>((_, getState) => {
                const hasToGetExplicitConform =
                    getState().confirmBeforeCloseDialog.confirmCloseApp.length >
                    0;
                if (hasToGetExplicitConform) {
                    dispatch(setShowCloseDialog(true));
                    ev.returnValue = true;
                }
            });

        window.addEventListener('beforeunload', action, true);

        return () => {
            window.removeEventListener('beforeunload', action);
        };
    }, [dispatch]);

    return (
        <ConfirmationDialog
            headerIcon="alert-outline"
            title={nextConfirmDialog?.title ?? ''}
            isVisible={showCloseDialog && !!nextConfirmDialog}
            onConfirm={() => {
                if (nextConfirmDialog) {
                    setConfirmedDialogs([
                        ...confirmedDialogs,
                        nextConfirmDialog,
                    ]);
                    dispatch(clearConfirmBeforeClose(nextConfirmDialog.id));
                }
            }}
            onCancel={() => {
                getCurrentWindow().emit('restart-cancelled');
                dispatch(setShowCloseDialog(false));
                confirmedDialogs.forEach(confirmedDialog =>
                    dispatch(addConfirmBeforeClose(confirmedDialog)),
                );
                setConfirmedDialogs([]);
                dispatch(setActionOnAllComplete('close'));
            }}
        >
            {nextConfirmDialog?.message}
        </ConfirmationDialog>
    );
};
