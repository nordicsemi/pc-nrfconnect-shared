/*
 * Copyright (c) 2023 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { getModule } from '../modules';
import { type OnProgress } from '../sandboxTypes';

export const deviceTraitsToArgs = (traits: DeviceTraits) => {
    const traitsString = Object.keys(traits)
        .map(trait => (traits[trait as keyof DeviceTraits] ? trait : null))
        .filter(t => t !== null)
        .join(',');

    return traitsString.length > 0 ? ['--traits', traitsString] : [];
};

export type ResetKind =
    | 'RESET_DEFAULT'
    | 'RESET_SYSTEM'
    | 'RESET_HARD'
    | 'RESET_DEBUG'
    | 'RESET_PIN';

export interface DeviceArrivedEvent {
    device: NrfutilDevice;
}

export interface DeviceLeftEvent {
    id: number;
}

export interface NordicDevKit {
    boardVersion?: string;
    deviceFamily?: string;
}

export interface NrfutilDevice {
    id: number;
    devkit?: NordicDevKit;
    serialNumber?: string | null; // undefined in case udev is not installed
    traits: DeviceTraits;
    usb?: USB;
    // non-Nordic devices may not have serialPorts property at all
    serialPorts?: Array<SerialPort>;
    broken?: null | {
        description: string;
        url: string;
    };
}

export type DeviceFamily =
    | 'NRF51_FAMILY'
    | 'NRF52_FAMILY'
    | 'NRF53_FAMILY'
    | 'NRF91_FAMILY';

export type ProtectionStatus =
    | 'NRFDL_PROTECTION_STATUS_NONE'
    | 'NRFDL_PROTECTION_STATUS_REGION0'
    | 'NRFDL_PROTECTION_STATUS_REGION0_REGION1'
    | 'NRFDL_PROTECTION_STATUS_SECURE_REGIONS'
    | 'NRFDL_PROTECTION_STATUS_ALL';

export type VersionType =
    | 'NRFDL_VERSION_TYPE_SEMANTIC'
    | 'NRFDL_VERSION_TYPE_INCREMENTAL'
    | 'NRFDL_VERSION_TYPE_STRING';

export type DeviceCore =
    | 'Application'
    | 'Modem'
    | 'Network'
    | 'Secure'
    | 'FLPR';

export interface DeviceTraits {
    usb?: boolean;
    nordicUsb?: boolean;
    nordicDfu?: boolean;
    seggerUsb?: boolean;
    jlink?: boolean;
    serialPorts?: boolean;
    broken?: boolean;
    mcuBoot?: boolean;
    modem?: boolean;
}

export interface USB {
    serialNumber: string;
    manufacturer: string | null;
    osDevicePath: string;
    product: string | null;
    device: USBDevice;
}

export interface USBDeviceDescriptor {
    bDescriptorType: number;
    idVendor: number;
    idProduct: number;
    bcdDevice: number;
}

export interface USBConfigurationDescriptor {
    bDescriptorType: number;
}

export interface USBInterfaceDescriptor {
    bDescriptorType: number;
    bInterfaceClass: number;
    bInterfaceSubClass: number;
    bInterfaceProtocol: number;
}

export interface USBInterface {
    descriptors: USBInterfaceDescriptor[];
    endpointLists: USBEndpoint[];
}

export interface USBEndpointDescriptor {
    bDescriptorType: number;
}

export interface USBEndpoint {
    descriptors?: USBEndpointDescriptor[];
    length: number;
}

export interface USBConfiguration {
    descriptors: USBConfigurationDescriptor[];
    interfaceLists: USBInterface[];
    length: number;
}

export interface USBDevice {
    busNumber: number;
    address: number;
    descriptor: USBDeviceDescriptor;
    configList: USBConfiguration; // todo: check this prop
}
export interface SerialPort {
    serialNumber: string | null;
    comName: string | null;
    manufacturer: string | null;
    productId: string | null;
    vendorId: string | null;
    vcom: number;
    path: string | null;
}

export const deviceSingleTaskEndOperation = async <T = void>(
    device: NrfutilDevice,
    command: string,
    onProgress?: OnProgress,
    controller?: AbortController,
    args: string[] = [],
) => {
    if (!device.serialNumber) {
        throw new Error(
            `Device does not have a serial number, no device operation is possible`,
        );
    }
    const box = await getModule('device');
    return box.singleTaskEndOperationWithData<T>(
        command,
        onProgress,
        controller,
        [...args, '--serial-number', device.serialNumber],
    );
};

export const deviceSingleTaskEndOperationVoid = async (
    device: NrfutilDevice,
    command: string,
    onProgress?: OnProgress,
    controller?: AbortController,
    args: string[] = [],
) => {
    if (!device.serialNumber) {
        throw new Error(
            `Device does not have a serial number, no device operation is possible`,
        );
    }

    const box = await getModule('device');
    await box.singleTaskEndOperationOptionalData(
        command,
        onProgress,
        controller,
        [...args, '--serial-number', device.serialNumber],
    );
};

export const coreArg = (core?: DeviceCore) => (core ? ['--core', core] : []);
