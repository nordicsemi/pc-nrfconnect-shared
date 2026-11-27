/*
 * Copyright (c) 2023 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { type Terminal } from '@xterm/headless';
import EventEmitter from 'node:events';

import logger from '../logging';
import { type SerialPort } from '../SerialPort/SerialPort';

export interface Callbacks {
    onSuccess: (response: string, command: string) => void;
    onError: (message: string, command: string) => void;
    onTimeout?: (message: string, command: string) => void;
}

export interface ShellParserSettings {
    shellPromptUart?: string;
    logRegex: RegExp;
    errorRegex: RegExp;
    timeout: number;
    columnWidth: number;
}

interface CommandEnqueue {
    command: string;
    callbacks: Callbacks[];
    sent: boolean;
    sentTime: number;
    timeout?: number;
}

export type ShellParser = Awaited<ReturnType<typeof shellParser>>;
export type XTerminalShellParser = ReturnType<
    typeof xTerminalShellParserWrapper
>;

export const xTerminalShellParserWrapper = (terminal: Terminal) => ({
    getTerminalData: () => {
        let result = '';
        for (let i = 0; i <= terminal.buffer.active.cursorY; i += 1) {
            const line = terminal.buffer.active.getLine(i);
            if (typeof line !== 'undefined') {
                result += `\r\n${line.translateToString()}`;
            }
        }

        return result.trim();
    },
    clear: () => terminal.clear(),
    getLastLine: () => {
        const lastLine = terminal.buffer.active.getLine(
            terminal.buffer.active.cursorY,
        );
        if (typeof lastLine === 'undefined') {
            return '';
        }

        return lastLine.translateToString().trim();
    },
    write: (data: string, callback: () => void) =>
        terminal.write(data, callback),
});

export const shellParser = async (
    serialPort: SerialPort,
    xTerminalShellParser: XTerminalShellParser,
    settings: ShellParserSettings = {
        logRegex:
            /[[][0-9]{2,}:[0-9]{2}:[0-9]{2}.[0-9]{3},[0-9]{3}] <([^<^>]+)> ([^:]+): .*(\r\n|\r|\n)$/,
        errorRegex: /Error /,
        timeout: 1000,
        columnWidth: 80,
    },
    shellEchos = true,
) => {
    const eventEmitter = new EventEmitter();

    let commandBuffer = '';
    const commandQueueCallbacks = new Map<string, Callbacks[]>();
    const commandQueue: CommandEnqueue[] = [];
    let cr = false;
    let crnl = false;
    let pausedState = true; // Assume we have some command in the shell that has user has started typing

    // init shell mode

    if (await serialPort.isOpen()) {
        serialPort.write(
            `${String.fromCharCode(12)}${String.fromCharCode(21)}`,
        );
    }

    const initDataSend = async () => {
        if (!(await serialPort.isOpen())) return;
        if (pausedState) return; // user is typing

        sendCommands();
    };

    const sendCommands = () => {
        if (commandQueue.length > 0 && canProcess()) {
            const command = commandQueue[0];
            if (command && !command.sent) {
                serialPort.write(`${command.command}\r\n`);
                command.sent = true;
                command.sentTime = Date.now();
                const t = setTimeout(() => {
                    const elapsedTime = Date.now() - command.sentTime;
                    command.callbacks.forEach(callback => {
                        if (callback.onTimeout)
                            callback.onTimeout(
                                `Callback timeout after ${elapsedTime}ms`,
                                command.command,
                            );
                    });

                    commandQueue.shift();
                    sendCommands();
                }, command.timeout ?? settings.timeout);
                command.callbacks.push({
                    onSuccess: () => clearTimeout(t),
                    onError: () => clearTimeout(t),
                });
            }
        }
    };

    const parseShellCommands = (data: string, endToken: string) => {
        // Buffer does not have the end token hence we have to consider the response
        // to still have pending bytes hence we need to wait more.
        if (data.indexOf(endToken.trim()) !== -1) {
            const responseFromShell = data.split(endToken.trim());
            responseFromShell.forEach((response, index) => {
                if (index === responseFromShell.length - 1) return;

                if (response.trim().length === 0 && response !== '\r\n') return;

                responseCallback(response.trimStart());
            });

            // Incomplete command leave it for future processing
            const remainingCommandPart = responseFromShell.pop();
            if (remainingCommandPart && remainingCommandPart.length > 0) {
                return remainingCommandPart;
            }

            return '';
        }

        return data;
    };

    const responseCallback = (commandAndResponse: string) => {
        if (settings.shellPromptUart == null) {
            logger.error(
                'Shell Parser: responseCallback: Shell prompt has not been set',
            );
            return;
        }

        let callbackFound = false;
        let usedBufferedDataWrittenData = false;

        commandAndResponse = commandAndResponse.trim();

        if (bufferedDataWrittenData.includes('\r')) {
            const splitDataWrittenData = bufferedDataWrittenData
                .split('\r')
                .filter(v => v.trim() !== '');

            if (splitDataWrittenData) {
                commandAndResponse = `${
                    splitDataWrittenData[0]?.trim() ?? ''
                }\r\n${commandAndResponse}`;

                bufferedDataWrittenData = splitDataWrittenData
                    .splice(1)
                    .join('\r');
                usedBufferedDataWrittenData = true;
            } else {
                bufferedDataWrittenData = '';
            }
        }

        const isError = commandAndResponse.match(settings.errorRegex) !== null;

        // Trigger one time callbacks
        if (commandQueue.length > 0) {
            let cmd = commandQueue[0].command;

            if (
                !usedBufferedDataWrittenData &&
                cmd.length + settings.shellPromptUart.length >
                    settings.columnWidth
            ) {
                cmd = settings.shellPromptUart + cmd;
                const chunks = [];
                while (cmd.length > 0) {
                    chunks.push(cmd.substring(0, settings.columnWidth).trim());
                    cmd = cmd.substring(settings.columnWidth, cmd.length);
                }
                cmd = chunks.join('\r\n');
                cmd = cmd.replace(settings.shellPromptUart, '');
            }

            const regex = `^(${cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`;

            // we need to replace \r and \n as shell might add \r \n when shell wraps
            const matched = commandAndResponse.match(regex);
            if (matched && commandQueue[0].sent) {
                const response = commandAndResponse
                    .replace(commandQueue[0].command, '')
                    .trim();
                if (isError) {
                    commandQueue[0].callbacks.forEach(callback =>
                        callback.onError(response, commandQueue[0].command),
                    );
                    callbackFound = true;
                } else {
                    commandQueue[0].callbacks.forEach(callback =>
                        callback.onSuccess(response, commandQueue[0].command),
                    );
                    callbackFound = true;
                }

                eventEmitter.emit('anyCommandResponse', {
                    command: commandQueue[0].command,
                    response,
                    error: isError,
                });

                commandQueue.shift();

                serialPort.isOpen().then(isOpen => {
                    if (isOpen && commandQueue.length > 0 && !pausedState) {
                        sendCommands();
                    }
                });
            }
        }

        // Trigger permanent time callbacks
        commandQueueCallbacks.forEach((callbacks, key) => {
            const commandMatch = commandAndResponse.match(`^(${key})`);
            if (commandMatch) {
                const response = commandAndResponse
                    .replace(new RegExp(`^(${key})\r\n`), '')
                    .trim();
                if (isError) {
                    callbacks.forEach(callback => {
                        callback.onError(response, commandMatch[0]);
                    });
                } else {
                    callbacks.forEach(callback => {
                        callback.onSuccess(response, commandMatch[0]);
                    });
                }

                if (!callbackFound) {
                    eventEmitter.emit('anyCommandResponse', {
                        command: commandMatch[0],
                        response,
                        error: isError,
                    });
                }

                callbackFound = true;
            }
        });

        if (!callbackFound && commandAndResponse !== '') {
            eventEmitter.emit('unknownCommand', commandAndResponse);
        }
    };

    const loadToBuffer = (newline: boolean) => {
        commandBuffer = `${commandBuffer}${xTerminalShellParser.getTerminalData()}${
            newline ? '\r\n' : ''
        }`;

        xTerminalShellParser.clear();

        if (settings.shellPromptUart == null) {
            logger.debug(
                'Shell Parser: loadToBuffer: Shell prompt has not been set',
            );
            return;
        }

        if (commandBuffer.match(settings.logRegex)) {
            eventEmitter.emit(
                'shellLogging',
                commandBuffer
                    .replace(settings.shellPromptUart.trim(), '')
                    .trim(),
            ); // TODO Consider improving tests instead of cleaning this here
            commandBuffer = '';
            return;
        }

        if (commandBuffer === settings.shellPromptUart.trim()) {
            commandBuffer = '';
        }
    };

    const processBuffer = () => {
        if (!canProcess()) {
            return;
        }

        loadToBuffer(false);

        if (settings.shellPromptUart == null) {
            const match = commandBuffer.match(/[a-zA-Z]+:~\$/);
            if (match) {
                settings.shellPromptUart = `${match[0]} `;
                logger.debug(
                    `Shell Parser: found shell prompt: "${settings.shellPromptUart}"`,
                );
            }
        } else {
            commandBuffer = parseShellCommands(
                commandBuffer,
                settings.shellPromptUart.trim(),
            );
        }

        xTerminalShellParser.clear();
        pausedState = false;
        eventEmitter.emit('pausedChanged', false);
    };

    const unregisterOnClosed = serialPort.onClosed(() => {
        if (settings.shellPromptUart == null) {
            logger.debug(
                'Shell Parser: unregisterOnClosed: Shell prompt has not been set',
            );
            return;
        }

        loadToBuffer(false);

        commandBuffer += settings.shellPromptUart.trim();

        commandBuffer = parseShellCommands(
            commandBuffer,
            settings.shellPromptUart.trim(),
        );

        xTerminalShellParser.clear();
    });

    const processSerialData = (data: Uint8Array) => {
        data.forEach((byte, index) => {
            cr = byte === 13 || (cr && byte === 10);
            crnl = cr && byte === 10;

            const callback = crnl ? () => loadToBuffer(true) : processBuffer;

            xTerminalShellParser.write(String.fromCharCode(byte), () => {
                if (index + 1 === data.length) updateIsPaused();
                callback();
            });
        });
    };

    // Hook to listen to all modem data
    const unregisterOnResponse = serialPort.onData(processSerialData);

    let bufferedDataWrittenData = '';
    const unregisterOnDataWritten = serialPort.onDataWritten(data => {
        if (!shellEchos) {
            bufferedDataWrittenData += Buffer.from(data).toString();
            bufferedDataWrittenData.replaceAll('\r\n', '\r');
        }

        if (!pausedState) {
            eventEmitter.emit('pausedChanged', true);
        }

        updateIsPaused();
    });

    const canProcess = () => {
        if (settings.shellPromptUart == null) return true;

        return (
            xTerminalShellParser.getLastLine() ===
                settings.shellPromptUart.trim() &&
            (bufferedDataWrittenData === '' ||
                bufferedDataWrittenData.endsWith('\r')) !== null
        );
    };

    const updateIsPaused = () => {
        const shellPaused = !canProcess();
        if (pausedState !== shellPaused) {
            pausedState = shellPaused;
            eventEmitter.emit('pausedChanged', pausedState);
        }
        if (!shellPaused) sendCommands();
    };

    const unPause = () => serialPort.write(String.fromCharCode(21));

    updateIsPaused();

    return {
        onPausedChange: (handler: (state: boolean) => void) => {
            eventEmitter.on('pausedChanged', handler);
            handler(pausedState);
            return () => {
                eventEmitter.removeListener('pausedChanged', handler);
            };
        },
        onShellLoggingEvent: (handler: (state: string) => void) => {
            eventEmitter.on('shellLogging', handler);
            return () => {
                eventEmitter.removeListener('shellLogging', handler);
            };
        },
        onAnyCommandResponse: (
            handler: ({
                command,
                response,
                error,
            }: {
                command: string;
                response: string;
                error: boolean;
            }) => void,
        ) => {
            eventEmitter.on('anyCommandResponse', handler);
            return () => {
                eventEmitter.removeListener('anyCommandResponse', handler);
            };
        },
        onUnknownCommand: (handler: (state: string) => void) => {
            eventEmitter.on('unknownCommand', handler);
            return () => {
                eventEmitter.removeListener('unknownCommand', handler);
            };
        },
        enqueueRequest: async (
            command: string,
            callbacks?: Callbacks,
            timeout?: number,
            unique = false,
        ) => {
            command = command.trim();

            if (unique) {
                const existingCommand = commandQueue.find(
                    item => item.command === command,
                );
                if (existingCommand) {
                    if (callbacks) existingCommand.callbacks.push(callbacks);

                    if (timeout !== undefined && existingCommand.sent) {
                        console.warn(
                            `Timeout of ${timeout} for command ${command} has been ignored as command
                            has already been sent. Timeout of ${existingCommand.timeout} was used.`,
                        );
                    } else if (timeout !== undefined) {
                        console.warn(
                            `Timeout for command ${command} has been updated to ${timeout}`,
                        );
                        existingCommand.timeout = timeout;
                    }

                    // init sending of commands
                    await initDataSend();
                    return;
                }
            }

            commandQueue.push({
                command,
                callbacks: callbacks ? [callbacks] : [],
                sent: false,
                sentTime: -1,
                timeout,
            });

            // init sending of commands
            await initDataSend();
        },
        registerCommandCallback: (
            command: string,
            onSuccess: (data: string, command: string) => void,
            onError: (error: string, command: string) => void,
        ) => {
            // Add Callbacks to the queue for future responses
            const callbacks = { onSuccess, onError };
            const existingCallbacks = commandQueueCallbacks.get(command);
            if (typeof existingCallbacks !== 'undefined') {
                commandQueueCallbacks.set(command, [
                    ...existingCallbacks,
                    callbacks,
                ]);
            } else {
                commandQueueCallbacks.set(command, [{ onSuccess, onError }]);
            }

            return () => {
                const cb = commandQueueCallbacks.get(command);

                if (cb === undefined) return;

                if (cb.length === 1) {
                    commandQueueCallbacks.delete(command);
                    return;
                }

                cb.splice(cb.indexOf(callbacks), 1);
                commandQueueCallbacks.set(command, cb);
            };
        },
        unregister: () => {
            unregisterOnResponse();
            unregisterOnDataWritten();
            unregisterOnClosed();
            eventEmitter.removeAllListeners();
        },
        isPaused: () => pausedState,
        unPause,
        setShellEchos: (value: boolean) => {
            shellEchos = value;
            if (shellEchos) bufferedDataWrittenData = '';
        },
    };
};
