/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */
import React from 'react';

// Doesn't parse the markdown input into valid HTML, so this will only display
// Markdown code as text
const MockedMarkdown: React.FC<React.PropsWithChildren> = ({ children }) => (
    <p>{children}</p>
);

export default MockedMarkdown;
