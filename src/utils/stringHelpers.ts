/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import ansiRegex from 'ansi-regex';

/**
 * Removes ANSI control sequences from a string.
 * @param {string} str the string to remove ANSI control sequences from
 * @returns {string} the string without ANSI control sequences
 */
const removeAnsi = (str: string): string => {
    // Get rid of ansi control sequences:
    str.match(ansiRegex())?.forEach(seq => {
        str = str.replace(seq, '');
    });
    return str;
};

export { removeAnsi };
