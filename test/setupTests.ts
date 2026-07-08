/*
 * Copyright (c) 2021 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import '@testing-library/jest-dom/extend-expect';

import { configure } from '@testing-library/dom';

if (process.env.TESTING_ASYNC_TIMEOUT != null) {
    configure({ asyncUtilTimeout: Number(process.env.TESTING_ASYNC_TIMEOUT) });
}

window.ResizeObserver = class {
    observe() {} // eslint-disable-line no-empty-function,class-methods-use-this -- because we just stub things here
    disconnect() {} // eslint-disable-line no-empty-function,class-methods-use-this
    unobserve() {} // eslint-disable-line no-empty-function,class-methods-use-this
};

if (
    typeof globalThis.TextEncoder === 'undefined' ||
    typeof globalThis.TextDecoder === 'undefined'
) {
    // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
    const utils = require('util');
    globalThis.TextEncoder = utils.TextEncoder;
    globalThis.TextDecoder = utils.TextDecoder;
}
