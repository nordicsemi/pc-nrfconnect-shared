/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { type OnProgress } from '../sandboxTypes';
import { deviceSingleTaskEndOperationVoid, type NrfutilDevice } from './common';

export default (
    device: NrfutilDevice,
    firmwarePath: string,
    onProgress?: OnProgress,
    controller?: AbortController,
) =>
    deviceSingleTaskEndOperationVoid(
        device,
        'x-boardcontroller-program',
        onProgress,
        controller,
        ['--firmware', firmwarePath, '--traits', 'boardController'],
    );
