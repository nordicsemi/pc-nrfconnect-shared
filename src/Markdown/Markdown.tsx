/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';

import classNames from '../utils/classNames';

interface MarkdownProps
    extends Pick<React.ComponentPropsWithRef<'div'>, 'ref' | 'className'> {
    children?: string;
}

const Markdown: React.FC<MarkdownProps> = ({
    className,
    children,
    ...attrs
}) => (
    <div
        className={classNames(
            'tw-preflight tw-flex tw-flex-col tw-gap-4 [&_code]:tw-font-mono [&_code]:tw-text-[90%] [&_code]:tw-text-pink [&_h1]:tw-text-2xl [&_h1]:tw-font-medium [&_h2]:tw-text-xl [&_h2]:tw-font-medium [&_h3]:tw-text-lg [&_h3]:tw-font-medium [&_h4]:tw-text-lg [&_h4]:tw-font-medium [&_h5]:tw-text-lg [&_h5]:tw-font-medium [&_h6]:tw-text-lg [&_h6]:tw-font-medium [&_i]:tw-italic [&_ol]:tw-list-outside [&_ol]:tw-list-decimal [&_ol]:tw-pl-4 [&_strong]:tw-font-bold [&_ul]:tw-list-outside [&_ul]:tw-list-disc [&_ul]:tw-pl-4',
            className,
        )}
        {...attrs}
    >
        <ReactMarkdown
            // See https://github.com/remarkjs/react-markdown/issues/927
            rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
        >
            {children}
        </ReactMarkdown>
    </div>
);

export default Markdown;
