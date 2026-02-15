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
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const commands = require("./commands");
const debug = require("./debug");
const emu = require("./emu");
function activate(ext) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            ext.subscriptions.push(vscode.commands.registerCommand('floooh.kcide.build', () => __awaiter(this, void 0, void 0, function* () {
                yield commands.asmBuild(ext);
            })), vscode.commands.registerCommand('floooh.kcide.debug', () => __awaiter(this, void 0, void 0, function* () {
                yield commands.asmDebug(ext);
            })), vscode.commands.registerCommand('floooh.kcide.openEmulator', () => __awaiter(this, void 0, void 0, function* () {
                yield commands.openEmulator();
            })), vscode.commands.registerCommand('floooh.kcide.bootEmulator', () => __awaiter(this, void 0, void 0, function* () {
                yield commands.bootEmulator();
            })), vscode.commands.registerCommand('floooh.kcide.resetEmulator', () => __awaiter(this, void 0, void 0, function* () {
                yield commands.resetEmulator();
            })), vscode.commands.registerCommand('floooh.kcide.focusEmulator', () => {
                // the delay is used for switching back to the emulator
                // panel after VSCode stole the focus (for instance when debugging)
                emu.focusEmulator(100);
            }));
            debug.activate(ext);
            // keep this at the end since it may throw when no folder is opened, but this lets the
            // actual extension initialize properly
            yield emu.init();
        }
        catch (err) {
            vscode.window.showErrorMessage(String(err));
        }
    });
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map