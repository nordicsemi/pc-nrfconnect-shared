/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { type DeviceInfo } from '../../nrfutil/device';
import {
    type DeviceTraits,
    type NrfutilDevice,
} from '../../nrfutil/device/common';
import NrfutilDeviceLib from '../../nrfutil/device/device';
import logger from '../logging';
import type { AppThunk, RootState } from '../store';
import simplifyDevice from '../telemetry/simplifyDevice';
import telemetry from '../telemetry/telemetry';
import {
    getPersistedIsFavorite,
    getPersistedNickname,
    getPersistedSerialPortSettings,
} from '../utils/persistentStore';
import {
    clearWaitForDevice,
    clearWaitForDeviceTimeout,
    setArrivedButWrongWhen,
    setDisconnectedTime,
    setLastArrivedDeviceId,
    setOnCancelTimeout,
    setWaitForDeviceTimeout,
    type WaitForDevice,
} from './deviceAutoSelectSlice';
import { closeDeviceSetupDialog } from './deviceSetupSlice';
import {
    addDevice,
    type Device,
    removeDevice,
    selectDevice,
    setSelectedDeviceInfo,
} from './deviceSlice';
import { isDeviceInDFUBootloader } from './sdfuOperations';

let stopNrfutilDevice: (callback?: () => void) => void;
let autoSelectDeviceCLISerialUsed = false;

const hasSameDeviceTraits = (
    deviceTraits: DeviceTraits,
    otherDeviceTraits: DeviceTraits,
) =>
    Object.keys(otherDeviceTraits).every(
        rule =>
            deviceTraits[rule as keyof DeviceTraits] ===
            otherDeviceTraits[rule as keyof DeviceTraits],
    );

const shouldAutoReselect = (
    addedDevice: Device,
    globalAutoReselect: boolean,
    autoReselectDevice?: Device,
    disconnectionTime?: number,
    currentSelectedDevice?: Device,
): boolean => {
    // No device was selected when disconnection occurred
    if (!autoReselectDevice) return false;

    // device is still connected
    if (disconnectionTime === undefined) return false;

    // device does not have sn
    if (!addedDevice.serialNumber) {
        return false;
    }

    // The device that was selected when disconnection occurred is not yet connected
    if (addedDevice.serialNumber !== autoReselectDevice.serialNumber) {
        return false;
    }

    // The device is already selected
    if (
        currentSelectedDevice?.serialNumber === autoReselectDevice.serialNumber
    ) {
        return false;
    }

    // Device does not have the same traits
    if (!hasSameDeviceTraits(addedDevice.traits, autoReselectDevice.traits)) {
        return false;
    }

    return globalAutoReselect;
};

export const hasModem = (device: Device, deviceInfo?: DeviceInfo) =>
    !!(
        device.traits.modem ||
        deviceInfo?.jlink?.deviceFamily?.toUpperCase() === 'NRF91_FAMILY' ||
        deviceInfo?.jlink?.deviceFamily?.toUpperCase() === 'NRF92_FAMILY'
    );

const initAutoReconnectTimeout =
    (onTimeout: () => void, waitForDevice: WaitForDevice): AppThunk =>
    dispatch => {
        const timeout = waitForDevice.timeout;

        dispatch(setOnCancelTimeout(onTimeout));

        dispatch(
            setWaitForDeviceTimeout(
                window.setTimeout(() => {
                    dispatch(closeDeviceSetupDialog());
                    if (waitForDevice?.onFail)
                        waitForDevice?.onFail(
                            `Failed to detect device after reboot. Timed out after ${
                                timeout / 1000
                            } seconds.`,
                        );
                    dispatch(clearWaitForDevice());
                    logger.warn(
                        `Failed to detect device after reboot. Timed out after ${
                            timeout / 1000
                        } seconds.`,
                    );
                }, timeout),
            ),
        );
    };

