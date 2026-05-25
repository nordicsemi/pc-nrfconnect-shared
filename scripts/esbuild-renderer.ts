/*
 * Copyright (c) 2022 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { cyclonedxEsbuildPlugin } from '@cyclonedx/cyclonedx-esbuild';
import { transform as svgr } from '@svgr/core';
import autoprefixer from 'autoprefixer';
import esbuild, { type BuildOptions } from 'esbuild';
import { postcssModules, sassPlugin } from 'esbuild-sass-plugin';
import postCssPlugin from 'esbuild-style-plugin';
import * as fs from 'node:fs';
import * as module from 'node:module';
import * as path from 'node:path';
import tailwindcss from 'tailwindcss';

import { chromeWithoutBuild } from './versions';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const projectSpecificTailwindConfigPath = path.join(
    process.cwd(),
    'tailwind.config.js',
);
const tailwindConfig = () =>
    fs.existsSync(projectSpecificTailwindConfigPath)
        ? projectSpecificTailwindConfigPath
        : require.resolve(
              '@nordicsemiconductor/pc-nrfconnect-shared/config/tailwind.config.js',
          );

type AdditionalOptions = Partial<BuildOptions>;

const options = (
    additionalOptions: AdditionalOptions,
    externalReact: boolean,
    sbomOutputFile: string | undefined,
) =>
    ({
        format: 'iife',
        target: `chrome${chromeWithoutBuild}`,
        sourcemap: true,
        metafile: false,
        minify: process.argv.includes('--prod'),
        bundle: true,
        logLevel: 'info',
        external: [
            ...module.builtinModules,

            // launcher includes
            'electron',
            'serialport',
            '@electron/remote',
            ...(externalReact ? ['react', 'react-dom'] : []),

            // App dependencies
            ...Object.keys(packageJson.dependencies ?? {}),
        ],
        loader: {
            '.json': 'json',
            '.gif': 'file',
            '.svg': 'file',
            '.png': 'file',
            '.woff': 'file',
            '.woff2': 'file',
            '.eot': 'file',
            '.ttf': 'file',
        },
        plugins: [
            cyclonedxEsbuildPlugin({
                outputFile: sbomOutputFile,
                logLevel: 'warning',
            }),
            sassPlugin({
                filter: /\.(module|icss)\.scss/,
                cssImports: true,
                transform: postcssModules({}),
            }),
            sassPlugin({
                filter: /\.scss$/,
                cssImports: true,
                silenceDeprecations:
                    process.env.ENABLE_ALL_SASS_WARNINGS === 'true'
                        ? undefined
                        : ['import'],
                quietDeps: process.env.ENABLE_ALL_SASS_WARNINGS !== 'true',
            }),
            postCssPlugin({
                postcss: {
                    plugins: [tailwindcss(tailwindConfig()), autoprefixer],
                },
            }),
            {
                name: 'svgr',
                setup(builder) {
                    const filter = /^!!@svgr!(.*\.svg)$/;

                    builder.onResolve({ filter }, args => {
                        // Rename file to .svgr to let this plugin handle it.
                        const [, shortpath] = filter.exec(args.path)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
                        const resolvedPath = `${path.join(
                            args.resolveDir,
                            shortpath,
                        )}r`;
                        return { path: resolvedPath };
                    });

                    builder.onLoad({ filter: /\.svgr$/ }, async args => {
                        const filePath = args.path.replace('.svgr', '.svg');
                        const svg = await fs.promises.readFile(
                            filePath,
                            'utf8',
                        );
                        const plugins = ['@svgr/plugin-jsx'];
                        const contents = await svgr(svg, { plugins });
                        return {
                            contents,
                            loader: 'jsx',
                        };
                    });
                },
            },
        ],
        ...additionalOptions,
    }) satisfies BuildOptions;

export const build = async (
    additionalOptions: AdditionalOptions,
    {
        sbomOutputFile,
        externalReact = false,
    }: { sbomOutputFile?: string; externalReact?: boolean } = {},
) => {
    if (process.argv.includes('--watch')) {
        const context = await esbuild.context(
            options(additionalOptions, externalReact, sbomOutputFile),
        );

        await context.rebuild();
        await context.watch();
    } else {
        return esbuild.build(
            options(additionalOptions, externalReact, sbomOutputFile),
        );
    }
};
