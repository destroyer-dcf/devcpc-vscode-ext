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
exports.requireWasiEnv = void 0;
const v1_1 = require("@vscode/wasm-wasi/v1");
const vscode_1 = require("vscode");
let wasiEnv = null;
function requireWasiEnv(ext) {
    return __awaiter(this, void 0, void 0, function* () {
        if (wasiEnv === null) {
            const wasm = yield v1_1.Wasm.load();
            const fs = yield wasm.createRootFileSystem([{ kind: 'workspaceFolder' }]);
            const bits = yield vscode_1.workspace.fs.readFile(vscode_1.Uri.joinPath(ext.extensionUri, 'media/asmx.wasm'));
            const asmx = yield WebAssembly.compile(bits);
            wasiEnv = { wasm, fs, asmx };
        }
        return wasiEnv;
    });
}
exports.requireWasiEnv = requireWasiEnv;
//# sourceMappingURL=wasi.js.map