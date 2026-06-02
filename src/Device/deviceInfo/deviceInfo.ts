/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

/*
   eslint-disable import/no-webpack-loader-syntax,import/no-unresolved --

   It would be nice to process all SVGs with svgr, which would make the two
   disables above unnecessary, but that would be a breaking change for all
   apps that rely on the current configuration, which uses the file loader
   to load SVGs.

   The difference between the file loader and using svgr:

   - With the file loaded an URL is returned which then can be used (e.g. in an img tag) like this:

       import chipIconUrl from './chipIconUrl.svg';
       const Icon = () => <img src={chipIconUrl} />

   - With svgr a react component is returned, which then can be rendered like this:

       import ChipIcon from '!!@svgr!./chipIconUrl.svg';
       const Icon = () => <ChipIcon />

   One of the advantages of svgr is, that it includes the SVG inline, so it can be styled
   through CSS, e.g. to change the colours.
*/

import { type KnownDevicePCA } from '../../../ipc/device';
import { type NrfutilDevice } from '../../../nrfutil/device';
import type { Device as WrappedDevice } from '../deviceSlice';

import nPMFamilyLogo from '!!@svgr!./nPM-Family-Series-logo.svg';
import nrf51logo from '!!@svgr!./nRF51-Series-logo.svg';
import nrf52logo from '!!@svgr!./nRF52-Series-logo.svg';
import nrf53logo from '!!@svgr!./nRF53-Series-logo.svg';
import nrf54logo from '!!@svgr!./nRF54-Series-logo.svg';
import nrf7002logo from '!!@svgr!./nRF70-Series_no-background_RGB.svg';
import nrf91logo from '!!@svgr!./nRF91-Series-logo.svg';
import nrf92logo from '!!@svgr!./nRF92-series-logo.svg';
import nrf93logo from '!!@svgr!./nRF93-series-logo.svg';
import ppkLogo from '!!@svgr!./ppk-logo.svg';
import unknownLogo from '!!@svgr!./unknown-logo.svg';
import unknownNordicLogo from '!!@svgr!./unknown-nordic-logo.svg';

type Device = NrfutilDevice | WrappedDevice;

interface DeviceInfo {
    name?: string | null;
    cores?: number;
    icon: React.ElementType;
    website: {
        productPage?: string;
        buyOnline?: string;
    };
}