export const hasValidDeviceTraits = (
    deviceTraits: DeviceTraits,
    requiredTraits: DeviceTraits,
) =>
    Object.keys(requiredTraits).some(
        rule =>
            deviceTraits[rule as keyof DeviceTraits] &&
            requiredTraits[rule as keyof DeviceTraits],
    ) ||
    Object.keys(requiredTraits).every(
        rule => requiredTraits[rule as keyof DeviceTraits] === false,
    );

const removeDeviceFromList =
    (
        removedDevice: Device,
        onDeviceDeselected: () => void,
        onDeviceDisconnected: (device: Device) => void,
    ): AppThunk =>
    (dispatch, getState) => {
        if (
            removedDevice.serialNumber !==
            getState().device.selectedDevice?.serialNumber
        ) {
            dispatch(removeDevice(removedDevice));
            onDeviceDisconnected(removedDevice);
            return;
        }

        onDeviceDeselected();

        if (!getState().deviceAutoSelect.waitForDevice) {
            dispatch(closeDeviceSetupDialog());
        }

        if (!getState().deviceAutoSelect.arrivedButWrongWhen) {
            dispatch(removeDevice(removedDevice));
            onDeviceDisconnected(removedDevice);
        }
    };
/*
 * Starts watching for devices with the given traits. See the nrfutil device
 * library for available traits. Whenever devices are attached/detached, this
 * will dispatch AddDevice or removeDevice and trigger events.
 */

const setPersistedData = (device: Device) => {
    if (device.serialNumber) {
        const newDevice = { ...device };
        newDevice.favorite = getPersistedIsFavorite(device.serialNumber);
        newDevice.nickname = getPersistedNickname(device.serialNumber);

        const persistedSerialPortSettings = getPersistedSerialPortSettings(
            device.serialNumber,
        );

        if (persistedSerialPortSettings) {
            const path =
                newDevice.serialPorts?.[persistedSerialPortSettings.vComIndex]
                    ?.comName;

            if (path) {
                newDevice.persistedSerialPortOptions = {
                    ...persistedSerialPortSettings.serialPortOptions,
                    path,
                };
            }
        }

        return newDevice;
    }

    return device;
};

