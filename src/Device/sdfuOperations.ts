/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import MemoryMap from 'nrf-intel-hex';

import NrfutilDeviceLib from '../../nrfutil/device/device';
import { type McuState } from '../../nrfutil/device/setMcuState';
import logger from '../logging';
import { type AppThunk, type RootState } from '../store';
import { getAppFile } from '../utils/appDirs';
import {
    clearWaitForDevice,
    setWaitForDevice,
    type WaitForDeviceWhen,
} from './deviceAutoSelectSlice';
import { type DeviceSetup, type DfuEntry } from './deviceSetup';
import { openDeviceSetupDialog } from './deviceSetupSlice';
import { type Device } from './deviceSlice';
import {
    createInitPacketBuffer,
    defaultInitPacket,
    type DfuImage,
    FwType,
    HashType,
    type InitPacket,
} from './initPacket';

const NORDIC_DFU_PRODUCT_ID = 0x521f;
const NORDIC_VENDOR_ID = 0x1915;
const DEFAULT_DEVICE_WAIT_TIME = 10000;

const LATEST_BOOTLOADER =
    'fw/graviton_bootloader_v1.0.1-[nRF5_SDK_15.0.1-1.alpha_f76d012].zip';
const LATEST_BOOTLOADER_VERSION = 3; // check with nrfutil pkg display ...

export const isDeviceInDFUBootloader = (device: Device) => {
    if (!device) {
        return false;
    }
    if (device.usb) {
        const { descriptor: d } = device.usb.device;
        return (
            d.idVendor === NORDIC_VENDOR_ID &&
            d.idProduct === NORDIC_DFU_PRODUCT_ID &&
            !!device.traits.nordicDfu
        );
    }

    if (device.serialPorts && device.serialPorts[0]) {
        const { vendorId, productId } = device.serialPorts[0];
        return vendorId === '1915' && productId?.toUpperCase() === '521F';
    }
    return false;
};

export const ensureBootloaderMode = (device: Device) => {
    if (isDeviceInDFUBootloader(device)) {
        logger.debug('Device is in the bootloader mode');
        return true;
    }
    logger.debug('Device is NOT in the bootloader mode');
    return false;
};

const getBootloaderInformation = async (device: Device) => {
    const info = await NrfutilDeviceLib.getFwInfo(device);

    const index = info.imageInfoList.findIndex(
        imageInfo => imageInfo.imageType === 'NRFDL_IMAGE_TYPE_BOOTLOADER',
    );
    if (index !== -1) {
        return {
            bootloaderType: info.bootloaderType,
            version: info.imageInfoList[index].version,
        };
    }

    return null;
};

const updateBootloader =
    (
        device: Device,
        onSuccess: (device: Device) => void,
        onFail: (reason?: unknown) => void,
        onProgress: (progress: number, message?: string) => void,
    ): AppThunk =>
    async dispatch => {
        logger.info(`Update bootloader ${device}`);
        const zip = new AdmZip(getAppFile(LATEST_BOOTLOADER));
        const zipBuffer = zip.toBuffer();

        logger.debug('Starting bootloader update');

        onProgress(0, 'Updating bootloader');

        dispatch(
            setWaitForDevice({
                timeout: DEFAULT_DEVICE_WAIT_TIME,
                when: 'always',
                once: false,
                onSuccess,
                onFail,
            }),
        );

        try {
            await NrfutilDeviceLib.program(
                device,
                { buffer: zipBuffer, type: 'zip' },
                progress => {
                    onProgress(
                        progress.totalProgressPercentage,
                        progress.message ?? 'Programming bootloader',
                    );
                },
            );
        } catch (error) {
            if (error) {
                logger.error(
                    `Failed to write bootloader to the target device: ${
                        (error as Error).message || error
                    }`,
                );
                onFail((error as Error).message || error);
            } else {
                dispatch(
                    setWaitForDevice({
                        timeout: DEFAULT_DEVICE_WAIT_TIME,
                        when: 'always',
                        once: true,
                        onSuccess,
                        onFail,
                    }),
                );

                onProgress(100, 'Bootloader updated');
                logger.info('Bootloader has been written to the target device');
                logger.debug('Bootloader DFU completed successfully!');
            }
        }
    };

