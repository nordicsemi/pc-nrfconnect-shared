/*
 * Copyright (c) 2025 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { v4 as uuid } from 'uuid';

// When we reliably use at least Node v24.4.0, the implementation below can be replaced with this:
// export const createDisposableTempDir = () => mkdtempDisposableSync(`${tmpdir()}${sep}`);
export const createDisposableTempDir = () => {
    const tmpDir = mkdtempSync(`${tmpdir()}${sep}`);

    const remove = () => {
        rmSync(tmpDir, { recursive: true, force: true });
    };

    return {
        path: tmpDir,
        remove,
        [Symbol.dispose]: remove,
    };
};

export const createDisposableTempFile = (
    content: Parameters<typeof writeFileSync>[1],
    fileExtension?: string,
) => {
    const disposableTempDir = createDisposableTempDir();

    const effectiveFileExtension =
        fileExtension == null ? '' : `.${fileExtension}`;

    const filePath = join(
        disposableTempDir.path,
        `${uuid()}${effectiveFileExtension}`,
    );

    writeFileSync(filePath, content);

    return {
        ...disposableTempDir,

        path: filePath,
    };
};
