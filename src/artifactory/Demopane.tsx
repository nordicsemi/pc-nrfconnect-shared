/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */
import React from 'react';
import { readdir } from 'fs/promises';
import { join, resolve } from 'path';

import Button from '../Button/Button';
import Card from '../Card/Card';
import Dropdown, { type DropdownItem } from '../Dropdown/Dropdown';
import { Group } from '../Group/Group';
import { getAppDataDir } from '../utils/appDirs';
import { ApplicationClient } from './ApplicationClient';
import {
    type AQueryProps,
    type AResponse,
    ArtifactoryClient,
} from './ArtifactoryClient';
import { type Firmware } from './FirmwareClient';

const NordicURL = 'files.nordicsemi.com';
const demoPath = join(getAppDataDir(), 'demo');

type type = 'Modem' | 'Application' | 'Network' | undefined;

const ArtClient = new ArtifactoryClient(
    NordicURL,
    'swtools',
    join(demoPath, 'downloads'),
);
const AppClient = new ApplicationClient({ dataDirectory: demoPath });

const devices: string[] = [
    '',
    'nrf9151dk',
    'nrf9161dk',
    'nrf9160dk',
    'thingy91',
    'nrf52dk',
    'nrf53dk',
];

const names: string[] = [
    '',
    'hello_world',
    'lbs',
    'peripheral_uart',
    'power_profiling',
    'asset_tracker',
    'modemfirmware',
];

const types: type[] = [undefined, 'Application', 'Modem', 'Network'];

// The clients expect the lower case spelling, while the labels use the
// spelling the devices are marketed with.
const toItems = (values: (string | undefined)[]): DropdownItem[] =>
    values.map(v => ({
        label: v || 'SELECT',
        value: v ?? '',
    }));

const deviceItems = toItems(devices);
const nameItems = toItems(names);
const typeItems = toItems(types);

const itemFor = (items: DropdownItem[], value: string) =>
    items.find(i => i.value === value) ?? items[0];

export const Demopane: React.FC = () => {
    const [name, setName] = React.useState('');
    const [device, setDevice] = React.useState('');
    const [type, setType] = React.useState('');

    const [downloads, setDownloads] = React.useState<string[]>([]);

    const [firmwares, setFirmwares] = React.useState<Firmware[]>([]);

    const handleArtifactDemo = async (props: AQueryProps) => {
        const res: AResponse = await ArtClient.searchArtifactory(props);
        ArtClient.downloadArtifactFromPath(res[0].path);
        updateDownloads(join(demoPath, 'downloads'));
    };

    const updateDownloads = async (dir: string) => {
        const files: string[] = await readdir(resolve(dir));
        console.log(files);
        setDownloads(files);
    };

    const handleFirmwareDemo = async (fw: Firmware, intype: string) => {
        const outtype: type = intype as type;
        await AppClient.getFirmware({ ...fw, type: outtype });
        setFirmwares(await AppClient.loadSource());
    };

    const handleApplicationDemo = async (fw: Firmware) => {
        setFirmwares(await AppClient.getIndexedFirmwareWithDeps(fw));
    };

    const handleSearchDemo = async (indevice: string, intype: string) => {
        const outtype: type = intype as type;
        setFirmwares(
            await AppClient.listFirmware({
                type: outtype,
                device: indevice,
            }),
        );
    };

    const canSubmit = name !== '' && device !== '';

    const handleDeleteDemo = async (fw: Firmware) => {
        await AppClient.deleteFirmware(fw);
        setFirmwares(await AppClient.loadSource());
    };

    return (
        <div className="tw-preflight tw-flex tw-flex-col tw-gap-4 tw-p-4 tw-text-xs">
            <Group heading="Firmware selection" gap={4}>
                <div className="tw-grid tw-grid-cols-3 tw-gap-4">
                    <Dropdown
                        label="Name"
                        items={nameItems}
                        selectedItem={itemFor(nameItems, name)}
                        onSelect={item => setName(item.value)}
                    />
                    <Dropdown
                        label="Device"
                        items={deviceItems}
                        selectedItem={itemFor(deviceItems, device)}
                        onSelect={item => setDevice(item.value)}
                    />
                    <Dropdown
                        label="Type"
                        items={typeItems}
                        selectedItem={itemFor(typeItems, type)}
                        onSelect={item => setType(item.value)}
                    />
                </div>
                <div className="tw-flex tw-flex-wrap tw-gap-2">
                    <Button
                        variant="primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            handleArtifactDemo({ device, type, name });
                        }}
                    >
                        Test ArtifactoryClient
                    </Button>
                    <Button
                        variant="primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            handleFirmwareDemo(
                                { device: [device], name },
                                type,
                            );
                        }}
                    >
                        Test FirmwareClient
                    </Button>
                    <Button
                        variant="primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            handleApplicationDemo({ device: [device], name });
                        }}
                    >
                        Test ApplicationClient
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            handleSearchDemo(device, type);
                        }}
                    >
                        Test Search
                    </Button>
                    <Button
                        variant="danger"
                        onClick={() => {
                            handleDeleteDemo({ device: [device], name });
                        }}
                    >
                        Test Delete
                    </Button>
                </div>
                {!canSubmit && (
                    <p className="tw-text-gray-500">
                        Pick a name and a type to enable the client tests.
                    </p>
                )}
            </Group>

            <Group heading={`Firmwares (${firmwares.length})`} gap={2}>
                {firmwares.length === 0 && (
                    <p className="tw-text-gray-500">No firmwares loaded yet.</p>
                )}
                <div className="tw-grid tw-grid-cols-2 tw-gap-2">
                    {firmwares.map(f => (
                        <Card key={f.file} className="tw-gap-1 tw-pt-3">
                            <Card.Header className="tw-pb-2 tw-pt-0">
                                <Card.Header.Title
                                    cardTitle={f.name}
                                    cardSubtitle={f.version}
                                />
                            </Card.Header>
                            <Card.Body className="tw-gap-1">
                                <FirmwareRow
                                    label="Devices"
                                    value={f.device.join(', ')}
                                />
                                <FirmwareRow label="Type" value={f.type} />
                                <FirmwareRow label="File" value={f.file} />
                            </Card.Body>
                        </Card>
                    ))}
                </div>
            </Group>

            <Group heading={`Downloads (${downloads.length})`} gap={2}>
                {downloads.length === 0 && (
                    <p className="tw-text-gray-500">Nothing downloaded yet.</p>
                )}
                <ul className="tw-m-0 tw-flex tw-list-none tw-flex-col tw-gap-1 tw-p-0">
                    {downloads.map(f => (
                        <li
                            key={f}
                            className="tw-truncate tw-bg-white tw-px-2 tw-py-1"
                            title={f}
                        >
                            {f}
                        </li>
                    ))}
                </ul>
            </Group>
        </div>
    );
};

const FirmwareRow = ({ label, value }: { label: string; value?: string }) => (
    <div className="tw-flex tw-justify-between tw-gap-2">
        <span className="tw-text-gray-500">{label}</span>
        <span className="tw-truncate" title={value}>
            {value || '—'}
        </span>
    </div>
);