const switchToDeviceMode =
    (
        device: Device,
        mcuState: McuState,
        onSuccess: (device: Device) => void,
        onFail: (reason?: unknown) => void,
        autoReconnectWhen?: WaitForDeviceWhen,
    ): AppThunk =>
    dispatch => {
        if (autoReconnectWhen === undefined) {
            autoReconnectWhen =
                mcuState === 'Application'
                    ? 'applicationMode'
                    : 'dfuBootLoaderMode';
        }
        dispatch(
            setWaitForDevice({
                timeout: 10000,
                when: autoReconnectWhen,
                once: true,
                onSuccess,
                onFail,
            }),
        );
        NrfutilDeviceLib.setMcuState(device, mcuState).catch(err => {
            dispatch(clearWaitForDevice());
            onFail(err);
        });
    };

export const switchToBootloaderMode =
    (
        device: Device,
        onSuccess: (device: Device) => void,
        onFail: (reason?: unknown) => void,
    ): AppThunk =>
    dispatch => {
        if (!isDeviceInDFUBootloader(device)) {
            dispatch(
                switchToDeviceMode(
                    device,
                    'Programming',
                    d => {
                        if (!isDeviceInDFUBootloader(d))
                            onFail(
                                new Error(
                                    'Failed to switch to the bootloader mode',
                                ),
                            );
                        else onSuccess(d);
                    },
                    onFail,
                ),
            );
        } else if (onSuccess) {
            onSuccess(device);
        }
    };

export const switchToApplicationMode =
    (
        device: Device,
        onSuccess: (device: Device) => void,
        onFail: (reason?: unknown) => void,
        autoReconnectWhen?: WaitForDeviceWhen,
    ): AppThunk =>
    dispatch => {
        if (isDeviceInDFUBootloader(device)) {
            dispatch(
                switchToDeviceMode(
                    device,
                    'Application',
                    d => {
                        if (isDeviceInDFUBootloader(d))
                            onFail(
                                new Error(
                                    'Failed to switch to the application mode',
                                ),
                            );
                        else onSuccess(d);
                    },
                    onFail,
                    autoReconnectWhen,
                ),
            );
        } else {
            onSuccess(device);
        }
    };

const isLatestBootloader = async (device: Device) => {
    if (!isDeviceInDFUBootloader(device)) {
        throw new Error('Cannot read bootloader information.');
    }

    const bootloaderInfo = await getBootloaderInformation(device);

    if (
        !bootloaderInfo ||
        bootloaderInfo.bootloaderType !== 'NRFDL_BOOTLOADER_TYPE_SDFU' ||
        bootloaderInfo.version.toString() >=
            LATEST_BOOTLOADER_VERSION.toString()
    ) {
        return true;
    }

    return false;
};

const askAndUpdateBootloader =
    (
        device: Device,
        onSuccess: (device: Device) => void,
        onFail: (reason?: unknown) => void,
        onProgress: (progress: number, message?: string) => void,
    ): AppThunk =>
    dispatch => {
        dispatch(
            switchToBootloaderMode(
                device,
                async d => {
                    if (!(await isLatestBootloader(d))) {
                        dispatch(
                            openDeviceSetupDialog({
                                onUserInput: isConfirmed => {
                                    if (isConfirmed) {
                                        logger.info(
                                            'Continuing with old bootloader',
                                        );
                                        onSuccess(d);
                                    } else {
                                        const action = (dd: Device) => {
                                            dispatch(
                                                switchToBootloaderMode(
                                                    dd,
                                                    onSuccess,
                                                    onFail,
                                                ),
                                            );
                                        };
                                        dispatch(
                                            updateBootloader(
                                                d,
                                                action,
                                                onFail,
                                                onProgress,
                                            ),
                                        );
                                    }
                                },
                                message:
                                    'Device will be programmed. A newer version of the bootloader is available. Do you want to update it as well?',
                            }),
                        );
                    } else {
                        onSuccess(d);
                    }
                },
                onFail,
            ),
        );
    };

/**
 * Loads firmware image from HEX file
 *
 * @param {Buffer|string} firmware contents of HEX file if Buffer otherwise path of HEX file
 * @returns {Uint8Array} the loaded firmware
 */
