"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KCIDEDebugSession = exports.start = exports.activate = void 0;
const vscode_1 = require("vscode");
const debugadapter_1 = require("@vscode/debugadapter");
const vscode = require("vscode");
// @ts-ignore
const await_notify_1 = require("await-notify");
const types_1 = require("./types");
const filesystem_1 = require("./filesystem");
const project_1 = require("./project");
const assembler_1 = require("./assembler");
const emu = require("./emu");
;
;
;
;
function toUint8String(val, noPrefix) {
    const str = val.toString(16).padStart(2, '0').toUpperCase();
    return noPrefix ? str : `0x${str}`;
}
function toUint16String(val, noPrefix) {
    const str = val.toString(16).padStart(4, '0').toUpperCase();
    return noPrefix ? str : `0x${str}`;
}
function uriEqual(uri0, uri1) {
    return String(uri0).toLowerCase() === String(uri1).toLowerCase();
}
function activate(ext) {
    ext.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('kcide', new KCIDEDebugAdapterFactory()));
}
exports.activate = activate;
function start(noDebug) {
    vscode.debug.startDebugging(undefined, {
        type: 'kcide',
        name: 'Debug',
        request: 'launch',
        stopOnEntry: !noDebug,
    }, {
        noDebug
    });
}
exports.start = start;
class KCIDEDebugAdapterFactory {
    createDebugAdapterDescriptor(_session) {
        return new vscode.DebugAdapterInlineImplementation(new KCIDEDebugSession());
    }
}
class KCIDEDebugSession extends debugadapter_1.DebugSession {
    constructor() {
        super();
        this.curStackFrameId = 1;
        this.configurationDone = new await_notify_1.Subject();
        this.sourceMap = undefined;
        this.sourceBreakpoints = [];
        this.instrBreakpoints = [];
        this.breakpointId = 1;
        this.curAddr = undefined;
        KCIDEDebugSession.self = this;
        this.nativeFsRoot = (0, project_1.requireProjectUri)();
        console.log(`debug: nativeFsRoot is ${this.nativeFsRoot}`);
    }
    static onEmulatorMessage(msg) {
        console.log(`KCIDEDebugSession.onEmulatorMessage: ${JSON.stringify(msg)}`);
        if (KCIDEDebugSession.self === undefined) {
            console.log('KCIDEDebugRuntime.onEmulatorMessage: self is undefined (not an error)');
            return;
        }
        // see media/shell.js/init()
        switch (msg.command) {
            case 'emu_stopped':
                KCIDEDebugSession.self.onEmulatorStopped(msg.stopReason, msg.addr);
                break;
            case 'emu_continued':
                KCIDEDebugSession.self.onEmulatorContinued();
                break;
            case 'emu_reboot':
                KCIDEDebugSession.self.onEmulatorReboot();
                break;
            case 'emu_reset':
                KCIDEDebugSession.self.onEmulatorReset();
                break;
        }
    }
    initializeRequest(response, _args) {
        var _a;
        console.log('=> KCIDEDebugSession.initializeRequest');
        response.body = (_a = response.body) !== null && _a !== void 0 ? _a : {};
        response.body.supportsReadMemoryRequest = true;
        response.body.supportsDisassembleRequest = true;
        response.body.supportsInstructionBreakpoints = true;
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportTerminateDebuggee = true;
        this.sendResponse(response);
    }
    configurationDoneRequest(response, args) {
        super.configurationDoneRequest(response, args);
        this.configurationDone.notify();
    }
    disconnectRequest(response, args, _request) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`=> KCIDEDebugSession.disconnectRequest suspend: ${args.suspendDebuggee}, terminate: ${args.terminateDebuggee}`);
            try {
                yield emu.dbgDisconnect();
            }
            catch (err) {
                vscode.window.showErrorMessage(String(err));
            }
            this.sendResponse(response);
        });
    }
    attachRequest(response, args) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('=> KCIDEDebugSession.attachRequest');
            yield this.launchRequest(response, args);
        });
    }
    launchRequest(response, args) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('=> KCIDEDebugSession.launchRequest');
            try {
                const project = yield (0, project_1.loadProject)();
                const binUri = (0, filesystem_1.getOutputBinFileUri)(project);
                this.sourceMap = yield (0, assembler_1.loadSourceMap)(project, KCIDEDebugSession.wasmFsRoot.length);
                yield emu.ensureEmulator(project);
                yield emu.waitReady(5000);
                yield emu.dbgConnect();
                // we're ready to receive breakpoints now
                this.sendEvent(new debugadapter_1.InitializedEvent());
                // wait until breakpoints are configured
                yield this.configurationDone.wait();
                const binData = yield (0, filesystem_1.readBinaryFile)(binUri);
                yield emu.load(project, binData, true, args.stopOnEntry);
            }
            catch (err) {
                const msg = `Failed to launch debug session (${err})`;
                vscode.window.showErrorMessage(msg);
                response.success = false;
                response.message = msg;
            }
            this.sendResponse(response);
        });
    }
    setBreakPointsRequest(response, args, _request) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`=> KCIDEDebugSession.setBreakpointsRequest: args.source.path=${args.source.path}`);
            try {
                // ugly Windows specific hack: if the source path starts with a drive
                // letter, force file:// URL
                const p = args.source.path;
                let uri;
                if (p.slice(1).startsWith(':\\')) {
                    uri = vscode_1.Uri.file(p);
                }
                else {
                    uri = vscode_1.Uri.parse(p, false);
                }
                const clearedBreakpoints = this.clearSourceBreakpointsByUri(uri);
                const clientLines = args.breakpoints.map((bp) => bp.line);
                const debugProtocolBreakpoints = clientLines.map((l) => {
                    const bp = this.addSourceBreakpoint(uri, l);
                    const source = this.sourceFromUri(bp.uri);
                    const protocolBreakpoint = new debugadapter_1.Breakpoint(bp.verified, bp.line, 0, source);
                    protocolBreakpoint.id = bp.id;
                    return bp;
                });
                response.body = { breakpoints: debugProtocolBreakpoints };
                const removeAddrs = clearedBreakpoints.filter((bp) => (bp.addr !== undefined)).map((bp) => bp.addr);
                const addAddrs = this.getSourceBreakpointsByUri(uri).filter((bp) => (bp.addr !== undefined)).map((bp) => bp.addr);
                yield emu.dbgUpdateBreakpoints(removeAddrs, addAddrs);
            }
            catch (err) {
                vscode.window.showErrorMessage(String(err));
            }
            this.sendResponse(response);
        });
    }
    setInstructionBreakpointsRequest(response, args, _request) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('=> KCIDEDebugSession.setInstructionBreakpointsRequest');
            try {
                const clearedBreakpoints = this.clearInstructionBreakpoints();
                const debugProtocolBreakpoints = args.breakpoints.map((ibp) => {
                    var _a;
                    const bp = this.addInstructionBreakpoint(ibp.instructionReference, (_a = ibp.offset) !== null && _a !== void 0 ? _a : 0);
                    const source = this.sourceFromUriOptional(bp.uri);
                    const protocolBreakpoint = new debugadapter_1.Breakpoint(true, bp.line, 0, source);
                    protocolBreakpoint.id = bp.id;
                    if (bp.addr !== undefined) {
                        protocolBreakpoint.instructionReference = toUint16String(bp.addr);
                    }
                    return protocolBreakpoint;
                });
                response.body = { breakpoints: debugProtocolBreakpoints };
                const removeAddrs = clearedBreakpoints.filter((bp) => (bp.addr !== 0)).map((bp) => bp.addr);
                const addAddrs = this.instrBreakpoints.map((bp) => bp.addr);
                yield emu.dbgUpdateBreakpoints(removeAddrs, addAddrs);
            }
            catch (err) {
                vscode.window.showErrorMessage(String(err));
            }
            this.sendResponse(response);
        });
    }
    pauseRequest(response, _args, _request) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('=> KCIDEDebugSession.pauseRequest');
            try {
                yield emu.dbgPause();
            }
            catch (err) {
                vscode.window.showErrorMessage(String(err));
            }
            this.sendResponse(response);
        });
    }
    continueRequest(response, _args) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('=> KCIDEDebugSession.continueRequest');
            try {
                yield emu.dbgContinue();
            }
            catch (err) {
                vscode.window.showErrorMessage(String(err));
            }
            this.sendResponse(response);
        });
    }
    nextRequest(response, _args) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('=> KCIDEDebugSession.nextRequest');
            try {
                yield emu.dbgStep();
            }
            catch (err) {
                vscode.window.showErrorMessage(String(err));
            }
            this.sendResponse(response);
        });
    }
    stepInRequest(response, _args, _request) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('=> KCIDEDebusSession.stepInRequest');
            try {
                yield emu.dbgStepIn();
            }
            catch (err) {
                vscode.window.showErrorMessage(String(err));
            }
            this.sendResponse(response);
        });
    }
    stepOutRequest(response, _args) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('=> KCIDEDebugSession.stepOutRequest');
            try {
                // FIXME: stepOut is not implemented, just do a regular step instead
                yield emu.dbgStep();
            }
            catch (err) {
                vscode.window.showErrorMessage(String(err));
            }
            this.sendResponse(response);
        });
    }
    threadsRequest(response) {
        console.log('=> KCIDEDebugSession.threadsRequest');
        response.body = {
            threads: [
                new debugadapter_1.Thread(KCIDEDebugSession.threadId, 'Thread 1'),
            ]
        };
        this.sendResponse(response);
    }
    stackTraceRequest(response, _args, _request) {
        console.log('=> KCIDEDebugSession.stackTraceRequest');
        const curLocation = this.getCurrentLocation();
        if (curLocation === undefined) {
            this.curStackFrameId += 1;
            const addrStr = toUint16String(this.curAddr);
            response.body = {
                stackFrames: [
                    {
                        id: this.curStackFrameId,
                        name: addrStr,
                        source: new debugadapter_1.Source('Unknown Source'),
                        line: 0,
                        column: 0,
                        instructionPointerReference: addrStr,
                        presentationHint: 'subtle',
                    }
                ],
                totalFrames: 1,
            };
        }
        else {
            this.curStackFrameId += 1;
            const addrStr = toUint16String(curLocation.addr);
            response.body = {
                stackFrames: [
                    {
                        id: this.curStackFrameId,
                        name: addrStr,
                        source: this.sourceFromUriOptional(curLocation.uri),
                        line: curLocation.line,
                        instructionPointerReference: addrStr,
                        column: 0,
                    },
                ],
                totalFrames: 1,
            };
        }
        this.sendResponse(response);
    }
    scopesRequest(response, _args) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('=> KCIDEDebugSession.scopesRequest');
            response.body = {
                scopes: [
                    new debugadapter_1.Scope('CPU', 1, false)
                ]
            };
            this.sendResponse(response);
            yield this.openDisassemblyViewIfStoppedInUnmappedLocation();
        });
    }
    variablesRequest(response, _args, _request) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('=> KCIDEDebugSession.variablesRequest');
            const cpuState = yield emu.dbgCpuState();
            const toUint16Var = (name, val) => ({
                name,
                value: toUint16String(val),
                variablesReference: 0,
                memoryReference: toUint16String(val),
            });
            const toUint8Var = (name, val) => ({
                name,
                value: toUint8String(val),
                variablesReference: 0,
            });
            const toBoolVar = (name, val) => ({
                name,
                value: (val !== 0) ? 'true' : 'false',
                variablesReference: 0,
            });
            const toCpuFlags = (name, val) => {
                const f = val & 0xFF;
                const z80Flags = (f) => {
                    return [
                        (f & (1 << 7)) ? 'S' : '-',
                        (f & (1 << 6)) ? 'Z' : '-',
                        (f & (1 << 5)) ? 'Y' : '-',
                        (f & (1 << 4)) ? 'H' : '-',
                        (f & (1 << 3)) ? 'X' : '-',
                        (f & (1 << 2)) ? 'V' : '-',
                        (f & (1 << 1)) ? 'N' : '-',
                        (f & (1 << 0)) ? 'C' : '-',
                    ].join('');
                };
                const m6502Flags = (f) => {
                    return [
                        (f & (1 << 7)) ? 'N' : '-',
                        (f & (1 << 6)) ? 'V' : '-',
                        (f & (1 << 5)) ? 'X' : '-',
                        (f & (1 << 4)) ? 'B' : '-',
                        (f & (1 << 3)) ? 'D' : '-',
                        (f & (1 << 2)) ? 'I' : '-',
                        (f & (1 << 1)) ? 'Z' : '-',
                        (f & (1 << 0)) ? 'C' : '-',
                    ].join('');
                };
                return {
                    name,
                    value: (cpuState.type === types_1.CPU.Z80) ? z80Flags(f) : m6502Flags(f),
                    variablesReference: 0,
                };
            };
            try {
                // try/catch just in case cpuState isn't actually a proper CPUState object
                if (cpuState.type === types_1.CPU.Z80) {
                    response.body = {
                        variables: [
                            toCpuFlags('Flags', cpuState.z80.af),
                            toUint16Var('AF', cpuState.z80.af),
                            toUint16Var('BC', cpuState.z80.bc),
                            toUint16Var('DE', cpuState.z80.de),
                            toUint16Var('HL', cpuState.z80.hl),
                            toUint16Var('IX', cpuState.z80.ix),
                            toUint16Var('IY', cpuState.z80.iy),
                            toUint16Var('SP', cpuState.z80.sp),
                            toUint16Var('PC', cpuState.z80.pc),
                            toUint16Var('AF\'', cpuState.z80.af2),
                            toUint16Var('BC\'', cpuState.z80.bc2),
                            toUint16Var('DE\'', cpuState.z80.de2),
                            toUint16Var('HL\'', cpuState.z80.hl2),
                            toUint8Var('IM', cpuState.z80.im),
                            toUint8Var('I', (cpuState.z80.ir & 0xFF00) >> 8),
                            toUint8Var('R', cpuState.z80.ir & 0xFF),
                            toBoolVar('IFF1', cpuState.z80.iff & 1),
                            toBoolVar('IFF2', cpuState.z80.iff & 2)
                        ]
                    };
                }
                else if (cpuState.type === types_1.CPU.M6502) {
                    response.body = {
                        variables: [
                            toCpuFlags('Flags', cpuState.m6502.p),
                            toUint8Var('A', cpuState.m6502.a),
                            toUint8Var('X', cpuState.m6502.x),
                            toUint8Var('Y', cpuState.m6502.y),
                            toUint8Var('S', cpuState.m6502.s),
                            toUint8Var('P', cpuState.m6502.p),
                            toUint16Var('PC', cpuState.m6502.pc),
                        ]
                    };
                }
                else {
                    response.body = { variables: [] };
                }
            }
            catch (err) {
                response.body = { variables: [] };
            }
            this.sendResponse(response);
        });
    }
    disassembleRequest(response, args, _request) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const cursorAddr = parseInt(args.memoryReference);
            const offset = (_a = args.instructionOffset) !== null && _a !== void 0 ? _a : 0;
            const count = args.instructionCount;
            const disasmLines = yield emu.requestDisassembly(cursorAddr, offset, count);
            const instructions = disasmLines.map((line) => {
                const loc = this.getLocationByAddr(line.addr);
                return {
                    // NOTE: make sure the address string starts with `0x`, otherwise the
                    // VSCode debugger view will get confused and skip those lines
                    address: toUint16String(line.addr),
                    instructionBytes: line.bytes.map((byte) => toUint8String(byte, true)).join(' '),
                    instruction: line.chars,
                    location: this.sourceFromUriOptional(loc === null || loc === void 0 ? void 0 : loc.uri),
                    line: (loc === undefined) ? undefined : loc.line,
                };
            });
            response.body = { instructions };
            this.sendResponse(response);
        });
    }
    readMemoryRequest(response, args, _request) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const addr = parseInt(args.memoryReference);
            const offset = (_a = args.offset) !== null && _a !== void 0 ? _a : 0;
            const numBytes = args.count;
            const bytes = yield emu.readMemory(addr, offset, numBytes);
            response.body = {
                address: toUint16String(bytes.addr),
                data: bytes.base64Data,
            };
            this.sendResponse(response);
        });
    }
    getLocationByAddr(addr) {
        if (this.sourceMap === undefined) {
            throw new Error('No source map loaded!');
        }
        const loc = this.sourceMap.addrToSource[addr];
        if (loc === undefined) {
            return undefined;
        }
        return {
            uri: vscode_1.Uri.joinPath(this.nativeFsRoot, loc.source),
            line: loc.line,
            addr,
        };
    }
    getWorkspaceRelativePath(uri) {
        console.log(`KCIDEDebugSession.getWorkspaceRelativePath(${uri})`);
        const path = uri.path;
        const rootPath = this.nativeFsRoot.path;
        console.log(`KCIDEDebugSession.getWorkspaceRelativePath(): path=${path}, rootPath=${rootPath}`);
        // Windows is inconsistant with device letter casing
        if (path.toLowerCase().startsWith(rootPath.toLowerCase())) {
            return path.slice(rootPath.length + 1);
        }
        else {
            // FIXME: should this be a hard error?
            console.log(`KCIDEDebugSession.getWorkspaceRelativePath(): incoming uri path ${path} doesn't start with ${rootPath}`);
            return path;
        }
    }
    sourceFromUri(uri) {
        console.log(`KCIDEDebugSession.sourceFromUri(${uri})`);
        const name = this.getWorkspaceRelativePath(uri);
        return new debugadapter_1.Source(name, String(uri), 0);
    }
    sourceFromUriOptional(uri) {
        if (uri === undefined) {
            return undefined;
        }
        return this.sourceFromUri(uri);
    }
    getCurrentLocation() {
        if (this.curAddr === undefined) {
            return undefined;
        }
        return this.getLocationByAddr(this.curAddr);
    }
    clearSourceBreakpointsByUri(uri) {
        const clearedBreakpoints = this.sourceBreakpoints.filter((bp) => uriEqual(bp.uri, uri));
        this.sourceBreakpoints = this.sourceBreakpoints.filter((bp) => !uriEqual(bp.uri, uri));
        return clearedBreakpoints;
    }
    getSourceBreakpointsByUri(uri) {
        return this.sourceBreakpoints.filter((bp) => uriEqual(bp.uri, uri));
    }
    addSourceBreakpoint(uri, line) {
        var _a;
        if (this.sourceMap === undefined) {
            throw new Error('No source map loaded!');
        }
        const workspaceRelativePath = this.getWorkspaceRelativePath(uri);
        let addr = undefined;
        if (this.sourceMap.sourceToAddr[workspaceRelativePath] !== undefined) {
            addr = (_a = this.sourceMap.sourceToAddr[workspaceRelativePath][line]) !== null && _a !== void 0 ? _a : undefined;
        }
        const bp = {
            verified: addr !== undefined,
            uri,
            workspaceRelativePath,
            source: this.sourceFromUri(uri),
            line,
            addr,
            id: this.breakpointId++
        };
        this.sourceBreakpoints.push(bp);
        return bp;
    }
    clearInstructionBreakpoints() {
        const clearedBreakpoints = this.instrBreakpoints;
        this.instrBreakpoints = [];
        return clearedBreakpoints;
    }
    addInstructionBreakpoint(instructionReference, offset) {
        if (this.sourceMap === undefined) {
            throw new Error('No source map loaded!');
        }
        const addr = parseInt(instructionReference) + offset;
        let workspaceRelativePath;
        let uri;
        let line;
        if (this.sourceMap.addrToSource[addr]) {
            workspaceRelativePath = this.sourceMap.addrToSource[addr].source;
            uri = vscode_1.Uri.joinPath(this.nativeFsRoot, workspaceRelativePath);
            line = this.sourceMap.addrToSource[addr].line;
        }
        const bp = {
            uri,
            workspaceRelativePath,
            source: this.sourceFromUriOptional(uri),
            line,
            addr,
            id: this.breakpointId++,
        };
        this.instrBreakpoints.push(bp);
        return bp;
    }
    onEmulatorStopped(stopReason, addr) {
        this.curAddr = addr;
        switch (stopReason) {
            case 1: // WEBAPI_STOPREASON_BREAK
                this.sendEvent(new debugadapter_1.StoppedEvent('pause', KCIDEDebugSession.threadId));
                break;
            case 2: // WEBAPI_STOPREASON_BREAKPOINT
                this.sendEvent(new debugadapter_1.StoppedEvent('breakpoint', KCIDEDebugSession.threadId));
                break;
            case 3: // WEBAPI_STOPREASON_STEP
                this.sendEvent(new debugadapter_1.StoppedEvent('step', KCIDEDebugSession.threadId));
                break;
            case 4: // WEBAPI_STOPREASON_ENTRY
                this.sendEvent(new debugadapter_1.StoppedEvent('entry', KCIDEDebugSession.threadId));
                break;
            case 5: // WEBAPI_STOPREASON_EXIT
                this.sendEvent(new debugadapter_1.TerminatedEvent());
                break;
        }
    }
    onEmulatorContinued() {
        this.sendEvent(new debugadapter_1.ContinuedEvent(KCIDEDebugSession.threadId));
    }
    onEmulatorReboot() {
        this.sendEvent(new debugadapter_1.TerminatedEvent());
    }
    onEmulatorReset() {
        this.sendEvent(new debugadapter_1.TerminatedEvent());
    }
    // this is a bit of a hack to automatically open the disassembly view when the debugger
    // is stopped in an unknown location
    openDisassemblyViewIfStoppedInUnmappedLocation() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.sourceMap === undefined) {
                throw new Error('No source map loaded!');
            }
            if ((this.curAddr !== undefined) && (this.sourceMap.addrToSource[this.curAddr] === undefined)) {
                yield vscode.commands.executeCommand('debug.action.openDisassemblyView');
                const tabs = vscode.window.tabGroups.all.map(tg => tg.tabs).flat();
                const index = tabs.findIndex((tab) => tab.label === 'Unknown Source');
                if (index !== -1) {
                    yield vscode.window.tabGroups.close(tabs[index]);
                }
            }
        });
    }
}
exports.KCIDEDebugSession = KCIDEDebugSession;
KCIDEDebugSession.self = undefined;
KCIDEDebugSession.wasmFsRoot = '/workspace/';
KCIDEDebugSession.threadId = 1;
//# sourceMappingURL=debug.js.map