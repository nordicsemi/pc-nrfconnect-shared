/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { type ReactNode } from 'react';

import ApplicationCard from './ApplicationCard';
import DeviceCard from './DeviceCard';
import DocumentationCard from './DocumentationCard';
import SupportCard from './SupportCard';

export interface AboutPaneProps {
    documentation?: ReactNode[];
    feedbackCategories?: string[];
}

export default ({ documentation, feedbackCategories }: AboutPaneProps) => (
    <section className="tw-preflight tw-flex tw-flex-row tw-flex-wrap tw-justify-center tw-gap-2 tw-pb-4">
        <ApplicationCard className="tw-max-w-80 tw-flex-1 tw-basis-60" />
        <DeviceCard className="tw-max-w-80 tw-flex-1 tw-basis-60" />
        {documentation && documentation.length && (
            <DocumentationCard
                documentationSections={documentation}
                className="tw-max-w-80 tw-flex-1 tw-basis-60"
            />
        )}
        <SupportCard
            feedbackCategories={feedbackCategories}
            className="tw-max-w-80 tw-flex-1 tw-basis-60"
        />
    </section>
);