function parseFirmwareImage(firmware: Buffer | string) {
    const contents =
        firmware instanceof Buffer ? firmware : fs.readFileSync(firmware);

    const memMap = MemoryMap.fromHex(contents.toString());
    let startAddress = 0;
    let endAddress = 0;
    memMap.forEach((block, address) => {
        startAddress = !startAddress ? address : startAddress;
        endAddress = address + block.length;
    });
    return memMap.slicePad(
        startAddress,
        Math.ceil((endAddress - startAddress) / 4) * 4,
    );
}

function calculateSHA256Hash(image: Uint8Array) {
    const digest = createHash('sha256');
    digest.update(image);
    return Buffer.from(digest.digest().reverse());
}

interface DfuData {
    application?: { bin: Uint8Array; dat: Uint8Array };
    softdevice?: { bin: Uint8Array; dat: Uint8Array };
    params?: InitPacket;
}

const createDfuDataFromImages = (dfuImages: DfuImage[]): DfuData => {
    const extract = (image: DfuImage) => ({
        bin: image.firmwareImage,
        dat: createInitPacketBuffer(
            image.initPacket.fwVersion as number,
            image.initPacket.hwVersion as number,
            image.initPacket.sdReq as number[],
            image.initPacket.fwType as number,
            image.initPacket.sdSize,
            image.initPacket.blSize,
            image.initPacket.appSize,
            image.initPacket.hashType,
            image.initPacket.hash as Buffer,
            image.initPacket.isDebug,
            image.initPacket.signatureType as number,
            image.initPacket.signature as [],
        ),
    });

    const application = dfuImages.find(i => i.name === 'Application');
    const softdevice = dfuImages.find(i => i.name === 'SoftDevice');

    return {
        application: application && extract(application),
        softdevice: softdevice && extract(softdevice),
    };
};

interface Manifest {
    application?: { bin_file: string; dat_file: string };
    softdevice?: { bin_file: string; dat_file: string };
}

const createDfuZip = (dfuImages: DfuImage[]) =>
    new Promise<AdmZip>(resolve => {
        const data = createDfuDataFromImages(dfuImages);
        const zip = new AdmZip();
        const manifest: Manifest = {};

        if (data.application) {
            manifest.application = {
                bin_file: 'application.bin',
                dat_file: 'application.dat',
            };
            zip.addFile('application.bin', data.application.bin as Buffer);
            zip.addFile('application.dat', data.application.dat as Buffer);
        }

        if (data.softdevice) {
            manifest.softdevice = {
                bin_file: 'softdevice.bin',
                dat_file: 'softdevice.dat',
            };
            zip.addFile('softdevice.bin', data.softdevice.bin as Buffer);
            zip.addFile('softdevice.dat', data.softdevice.dat as Buffer);
        }

        const manifestJson = JSON.stringify({ manifest });
        const manifestBuffer = Buffer.alloc(manifestJson.length, manifestJson);
        zip.addFile('manifest.json', manifestBuffer);

        resolve(zip);
    });

const createDfuZipBuffer = async (dfuImages: DfuImage[]) => {
    const zip = await createDfuZip(dfuImages);
    const buffer = zip.toBuffer();
    return buffer;
};

