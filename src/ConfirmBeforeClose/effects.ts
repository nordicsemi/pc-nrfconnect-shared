/*
 * Copyright (c) 2024 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { getCurrentWindow } from '@electron/remote';

import type { AppThunk } from '../store';
import { getActionOnComplete } from './confirmBeforeCloseSlice';

export const onUserConfirmAll = (): AppThunk => (_, getState) => {
    const actionType = getActionOnComplete(getState());
    if (actionType === 'close') {
        getCurrentWindow().close();
    } else {
        getCurrentWindow().reload();
    }
};