const devicesByPca: { [P in KnownDevicePCA]: DeviceInfo } = {
    PCA10028: {
        name: 'nRF51 DK',
        cores: 1,
        icon: nrf51logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Software-and-tools/Development-Kits/nRF51-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nrf51-DK&series_token=nRF51822',
        },
    },
    PCA10031: {
        name: 'nRF51 Dongle',
        cores: 1,
        icon: nrf51logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Software-and-tools/Development-Kits/nRF51-Dongle',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF51-Dongle&series_token=nRF51822',
        },
    },
    PCA10040: {
        name: 'nRF52 DK',
        cores: 1,
        icon: nrf52logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Software-and-tools/Development-Kits/nRF52-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF52-DK&series_token=nRF52832',
        },
    },
    PCA10056: {
        name: 'nRF52840 DK',
        cores: 1,
        icon: nrf52logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Software-and-tools/Development-Kits/nRF52840-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nrf52840-DK&series_token=nRF52840',
        },
    },
    PCA10059: {
        name: 'nRF52840 Dongle',
        cores: 1,
        icon: nrf52logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Software-and-tools/Development-Kits/nRF52840-Dongle',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF52840DONGLE&series_token=nRF52840',
        },
    },
    PCA10090: {
        name: 'nRF9160 DK',
        cores: 1,
        icon: nrf91logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Software-and-tools/Development-Kits/nRF9160-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nrf9160-DK&series_token=nRF9160',
        },
    },
    PCA10095: {
        name: 'nRF5340 DK',
        cores: 2,
        icon: nrf53logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Software-and-tools/Development-Kits/nRF5340-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF5340-DK&series_token=nRF5340',
        },
    },
    PCA10100: {
        name: 'nRF52833 DK',
        cores: 1,
        icon: nrf52logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Software-and-tools/Development-Kits/nRF52833-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF52833-DK&series_token=nRF52833',
        },
    },
    PCA10121: {
        name: 'nRF5340 Audio DK',
        cores: 2,
        icon: nrf53logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF5340-Audio-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF5340-Audio-DK&series_token=nRF5340',
        },
    },
    PCA20020: {
        name: 'Nordic Thingy:52',
        cores: 1,
        icon: nrf52logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Software-and-tools/Prototyping-platforms/Nordic-Thingy-52',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF6936&series_token=nRF52832',
        },
    },
    PCA20053: {
        name: 'Nordic Thingy:53',
        cores: 1,
        icon: nrf53logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/Nordic-Thingy-53',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=thingy53',
        },
    },
    PCA20035: {
        name: 'Nordic Thingy:91',
        cores: 1,
        icon: nrf91logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Software-and-tools/Prototyping-platforms/Nordic-Thingy-91',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF6943&series_token=nRF9160',
        },
    },
    PCA10143: {
        name: 'nRF7002 DK',
        cores: 2,
        icon: nrf7002logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF7002-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF7002-DK&series_token=nRF7002',
        },
    },
    PCA10152: {
        name: 'nPM 1300 EK',
        cores: 2,
        icon: nPMFamilyLogo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nPM1300-EK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=NPM1300EK',
        },
    },
    PCA10153: {
        name: 'nRF9161 DK',
        cores: 1,
        icon: nrf91logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF9161-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=NRF9161-DK',
        },
    },
    PCA10165: {
        name: 'nRF9131 EK',
        cores: 1,
        icon: nrf91logo,
        website: {},
    },
    PCA20049: {
        name: 'Nordic Thingy:91 X',
        cores: 1,
        icon: nrf91logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/Nordic-Thingy-91-X',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=THINGY91X',
        },
    },
    PCA10171: {
        name: 'nRF9151 DK',
        cores: 1,
        icon: nrf91logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF9151-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=NRF9151-DK',
        },
    },
    PCA10156: {
        name: 'nRF54L15 DK',
        cores: 1,
        icon: nrf54logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF54L15-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF54L15%20DK',
        },
    },
    PCA10175: {
        name: 'nRF54H20 DK',
        cores: 1,
        icon: nrf54logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF54H20-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF54H20%20DK',
        },
    },
    PCA10184: {
        name: 'nRF54LM20 DK',
        cores: 1,
        icon: nrf54logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF54LM20-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF54LM20%20DK',
        },
    },
    PCA10188: {
        name: 'nRF54LV10 DK',
        cores: 1,
        icon: nrf54logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF54LV10-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF54LV10%20DK',
        },
    },
    PCA10214: {
        name: 'nRF54LS05 DK',
        cores: 1,
        icon: nrf54logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF54LS05-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF54LS05%20DK',
        },
    },
    PCA10201: {
        name: 'nRF9151 SMA DK',
        cores: 1,
        icon: nrf91logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF9151-SMA-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=NRF9151%20SMA%20DK',
        },
    },
    PCA10218: {
        name: 'nRF9251 DK',
        cores: 1,
        icon: nrf92logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF9251-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=NRF9251%20DK',
        },
    },
    PCA10232: {
        name: 'nRF93M1 DK',
        cores: 1,
        icon: nrf93logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF93M1-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF93M1%20DK',
        },
    },
    PCA10237: {
        name: 'nRF93M1 DK',
        cores: 1,
        icon: nrf93logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF93M1-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF93M1%20DK',
        },
    },
    PCA10226: {
        name: 'nRF54LC10 DK',
        cores: 1,
        icon: nrf54logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Products/Development-hardware/nRF54LC10-DK',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF54LC10%20DK',
        },
    },
    PCA10208: {
        name: 'nRF54LM20 Dongle',
        cores: 1,
        icon: nrf54logo,
        website: {
            productPage:
                'https://www.nordicsemi.com/Software-and-tools/Development-Kits/nRF54LM20-Dongle',
            buyOnline:
                'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF54LM20DONGLE&series_token=nRF54LM20',
        },
    },
};

const deviceByPca = (device: Device) =>
    devicesByPca[
        String(device.devkit?.boardVersion).toUpperCase() as KnownDevicePCA
    ];

const NORDIC_VENDOR_ID = '1915';
const isNordicDevice = (device: Device) =>
    device.serialPorts?.[0]?.vendorId === NORDIC_VENDOR_ID;

const ppkDeviceInfo = (device: Device): DeviceInfo => ({
    name: device.usb?.product,
    icon: ppkLogo,
    website: {
        productPage:
            'https://www.nordicsemi.com/Software-and-tools/Development-Tools/Power-Profiler-Kit-2',
        buyOnline:
            'https://www.nordicsemi.com/About-us/BuyOnline?search_token=nRF-PPK2',
    },
});

const deviceByUsb = (device: Device) => {
    if (isNordicDevice(device)) {
        if (device.usb?.product?.startsWith('PPK')) {
            return ppkDeviceInfo(device);
        }
        if (device.usb?.product?.includes('Thingy:53')) {
            return devicesByPca.PCA20053;
        }
        if (device.serialNumber?.startsWith('THINGY91X')) {
            return devicesByPca.PCA20049;
        }
        if (device.serialNumber?.startsWith('THINGY91')) {
            return devicesByPca.PCA20035;
        }
    }
    return null;
};

const unknownDevice = (device: Device): DeviceInfo => ({
    name: device.usb?.product,
    icon: isNordicDevice(device) ? unknownNordicLogo : unknownLogo,
    website: {},
});

export const deviceInfo = (device: Device): DeviceInfo =>
    deviceByPca(device) || deviceByUsb(device) || unknownDevice(device);

const hasNickname = (
    device: Device,
): device is WrappedDevice & Required<Pick<WrappedDevice, 'nickname'>> =>
    'nickname' in device &&
    device.nickname !== undefined &&
    device.nickname.length > 0;

export const displayedDeviceName = (
    device: Device,
    { respectNickname = true } = {},
) => {
    if (respectNickname && hasNickname(device)) {
        return device.nickname;
    }

    return deviceInfo(device).name || device.devkit?.boardVersion || 'Unknown';
};
