/*
 * Copyright (c) 2023 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { z } from 'zod';

import { knownDevicePcas } from '../device';
import { nrfModules, semver } from '../MetaFiles';
import { parseWithPrettifiedErrorMessage } from './parseJson';

const packageJson = z.object({
    name: z.string(),
    version: semver,

    displayName: z.string().optional(),
});

export type PackageJson = z.infer<typeof packageJson>;

export const parsePackageJson = parseWithPrettifiedErrorMessage(packageJson);

const relativePath = z
    .string()
    .refine(value => !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value), {
        message: 'Must be a relative path to a file within the app, not a URL',
    })
    .refine(value => !/^[\\/]/.test(value) && !/^[a-zA-Z]:[\\/]/.test(value), {
        message: 'Must be a relative path, not an absolute one',
    })
    .refine(value => !value.split(/[\\/]/).includes('..'), {
        message: 'Must not contain `..` path segments',
    });

const secureUrl = z
    .string()
    .url()
    .refine(
        value => {
            const url = new URL(value);
            const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(
                url.hostname,
            );
            return (
                url.protocol === 'https:' ||
                (url.protocol === 'http:' && isLocalhost)
            );
        },
        {
            message:
                'Must be an https URL (http is only allowed for localhost during development)',
        },
    );

// Apps have more required fields in their package.json
const nrfConnectForDesktopBase = z.object({
    supportedDevices: z.enum(knownDevicePcas).array().nonempty().optional(),
    nrfutil: nrfModules.optional(),
    nrfutilCore: semver,
    dist: relativePath,
    html: relativePath.optional(),
    webHtml: secureUrl.optional(),
    preloadScript: relativePath.optional(),
    fixedSize: z
        .object({
            width: z.number().int().positive(),
            height: z.number().int().positive(),
        })
        .optional(),
});

const nrfConnectForDesktop = nrfConnectForDesktopBase.superRefine(
    (data, ctx) => {
        const hasHtml = data.html != null;
        const hasWebHtml = data.webHtml != null;

        if (hasHtml === hasWebHtml) {
            const message = hasHtml
                ? 'Only one of `html` or `webHtml` can be set, not both'
                : 'Either `html` or `webHtml` must be set';

            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message,
                path: ['html'],
            });
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message,
                path: ['webHtml'],
            });
        }
    },
);

const recordOfOptionalStrings = z.record(z.string().optional());

const engines = recordOfOptionalStrings.and(
    z.object({ nrfconnect: z.string() }),
);

const packageJsonApp = packageJson.extend({
    dependencies: recordOfOptionalStrings.optional(),
    description: z.string(),
    homepage: z.string().url().optional(),
    devDependencies: recordOfOptionalStrings.optional(),
    displayName: z.string(),
    engines,
    nrfConnectForDesktop,
    files: z.string().array().optional(),
    peerDependencies: recordOfOptionalStrings.optional(),
    repository: z
        .object({
            type: z.string(),
            url: z.string().url(),
        })
        .optional(),
});

export type PackageJsonApp = z.infer<typeof packageJsonApp>;

export const parsePackageJsonApp =
    parseWithPrettifiedErrorMessage(packageJsonApp);

// In the launcher we want to handle that the whole nrfConnectForDesktop may be missing
// and html or nrfutilCore in it can also be undefined, so there we need to use this legacy variant
const packageJsonLegacyApp = packageJsonApp.extend({
    nrfConnectForDesktop: nrfConnectForDesktopBase
        .extend({ supportedDevices: z.array(z.string()).nonempty().optional() })
        .partial({
            dist: true,
            html: true,
            webHtml: true,
            preloadScript: true,
            nrfutilCore: true,
        })
        .optional(),
});

export type PackageJsonLegacyApp = z.infer<typeof packageJsonLegacyApp>;

export const parsePackageJsonLegacyApp =
    parseWithPrettifiedErrorMessage(packageJsonLegacyApp);