const programInDFUBootloader =
    (
        device: Device,
        dfu: DfuEntry,
        onProgress: (progress: number, message?: string) => void,
        onSuccess: (device: Device) => void,
        onFail: (reason?: unknown) => void,
        autoReconnectAfterProgrammingWhen: WaitForDeviceWhen = 'applicationMode',
    ): AppThunk<RootState, Promise<void>> =>
    async dispatch => {
        logger.debug(`${device.serialNumber} on is now in DFU-Bootloader...`);
        const { application, softdevice } = dfu;
        const params: Partial<InitPacket> = dfu.params || {};

        const dfuImages: DfuImage[] = [];
        if (softdevice) {
            const firmwareImage = parseFirmwareImage(softdevice);

            const initPacketParams = {
                fwType: FwType.SOFTDEVICE,
                fwVersion: 0xffffffff,
                hwVersion: params.hwVersion || 52,
                hashType: HashType.SHA256,
                hash: calculateSHA256Hash(firmwareImage),
                sdSize: firmwareImage.length,
                sdReq: params.sdReq || [],
            };

            const packet: InitPacket = {
                ...defaultInitPacket,
                ...initPacketParams,
            };
            dfuImages.push({
                name: 'SoftDevice',
                initPacket: packet,
                firmwareImage,
            });
        }

        const firmwareImage = parseFirmwareImage(application);

        const initPacketParams = {
            fwType: FwType.APPLICATION,
            fwVersion: params.fwVersion || 4,
            hwVersion: params.hwVersion || 52,
            hashType: HashType.SHA256,
            hash: calculateSHA256Hash(firmwareImage),
            appSize: firmwareImage.length,
            // @ts-expect-error This parameter is set.
            sdReq: params.sdId || [],
        };

        const packet = { ...defaultInitPacket, ...initPacketParams };
        dfuImages.push({
            name: 'Application',
            initPacket: packet,
            firmwareImage,
        });

        const zipBuffer = await createDfuZipBuffer(dfuImages);

        logger.debug('Starting DFU');

        onProgress(0, 'Preparing to program');

        dispatch(
            setWaitForDevice({
                timeout: DEFAULT_DEVICE_WAIT_TIME,
                when: 'always',
                once: false,
                onSuccess,
                onFail,
            }),
        );

        NrfutilDeviceLib.program(
            device,
            { buffer: zipBuffer, type: 'zip' },
            progress => {
                onProgress(
                    progress.totalProgressPercentage,
                    progress.message ?? '',
                );
            },
        )
            .then(() => {
                logger.info(
                    'All DFU images have been written to the target device.',
                );
                logger.debug('DFU completed successfully!');
                dispatch(
                    setWaitForDevice({
                        timeout: DEFAULT_DEVICE_WAIT_TIME,
                        when: autoReconnectAfterProgrammingWhen,
                        once: true,
                        onSuccess,
                        onFail,
                    }),
                );
                onProgress(100, 'Waiting for device to reboot.');
            })
            .catch(err => {
                if (err) {
                    logger.error(
                        `Failed to write to the target device: ${
                            err.message || err
                        }`,
                    );
                    onFail(err);
                }
            });
    };

const programDeviceWithFw =
    (
        device: Device,
        selectedFw: DfuEntry,
        onProgress: (progress: number, message?: string) => void,
        autoReconnectAfterProgrammingWhen: WaitForDeviceWhen = 'applicationMode',
    ): AppThunk<RootState, Promise<Device>> =>
    dispatch =>
        new Promise<Device>((resolve, reject) => {
            const action = (d: Device) => {
                dispatch(
                    programInDFUBootloader(
                        d,
                        selectedFw,
                        onProgress,
                        resolve,
                        reject,
                        autoReconnectAfterProgrammingWhen,
                    ),
                );
                logger.debug('DFU finished: ', d);
            };

            dispatch(
                askAndUpdateBootloader(device, action, reject, onProgress),
            );
        });

export const sdfuDeviceSetup = (
    dfuFirmware: DfuEntry[],
    needSerialport = false,
    autoReconnectAfterProgrammingWhen: WaitForDeviceWhen = 'applicationMode',
): DeviceSetup => ({
    supportsProgrammingMode: (device, deviceInfo) =>
        ((!!deviceInfo?.dfuTriggerVersion &&
            deviceInfo.dfuTriggerVersion.semVer.length > 0) ||
            isDeviceInDFUBootloader(device)) &&
        (needSerialport === device.traits.serialPorts || !needSerialport),
    getFirmwareOptions: device =>
        dfuFirmware.map(firmwareOption => ({
            key: firmwareOption.key,
            description: firmwareOption.description,
            programDevice: onProgress => dispatch =>
                dispatch(
                    programDeviceWithFw(
                        device,
                        firmwareOption,
                        onProgress,
                        autoReconnectAfterProgrammingWhen,
                    ),
                ),
        })),
    isExpectedFirmware: (device, deviceInfo) => () => {
        if (deviceInfo?.dfuTriggerVersion) {
            logger.debug(
                'Device has DFU trigger interface; the device is in the application mode',
            );

            const { semVer } = deviceInfo.dfuTriggerVersion;

            return Promise.resolve({
                device,
                validFirmware:
                    dfuFirmware.filter(fw => fw.semver === semVer).length > 0,
            });
        }

        return Promise.resolve({
            device,
            validFirmware: false,
        });
    },
    tryToSwitchToApplicationMode: device => dispatch =>
        new Promise<Device>((resolve, reject) => {
            dispatch(
                switchToApplicationMode(
                    device,
                    resolve,
                    reject,
                    autoReconnectAfterProgrammingWhen,
                ),
            );
        }),
});

export default {
    createDfuZipBuffer,
};