export const startWatchingDevices =
    (
        deviceListing: DeviceTraits,
        onDeviceConnected: (device: Device) => void,
        onDeviceDisconnected: (device: Device) => void,
        onDeviceDeselected: () => void,
        doSelectDevice: (device: Device, autoReselected: boolean) => void,
    ): AppThunk<RootState, void> =>
    (dispatch, getState) => {
        const deviceToProcess: Device[] = [];
        const onDeviceArrived = (dev: NrfutilDevice) => {
            deviceToProcess.push(dev);
            if (deviceToProcess.length > 1) {
                return;
            }

            const action = async (device: Device) => {
                if (hasValidDeviceTraits(device.traits, deviceListing)) {
                    telemetry.sendEvent(
                        'device connected',
                        simplifyDevice(device),
                    );
                    if (
                        !getState().device.devices.find(
                            d =>
                                d.id === device.id ||
                                (device.serialNumber && // we want to disregard comparing devices with no sn
                                    d.serialNumber === device.serialNumber),
                        )
                    ) {
                        logger.info(
                            `Device connected with the serial number ${device.serialNumber}`,
                        );
                        onDeviceConnected(device);
                    }

                    const disconnectionTime =
                        getState().deviceAutoSelect.disconnectionTime;
                    const autoSelectDevice = getState().deviceAutoSelect.device;
                    const selectedDevice = getState().device.selectedDevice;

                    const result = shouldAutoReselect(
                        device,
                        getState().deviceAutoSelect.autoReselect,
                        autoSelectDevice,
                        disconnectionTime,
                        selectedDevice,
                    );

                    dispatch(addDevice(device));
                    const deviceWithPersistedData =
                        getState().device.devices.find(
                            d => d.serialNumber === device.serialNumber,
                        );

                    if (!deviceWithPersistedData) return;

                    // Selected device information such as serial port may have been updated ... let's update the state with new information
                    if (
                        selectedDevice?.id === deviceWithPersistedData.id &&
                        selectedDevice?.serialNumber ===
                            deviceWithPersistedData.serialNumber
                    ) {
                        dispatch(selectDevice(deviceWithPersistedData));
                    }

                    // We might get multiple events with the same info so no to trigger auto reconnect multiple times we
                    // only do it once per device id
                    if (
                        result &&
                        getState().deviceAutoSelect.lastArrivedDeviceId !==
                            deviceWithPersistedData.id
                    ) {
                        dispatch(
                            setLastArrivedDeviceId(deviceWithPersistedData.id),
                        );

                        const deviceInfo =
                            await NrfutilDeviceLib.deviceInfo(device);

                        logger.info(
                            `Auto-reconnecting to device with the serial number: ${deviceWithPersistedData.serialNumber}`,
                        );
                        doSelectDevice(deviceWithPersistedData, true);
                        dispatch(setSelectedDeviceInfo(deviceInfo));
                    } else if (
                        deviceWithPersistedData.serialNumber ===
                        getState().deviceAutoSelect.device?.serialNumber
                    ) {
                        const waitForDevice =
                            getState().deviceAutoSelect.waitForDevice;

                        // Device lib might fail to advertise that a device has left before it rejoins (Mainly OSx)
                        // but we still need to trigger the onSuccess if a device 'reappeared' with a different 'id'
                        // and there is an outstanding waitForDevice Request. In this case the disconnectionTime was
                        // never set (as NRFDL_DEVICE_EVENT_LEFT was never sent) This created an additional problem as device
                        // lib may advertise the the same device with a single connect event. Hance we are keeping track of
                        // the device ID which is guaranteed to be change if a is disconnected and reconnected (for the
                        // same hotplug event listener) to ensure we only call the onSuccess once for every reconnect event.
                        // This is mostly relevant when 'when' is always

                        // Device is to be reconnected as timeout is provided
                        if (
                            waitForDevice &&
                            ((disconnectionTime === undefined &&
                                getState().deviceAutoSelect
                                    .lastArrivedDeviceId !==
                                    deviceWithPersistedData.id) ||
                                (disconnectionTime ?? 0) +
                                    waitForDevice.timeout >=
                                    Date.now())
                        ) {
                            if (
                                waitForDevice.when === 'always' ||
                                (waitForDevice.when === 'dfuBootLoaderMode' &&
                                    isDeviceInDFUBootloader(
                                        deviceWithPersistedData,
                                    )) ||
                                (waitForDevice.when === 'applicationMode' &&
                                    deviceWithPersistedData.traits.nordicDfu &&
                                    !isDeviceInDFUBootloader(
                                        deviceWithPersistedData,
                                    )) ||
                                (selectedDevice &&
                                    waitForDevice.when === 'sameTraits' &&
                                    hasSameDeviceTraits(
                                        device.traits,
                                        selectedDevice.traits,
                                    )) ||
                                (typeof waitForDevice.when === 'function' &&
                                    waitForDevice.when(device))
                            ) {
                                dispatch(setArrivedButWrongWhen(undefined));
                                dispatch(
                                    setLastArrivedDeviceId(
                                        deviceWithPersistedData.id,
                                    ),
                                );
                                dispatch(setDisconnectedTime(undefined));

                                logger.info('Wait For Device was successful');

                                dispatch(
                                    clearWaitForDeviceTimeout(
                                        waitForDevice.once,
                                    ),
                                );

                                dispatch(selectDevice(deviceWithPersistedData));

                                if (!waitForDevice.skipRefetchDeviceInfo) {
                                    const deviceInfo =
                                        await NrfutilDeviceLib.deviceInfo(
                                            device,
                                        );
                                    dispatch(setSelectedDeviceInfo(deviceInfo));

                                    // Modem might be set to false when using external jLink or custom PCBs
                                    if (
                                        !deviceWithPersistedData.traits.modem &&
                                        hasModem(
                                            deviceWithPersistedData,
                                            deviceInfo,
                                        )
                                    ) {
                                        deviceWithPersistedData.traits.modem = true;
                                        dispatch(
                                            selectDevice(
                                                deviceWithPersistedData,
                                            ),
                                        );
                                    }
                                }

                                if (waitForDevice.onSuccess)
                                    waitForDevice.onSuccess(
                                        deviceWithPersistedData,
                                    );
                            } else {
                                dispatch(setArrivedButWrongWhen(true));
                            }
                        }
                    }
                }
            };

            const rec = (p: Promise<void>) => {
                p.finally(() => {
                    deviceToProcess.splice(0, 1); // remove completed devices
                    const d = deviceToProcess[0];
                    if (!d) return;
                    rec(action(d));
                });
            };

            rec(action(deviceToProcess[0]));
        };
        const onDeviceLeft = (id: number) => {
            const devices = getState().device.devices;

            devices.forEach(device => {
                if (device.id === id) {
                    const waitForDevice =
                        getState().deviceAutoSelect.waitForDevice;
                    if (
                        device.serialNumber && // we want to disregard comparing devices with no sn
                        device.serialNumber ===
                            getState().deviceAutoSelect.device?.serialNumber
                    ) {
                        if (waitForDevice) {
                            dispatch(setArrivedButWrongWhen(undefined));

                            dispatch(
                                initAutoReconnectTimeout(
                                    () =>
                                        dispatch(
                                            removeDeviceFromList(
                                                device,
                                                onDeviceDeselected,
                                                onDeviceDisconnected,
                                            ),
                                        ),
                                    waitForDevice,
                                ),
                            );
                        } else {
                            dispatch(
                                removeDeviceFromList(
                                    device,
                                    onDeviceDeselected,
                                    onDeviceDisconnected,
                                ),
                            );
                        }

                        dispatch(setDisconnectedTime(Date.now()));
                    } else {
                        dispatch(
                            removeDeviceFromList(
                                device,
                                onDeviceDeselected,
                                onDeviceDisconnected,
                            ),
                        );
                    }
                }
            });
        };

        stopWatchingDevices(async () => {
            const operation = await NrfutilDeviceLib.list(
                deviceListing,
                d => {
                    d = d.map(setPersistedData);
                    d.forEach(onDeviceArrived);
                    autoSelectDeviceCLI(d, doSelectDevice);
                },
                error => {
                    logger.error(error);
                },
                {
                    onDeviceArrived: d => {
                        d = setPersistedData(d);
                        onDeviceArrived(d);
                    },
                    onDeviceLeft,
                },
            );

            stopNrfutilDevice = (callback?: () => void) => {
                operation.stop(() => {
                    callback?.();
                });
            };
        });
    };

