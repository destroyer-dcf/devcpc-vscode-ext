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
exports.loadSymbolMap = exports.loadSourceMap = exports.writeOutputFile = exports.assemble = exports.runAsmx = void 0;
const vscode_1 = require("vscode");
const types_1 = require("./types");
const filesystem_1 = require("./filesystem");
const wasi_1 = require("./wasi");
const filetypes_1 = require("./filetypes");
const diagnostics_1 = require("./diagnostics");
;
function runAsmx(ext, args) {
    return __awaiter(this, void 0, void 0, function* () {
        const wasiEnv = yield (0, wasi_1.requireWasiEnv)(ext);
        const process = yield wasiEnv.wasm.createProcess('asmx', wasiEnv.asmx, {
            rootFileSystem: wasiEnv.fs,
            stdio: {
                out: { kind: 'pipeOut' },
                err: { kind: 'pipeOut' },
            },
            args,
        });
        const decoder = new TextDecoder('utf-8');
        let stderr = '';
        let stdout = '';
        process.stderr.onData((data) => {
            stderr += decoder.decode(data);
        });
        process.stdout.onData((data) => {
            stdout += decoder.decode(data);
        });
        const exitCode = yield process.run();
        return { exitCode, stdout, stderr };
    });
}
exports.runAsmx = runAsmx;
function assemble(ext, project, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const { genListingFile, genObjectFile, genMapFile, saveAll = true } = options;
        if (saveAll) {
            vscode_1.workspace.saveAll(false);
        }
        yield (0, filesystem_1.ensureBuildDir)(project);
        const srcDirUri = (0, filesystem_1.getSourceDirUri)(project);
        if (!(yield (0, filesystem_1.dirExists)(srcDirUri))) {
            throw new Error(`Project source directory '${srcDirUri}' not found!`);
        }
        const mainSrcUri = (0, filesystem_1.getMainSourceUri)(project);
        if (!(yield (0, filesystem_1.fileExists)(mainSrcUri))) {
            throw new Error(`Project main file '${mainSrcUri}' not found!`);
        }
        const lstUri = (0, filesystem_1.getOutputListFileUri)(project);
        if (genListingFile) {
            try {
                yield vscode_1.workspace.fs.delete(lstUri);
            }
            catch (err) { }
            ;
        }
        const mapUri = (0, filesystem_1.getOutputMapFileUri)(project);
        if (genMapFile) {
            try {
                yield vscode_1.workspace.fs.delete(mapUri);
            }
            catch (err) { }
            ;
        }
        const objUri = (0, filesystem_1.getOutputObjectFileUri)(project);
        if (genObjectFile) {
            try {
                yield vscode_1.workspace.fs.delete(objUri);
            }
            catch (err) { }
            ;
        }
        const [wasmSrcDir, wasmMainSrcPath, wasmObjPath, wasmLstPath, wasmMapPath] = yield Promise.all([
            (0, filesystem_1.uriToWasmPath)(ext, srcDirUri),
            (0, filesystem_1.uriToWasmPath)(ext, mainSrcUri),
            (0, filesystem_1.uriToWasmPath)(ext, objUri),
            (0, filesystem_1.uriToWasmPath)(ext, lstUri),
            (0, filesystem_1.uriToWasmPath)(ext, mapUri),
        ]);
        const stdArgs = ['-w', '-e', '-i', wasmSrcDir, '-C', project.assembler.cpu, wasmMainSrcPath];
        const lstArgs = genListingFile ? ['-l', wasmLstPath] : [];
        const mapArgs = genMapFile ? ['-m', wasmMapPath] : [];
        const objArgs = genObjectFile ? ['-o', wasmObjPath] : [];
        const result = yield runAsmx(ext, [...lstArgs, ...mapArgs, ...objArgs, ...stdArgs]);
        const symbolMap = yield loadSymbolMap(project);
        let diagnostics = (0, diagnostics_1.updateDiagnostics)(project, result.stderr, symbolMap);
        return {
            listingUri: genListingFile ? lstUri : undefined,
            objectUri: genObjectFile ? objUri : undefined,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            diagnostics,
        };
    });
}
exports.assemble = assemble;
function writeOutputFile(project, hexUri, withAutoStart) {
    return __awaiter(this, void 0, void 0, function* () {
        const hexData = yield (0, filesystem_1.readTextFile)(hexUri);
        let data;
        if ((project.assembler.outFiletype === types_1.FileType.KCC) || (project.assembler.outFiletype === types_1.FileType.AMSDOS_BIN)) {
            const symbolMap = yield loadSymbolMap(project);
            const startAddr = symbolMap['_start'];
            if (startAddr === undefined) {
                throw new Error('No \'_start\' label found in project!');
            }
            if (project.assembler.outFiletype === types_1.FileType.KCC) {
                data = (0, filetypes_1.hexToKCC)(hexData, startAddr, withAutoStart);
            }
            else {
                data = (0, filetypes_1.hexToAmsDosBin)(hexData, startAddr);
            }
        }
        else if (project.assembler.outFiletype === types_1.FileType.PRG) {
            data = (0, filetypes_1.hexToPRG)(hexData);
        }
        else {
            throw new Error('Unknown output filetype');
        }
        const uri = (0, filesystem_1.getOutputBinFileUri)(project);
        yield (0, filesystem_1.writeBinaryFile)(uri, data);
        return uri;
    });
}
exports.writeOutputFile = writeOutputFile;
function loadSourceMap(project, fsRootLength) {
    return __awaiter(this, void 0, void 0, function* () {
        const map = {
            sourceToAddr: {},
            addrToSource: [],
        };
        const uri = (0, filesystem_1.getOutputMapFileUri)(project);
        const content = yield (0, filesystem_1.readTextFile)(uri);
        content.split('\n').forEach((line) => {
            const parts = line.trim().split(':');
            if (parts.length !== 3) {
                return;
            }
            // remove leading '/workspace/'
            const pathStr = parts[0].slice(fsRootLength);
            const lineNr = parseInt(parts[1]);
            const addr = parseInt(parts[2]);
            if (map.sourceToAddr[pathStr] === undefined) {
                map.sourceToAddr[pathStr] = [];
            }
            if (map.sourceToAddr[pathStr][lineNr] === undefined) {
                map.sourceToAddr[pathStr][lineNr] = addr;
            }
            map.addrToSource[addr] = { source: pathStr, line: lineNr };
        });
        return map;
    });
}
exports.loadSourceMap = loadSourceMap;
function loadSymbolMap(project) {
    return __awaiter(this, void 0, void 0, function* () {
        const uri = (0, filesystem_1.getOutputListFileUri)(project);
        const content = yield (0, filesystem_1.readTextFile)(uri);
        const lines = content.split('\n');
        const map = {};
        // only parse the symbol block at the end of file
        for (let i = lines.length - 2; i >= 0; i--) {
            const line = lines[i];
            if (line === '') {
                break;
            }
            const tokens = line.split(' ').filter((item) => (item !== '') && (item !== 'E'));
            let curSymbol;
            let curAddr;
            tokens.forEach((token) => {
                if (curSymbol === undefined) {
                    curSymbol = token.toLowerCase();
                }
                else if (curAddr === undefined) {
                    curAddr = parseInt(token, 16);
                }
                if ((curSymbol !== undefined) && (curAddr !== undefined)) {
                    map[curSymbol] = curAddr;
                    curSymbol = undefined;
                    curAddr = undefined;
                }
            });
        }
        return map;
    });
}
exports.loadSymbolMap = loadSymbolMap;
//# sourceMappingURL=assembler.js.map