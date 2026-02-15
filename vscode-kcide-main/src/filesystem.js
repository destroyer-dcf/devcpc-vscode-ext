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
exports.getExtensionUri = exports.getOutputBinFileUri = exports.getOutputMapFileUri = exports.getOutputListFileUri = exports.getOutputObjectFileUri = exports.getOutputFileUri = exports.getOutDirUri = exports.getMainSourceUri = exports.getSourceDirUri = exports.readTextFile = exports.ensureBuildDir = exports.readBinaryFile = exports.writeBinaryFile = exports.dirExists = exports.fileExists = exports.uriToWasmPath = void 0;
const vscode_1 = require("vscode");
const types_1 = require("./types");
const wasi_1 = require("./wasi");
const decoder = new TextDecoder('utf-8');
function uriToWasmPath(ext, uri) {
    return __awaiter(this, void 0, void 0, function* () {
        const wasiEnv = yield (0, wasi_1.requireWasiEnv)(ext);
        const uriPath = yield wasiEnv.fs.toWasm(uri);
        if (uriPath === undefined) {
            throw new Error(`uriToWasmPath: ctx.fs.toWasm(${uriPath}) failed!`);
        }
        return uriPath;
    });
}
exports.uriToWasmPath = uriToWasmPath;
function fileExists(uri) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return (yield vscode_1.workspace.fs.stat(uri)).type === vscode_1.FileType.File;
        }
        catch (err) {
            return false;
        }
    });
}
exports.fileExists = fileExists;
function dirExists(uri) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return (yield vscode_1.workspace.fs.stat(uri)).type === vscode_1.FileType.Directory;
        }
        catch (err) {
            return false;
        }
    });
}
exports.dirExists = dirExists;
function writeBinaryFile(uri, data) {
    return __awaiter(this, void 0, void 0, function* () {
        yield vscode_1.workspace.fs.writeFile(uri, data);
    });
}
exports.writeBinaryFile = writeBinaryFile;
function readBinaryFile(uri) {
    return __awaiter(this, void 0, void 0, function* () {
        const exists = yield fileExists(uri);
        if (!exists) {
            throw new Error(`File not found: ${uri.path}`);
        }
        return vscode_1.workspace.fs.readFile(uri);
    });
}
exports.readBinaryFile = readBinaryFile;
function ensureBuildDir(project) {
    return __awaiter(this, void 0, void 0, function* () {
        const uri = vscode_1.Uri.joinPath(project.uri, project.assembler.outDir);
        const exists = yield dirExists(uri);
        if (!exists) {
            yield vscode_1.workspace.fs.createDirectory(uri);
        }
        return uri;
    });
}
exports.ensureBuildDir = ensureBuildDir;
function readTextFile(uri) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield readBinaryFile(uri);
        return decoder.decode(data);
    });
}
exports.readTextFile = readTextFile;
function getSourceDirUri(project) {
    return vscode_1.Uri.joinPath(project.uri, project.assembler.srcDir);
}
exports.getSourceDirUri = getSourceDirUri;
function getMainSourceUri(project) {
    return vscode_1.Uri.joinPath(getSourceDirUri(project), project.assembler.mainSourceFile);
}
exports.getMainSourceUri = getMainSourceUri;
function getOutDirUri(project) {
    return vscode_1.Uri.joinPath(project.uri, project.assembler.outDir);
}
exports.getOutDirUri = getOutDirUri;
function getOutputFileUri(project, filename) {
    return vscode_1.Uri.joinPath(getOutDirUri(project), filename);
}
exports.getOutputFileUri = getOutputFileUri;
function getOutputObjectFileUri(project) {
    return getOutputFileUri(project, `${project.assembler.outBaseFilename}.hex`);
}
exports.getOutputObjectFileUri = getOutputObjectFileUri;
function getOutputListFileUri(project) {
    return getOutputFileUri(project, `${project.assembler.outBaseFilename}.lst`);
}
exports.getOutputListFileUri = getOutputListFileUri;
function getOutputMapFileUri(project) {
    return getOutputFileUri(project, `${project.assembler.outBaseFilename}.map`);
}
exports.getOutputMapFileUri = getOutputMapFileUri;
function getOutputBinFileUri(project) {
    let ext;
    switch (project.assembler.outFiletype) {
        case types_1.FileType.KCC:
            ext = 'kcc';
            break;
        case types_1.FileType.PRG:
            ext = 'prg';
            break;
        default:
            ext = 'bin';
            break;
    }
    return getOutputFileUri(project, `${project.assembler.outBaseFilename}.${ext}`);
}
exports.getOutputBinFileUri = getOutputBinFileUri;
function getExtensionUri() {
    return vscode_1.extensions.getExtension('floooh.vscode-kcide').extensionUri;
}
exports.getExtensionUri = getExtensionUri;
//# sourceMappingURL=filesystem.js.map