const getAutoSelectDeviceCLIProperty = (
    property: string,
    findDevice: (value: string) => Device | undefined,
) => {
    const { argv } = process;
    const index = argv.findIndex(arg => arg === property);
    return index > -1
        ? { index, device: findDevice(argv[index + 1]) }
        : undefined;
};

const getAutoSelectDevice = (devices: Device[]) => {
    const serialNumber = getAutoSelectDeviceCLIProperty('--deviceSerial', sn =>
        devices.find(device => device.serialNumber === sn),
    );
    const serialPort = getAutoSelectDeviceCLIProperty('--comPort', portPath =>
        devices.find(device =>
            device.serialPorts?.find(port => port.comName === portPath),
        ),
    );

    if (serialNumber && serialPort) {
        if (serialNumber.index > serialPort.index) {
            return serialPort.device;
        }

        return serialNumber.device;
    }

    if (serialNumber) {
        return serialNumber.device;
    }

    if (serialPort) {
        return serialPort.device;
    }
};

const autoSelectDeviceCLI = (
    devices: Device[],
    doSelectDevice: (device: Device, autoReselected: boolean) => void,
) => {
    if (!autoSelectDeviceCLISerialUsed) {
        const autoSelectDevice = getAutoSelectDevice(devices);

        if (autoSelectDevice) doSelectDevice(autoSelectDevice, true);

        autoSelectDeviceCLISerialUsed = true;
    }
};

export const stopWatchingDevices = (callback?: () => void) => {
    if (stopNrfutilDevice) stopNrfutilDevice(callback);
    else callback?.();
};
