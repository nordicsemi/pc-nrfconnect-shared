/*
 * Copyright (c) 2026 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import protobuf from 'protobufjs';

import dfuCcProto from './dfu-cc';
import {
    createInitPacketUint8Array,
    defaultInitPacket,
    FwType,
    HashType,
} from './initPacket';

test('writes the application type explicitly in a DFU init command', () => {
    const bytes = createInitPacketUint8Array({
        ...defaultInitPacket,
        hwVersion: 52,
        sdReq: [0],
        fwType: FwType.APPLICATION,
        appSize: 64,
        hashType: HashType.SHA256,
        hash: Buffer.alloc(32, 0xab),
    });
    const packet = protobuf.Root.fromJSON(dfuCcProto)
        .lookupType('dfu.Packet')
        .decode(bytes) as unknown as { command: { init: object } };

    // The decoder exposes APPLICATION as a default even when its tag is absent.
    expect(
        Object.getOwnPropertyDescriptor(packet.command.init, 'type')?.value,
    ).toBe(FwType.APPLICATION);
});
