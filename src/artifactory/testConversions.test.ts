/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import os from 'os';

import { type AQueryProps, type AResponse } from './ArtifactoryClient';
import {
    type Firmware,
    FirmwareClient,
    isSameFirmware,
    mapToQueryProps,
    type Source,
} from './FirmwareClient';

class TestFirmwareClient extends FirmwareClient {
    constructor() {
        super({ directory: os.tmpdir() });
    }

    public mapToFirmwareFormatTest(res: AResponse): Source[] {
        return this.mapToFirmwareFormat(res);
    }
}

describe('Test query prop convertion', () => {
    const expectedProps: AQueryProps = {
        name: 'modemfirmware',
        device: 'nrf9160dk',
        latest: 'true',
        downloadable_firmware: 'true',
    };
    const testWare: Firmware = {
        name: 'modemfirmware',
        device: ['nrf9160dk'],
    };

    it('Most central possibilities', () => {
        expect(mapToQueryProps(testWare)).toEqual(expectedProps);
        testWare.device.push('thingy91');
        expect(mapToQueryProps(testWare)).toEqual(expectedProps);
    });

    it('Specific version', () => {
        delete expectedProps.latest;

        expectedProps.version = '2.5.0';
        testWare.version = '2.5.0';

        expect(mapToQueryProps(testWare)).toEqual(expectedProps);
    });
});

describe('Test artifactory return convertion', () => {
    const client = new TestFirmwareClient();

    const testdate = new Date();
    const testResponse: AResponse = [
        {
            checksums: {
                md5: 'test',
                sha1: 'test',
                sha256: 'test',
            },
            created: testdate,
            createdBy: 'test',
            downloadUri: 'test',
            lastModified: testdate,
            lastUpdated: testdate,
            mimeType: 'test',
            modifiedBy: 'test',
            originalChecksums: {
                md5: 'test',
                sha1: 'test',
                sha256: 'test',
            },
            path: 'test',
            properties: {
                type: ['Application'],
                device: ['nrf9160dk', 'thingy91'],
                name: ['modemfirmware'],
                version: ['2.5.0'],
            },
            repo: 'test',
            size: 10,
            uri: 'test',
        },
    ];

    const expectedSourceList: Source[] = [
        {
            checksum: 'test',
            description: undefined,
            device: ['nrf9160dk', 'thingy91'],
            documentation: undefined,
            file: 'https://files.nordicsemi.com/ui/api/v1/download?isNativeBrowsing=false&repoKey=swtools&path=test',
            name: 'modemfirmware',
            title: undefined,
            type: 'Application',
            version: '2.5.0',
        },
    ];

    it('Test convertion works', () => {
        expect(client.mapToFirmwareFormatTest(testResponse)).toEqual(
            expectedSourceList,
        );
    });
});

describe('Test firmware equality', () => {
    const firmware: Source = {
        type: 'Application',
        name: 'modemfirmware',
        device: ['nrf9160dk', 'thingy91'],
        checksum: 'test',
        version: '2.5.0',
        file: 'test',
    };

    it('Test exact equal firmwares equal', () => {
        expect(isSameFirmware(firmware)(firmware)).toBeTruthy();
    });

    it('Test unequal device lists wrong order', () => {
        expect(
            isSameFirmware(firmware)({ ...firmware, device: ['thingy91'] }),
        ).toBeFalsy();
    });

    it('Test unequal device lists correct order', () => {
        expect(
            isSameFirmware({ ...firmware, device: ['nrf9160dk'] })(firmware),
        ).toBeTruthy();
    });
});
