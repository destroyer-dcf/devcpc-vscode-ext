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
exports.resetEmulator = exports.bootEmulator = exports.openEmulator = exports.asmDebug = exports.asmBuild = void 0;
const vscode_1 = require("vscode");
const assembler_1 = require("./assembler");
const project_1 = require("./project");
const emu = require("./emu");
const debug = require("./debug");
function asmBuild(ext) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const project = yield (0, project_1.loadProject)();
            const result = yield (0, assembler_1.assemble)(ext, project, { genListingFile: true, genObjectFile: true, genMapFile: true });
            if (result.diagnostics.numErrors === 0) {
                const uri = yield (0, assembler_1.writeOutputFile)(project, result.objectUri, true);
                vscode_1.window.showInformationMessage(`Output written to ${uri.path}`);
            }
            else {
                vscode_1.window.showErrorMessage(`Build failed with ${result.diagnostics.numErrors} error(s)`);
            }
        }
        catch (err) {
            vscode_1.window.showErrorMessage(String(err));
        }
    });
}
exports.asmBuild = asmBuild;
function asmDebug(ext) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const project = yield (0, project_1.loadProject)();
            const result = yield (0, assembler_1.assemble)(ext, project, { genListingFile: true, genObjectFile: true, genMapFile: true });
            if (result.diagnostics.numErrors === 0) {
                yield (0, assembler_1.writeOutputFile)(project, result.objectUri, true);
                debug.start(false);
            }
            else {
                vscode_1.window.showErrorMessage(`Build failed with ${result.diagnostics.numErrors} error(s)`);
            }
        }
        catch (err) {
            vscode_1.window.showErrorMessage(String(err));
        }
    });
}
exports.asmDebug = asmDebug;
function openEmulator() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const project = yield (0, project_1.loadProject)();
            yield emu.ensureEmulator(project);
        }
        catch (err) {
            vscode_1.window.showErrorMessage(String(err));
        }
    });
}
exports.openEmulator = openEmulator;
function bootEmulator() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const project = yield (0, project_1.loadProject)();
            yield emu.ensureEmulator(project);
            yield emu.bootEmulator();
        }
        catch (err) {
            vscode_1.window.showErrorMessage(String(err));
        }
    });
}
exports.bootEmulator = bootEmulator;
function resetEmulator() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const project = yield (0, project_1.loadProject)();
            yield emu.ensureEmulator(project);
            yield emu.resetEmulator();
        }
        catch (err) {
            vscode_1.window.showErrorMessage(String(err));
        }
    });
}
exports.resetEmulator = resetEmulator;
//# sourceMappingURL=commands.js.map