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
exports.readMemory = exports.requestDisassembly = exports.dbgCpuState = exports.dbgStepIn = exports.dbgStep = exports.dbgContinue = exports.dbgPause = exports.dbgUpdateBreakpoints = exports.dbgDisconnect = exports.dbgConnect = exports.resetEmulator = exports.bootEmulator = exports.load = exports.init = exports.waitReady = exports.ensureEmulator = exports.focusEmulator = void 0;
const vscode_1 = require("vscode");
const debug_1 = require("./debug");
const types_1 = require("./types");
const filesystem_1 = require("./filesystem");
const project_1 = require("./project");
const assembler_1 = require("./assembler");
const filetypes_1 = require("./filetypes");
;
let state = null;
function setupEmulator(project) {
    return __awaiter(this, void 0, void 0, function* () {
        const rootUri = vscode_1.Uri.joinPath((0, filesystem_1.getExtensionUri)(), 'media');
        const panel = vscode_1.window.createWebviewPanel('kcide_emu', // type
        project.emulator.system, // title
        {
            viewColumn: vscode_1.ViewColumn.Beside,
            preserveFocus: true,
        }, {
            enableScripts: true,
            enableForms: false,
            retainContextWhenHidden: true,
            localResourceRoots: [rootUri],
        });
        if (project.emulator.system === types_1.System.C64) {
            panel.iconPath = vscode_1.Uri.joinPath(rootUri, 'c64-logo-small.png');
        }
        else if (project.emulator.system === types_1.System.CPC6128) {
            panel.iconPath = vscode_1.Uri.joinPath(rootUri, 'cpc-logo-small.png');
        }
        else {
            panel.iconPath = vscode_1.Uri.joinPath(rootUri, 'kc85-logo-small.png');
        }
        panel.onDidDispose(() => {
            state = null;
        });
        panel.webview.onDidReceiveMessage((msg) => {
            if (msg.command === 'emu_cpustate') {
                cpuStateResolved(msg.state);
            }
            else if (msg.command === 'emu_disassembly') {
                disassemblyResolved(msg.result);
            }
            else if (msg.command === 'emu_memory') {
                readMemoryResolved(msg.result);
            }
            else if (msg.command === 'emu_ready') {
                if (state) {
                    state.ready = msg.isReady;
                }
            }
            else {
                debug_1.KCIDEDebugSession.onEmulatorMessage(msg);
            }
        });
        let emuFilename;
        switch (project.emulator.system) {
            case types_1.System.KC853:
                emuFilename = 'kc853-ui.js';
                break;
            case types_1.System.C64:
                emuFilename = 'c64-ui.js';
                break;
            case types_1.System.CPC6128:
                emuFilename = 'cpc-ui.js';
                break;
            default:
                emuFilename = 'kc854-ui.js';
                break;
        }
        const emuUri = panel.webview.asWebviewUri(vscode_1.Uri.joinPath(rootUri, emuFilename));
        const shellUri = panel.webview.asWebviewUri(vscode_1.Uri.joinPath(rootUri, 'shell.js'));
        const templ = yield (0, filesystem_1.readTextFile)(vscode_1.Uri.joinPath(rootUri, 'shell.html'));
        const html = templ.replace('{{{emu}}}', emuUri.toString()).replace('{{{shell}}}', shellUri.toString());
        panel.webview.html = html;
        return { panel, system: project.emulator.system, ready: false };
    });
}
function discardEmulator() {
    if (state) {
        state.panel.dispose();
        // state is now set to null because onDidDispose callback has been called
    }
}
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function focusEmulator(delayMs) {
    return __awaiter(this, void 0, void 0, function* () {
        if (state) {
            if (delayMs !== undefined) {
                yield wait(delayMs);
            }
            if (!state.panel.active) {
                state.panel.reveal();
            }
        }
    });
}
exports.focusEmulator = focusEmulator;
function ensureEmulator(project) {
    return __awaiter(this, void 0, void 0, function* () {
        if (state === null) {
            state = yield setupEmulator(project);
        }
        else {
            if (state.system !== project.emulator.system) {
                discardEmulator();
                state = yield setupEmulator(project);
            }
            state.panel.reveal(undefined, true);
        }
    });
}
exports.ensureEmulator = ensureEmulator;
function waitReady(timeoutMs) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        if (state !== null) {
            state.ready = false;
        }
        let t = 0;
        const dt = 100;
        while (t < timeoutMs) {
            // give the webview some time to come up
            yield wait(dt);
            if (state && state.ready) {
                return true;
            }
            const webview = (_a = state === null || state === void 0 ? void 0 : state.panel) === null || _a === void 0 ? void 0 : _a.webview;
            if (webview) {
                yield webview.postMessage({ cmd: 'ready' });
            }
            t += dt;
        }
        return false;
    });
}
exports.waitReady = waitReady;
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        const project = yield (0, project_1.loadProject)();
        yield ensureEmulator(project);
    });
}
exports.init = init;
function toBase64(data) {
    return btoa(String.fromCodePoint(...data));
}
function load(project, data, start, stopOnEntry) {
    return __awaiter(this, void 0, void 0, function* () {
        if (state) {
            // try to extract start address
            const symbolMap = yield (0, assembler_1.loadSymbolMap)(project);
            const startAddr = symbolMap['_start'];
            if (startAddr === undefined) {
                throw new Error('No \'_start\' label found in project!');
            }
            // wrap KCC, PRG, etc... into our own container format
            const container = (0, filetypes_1.toContainerFile)(data, project.assembler.outFiletype, startAddr, start, stopOnEntry);
            const containerBase64 = toBase64(container);
            yield state.panel.webview.postMessage({ cmd: 'load', data: containerBase64 });
        }
        else {
            throw new Error('Emulator not initialized!');
        }
    });
}
exports.load = load;
function bootEmulator() {
    return __awaiter(this, void 0, void 0, function* () {
        if (state) {
            yield state.panel.webview.postMessage({ cmd: 'boot' });
        }
        else {
            throw new Error('Emulator not initialized!');
        }
    });
}
exports.bootEmulator = bootEmulator;
function resetEmulator() {
    return __awaiter(this, void 0, void 0, function* () {
        if (state) {
            yield state.panel.webview.postMessage({ cmd: 'reset' });
        }
        else {
            throw new Error('Emulator not initialized!');
        }
    });
}
exports.resetEmulator = resetEmulator;
function dbgConnect() {
    return __awaiter(this, void 0, void 0, function* () {
        if (state) {
            yield state.panel.webview.postMessage({ cmd: 'connect' });
        }
        else {
            throw new Error('Emulator not initialized!');
        }
    });
}
exports.dbgConnect = dbgConnect;
function dbgDisconnect() {
    return __awaiter(this, void 0, void 0, function* () {
        if (state) {
            yield state.panel.webview.postMessage({ cmd: 'disconnect' });
        }
        else {
            throw new Error('Emulator not initialized!');
        }
    });
}
exports.dbgDisconnect = dbgDisconnect;
function dbgUpdateBreakpoints(removeAddrs, addAddrs) {
    return __awaiter(this, void 0, void 0, function* () {
        if (state) {
            yield state.panel.webview.postMessage({ cmd: 'updateBreakpoints', removeAddrs, addAddrs });
        }
        else {
            throw new Error('Emulator not initialized!');
        }
    });
}
exports.dbgUpdateBreakpoints = dbgUpdateBreakpoints;
function dbgPause() {
    return __awaiter(this, void 0, void 0, function* () {
        if (state) {
            yield state.panel.webview.postMessage({ cmd: 'pause' });
        }
        else {
            throw new Error('Emulator not initialized!');
        }
    });
}
exports.dbgPause = dbgPause;
function dbgContinue() {
    return __awaiter(this, void 0, void 0, function* () {
        if (state) {
            yield state.panel.webview.postMessage({ cmd: 'continue' });
        }
        else {
            throw new Error('Emulator not initialized!');
        }
    });
}
exports.dbgContinue = dbgContinue;
function dbgStep() {
    return __awaiter(this, void 0, void 0, function* () {
        if (state) {
            yield state.panel.webview.postMessage({ cmd: 'step' });
        }
        else {
            throw new Error('Emulator not initialized!');
        }
    });
}
exports.dbgStep = dbgStep;
function dbgStepIn() {
    return __awaiter(this, void 0, void 0, function* () {
        if (state) {
            yield state.panel.webview.postMessage({ cmd: 'stepIn' });
        }
        else {
            throw new Error('Emulator not initialized!');
        }
    });
}
exports.dbgStepIn = dbgStepIn;
let cpuStateResolved;
function dbgCpuState() {
    return __awaiter(this, void 0, void 0, function* () {
        yield state.panel.webview.postMessage({ cmd: 'cpuState' });
        return new Promise((resolve) => {
            cpuStateResolved = resolve;
        });
    });
}
exports.dbgCpuState = dbgCpuState;
let disassemblyResolved;
function requestDisassembly(addr, offsetLines, numLines) {
    return __awaiter(this, void 0, void 0, function* () {
        yield state.panel.webview.postMessage({ cmd: 'disassemble', addr, offsetLines, numLines });
        return new Promise((resolve) => {
            disassemblyResolved = resolve;
        });
    });
}
exports.requestDisassembly = requestDisassembly;
let readMemoryResolved;
function readMemory(addr, offset, numBytes) {
    return __awaiter(this, void 0, void 0, function* () {
        const resolvedAddr = (addr + offset) & 0xFFFF;
        yield state.panel.webview.postMessage({ cmd: 'readMemory', addr: resolvedAddr, numBytes });
        return new Promise((resolve) => {
            readMemoryResolved = resolve;
        });
    });
}
exports.readMemory = readMemory;
//# sourceMappingURL=emu.js.map