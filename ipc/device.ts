/*
 * Copyright (c) 2023 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

export const knownDevicePcas = [
    'PCA10028',
    'PCA10031',
    'PCA10040',
    'PCA10056',
    'PCA10059',
    'PCA10090',
    'PCA10095',
    'PCA10100',
    'PCA10121',
    'PCA20020',
    'PCA20053',
    'PCA20035',
    'PCA10143',
    'PCA10152',
    'PCA10153',
    'PCA10165',
    'PCA20049',
    'PCA10171',
    'PCA10156',
    'PCA10175',
    'PCA10184',
    'PCA10188',
    'PCA10214',
    'PCA10201',
    'PCA10218',
    'PCA10226',
    'PCA10232',
    'PCA10237',
    'PCA10208',
] as const;

export type KnownDevicePCA = (typeof knownDevicePcas)[number];
