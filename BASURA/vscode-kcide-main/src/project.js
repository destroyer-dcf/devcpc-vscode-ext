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
exports.loadProject = exports.requireProjectUri = exports.projectDefaults = void 0;
const vscode_1 = require("vscode");
const types_1 = require("./types");
const filesystem_1 = require("./filesystem");
exports.projectDefaults = {
    emulator: {
        system: types_1.System.KC854,
    },
    assembler: {
        srcDir: 'src',
        mainSourceFile: 'main.asm',
        cpu: types_1.CPU.Z80,
        outDir: 'build',
        outBaseFilename: 'out',
        outFiletype: types_1.FileType.KCC,
    }
};
function requireProjectUri() {
    if (vscode_1.workspace.workspaceFolders === undefined) {
        throw new Error('Please open a Folder!');
    }
    return vscode_1.workspace.workspaceFolders[0].uri;
}
exports.requireProjectUri = requireProjectUri;
function loadProject() {
    var _a, _b, _c, _d, _e, _f;
    return __awaiter(this, void 0, void 0, function* () {
        // may throw "please open a folder"
        const projectUri = requireProjectUri();
        const projectJsonUri = vscode_1.Uri.joinPath(projectUri, 'kcide.project.json');
        try {
            const projectJsonContent = yield (0, filesystem_1.readTextFile)(projectJsonUri);
            const anyProject = JSON.parse(projectJsonContent);
            const system = (0, types_1.isValidSystem)((_a = anyProject.emulator) === null || _a === void 0 ? void 0 : _a.system)
                ? anyProject.emulator.system
                : exports.projectDefaults.emulator.system;
            const srcDir = (0, types_1.isValidString)((_b = anyProject.assembler) === null || _b === void 0 ? void 0 : _b.srcDir)
                ? anyProject.assembler.srcDir
                : exports.projectDefaults.assembler.srcDir;
            const mainSourceFile = (0, types_1.isValidString)((_c = anyProject.assembler) === null || _c === void 0 ? void 0 : _c.mainSourceFile)
                ? anyProject.assembler.mainSourceFile
                : exports.projectDefaults.assembler.mainSourceFile;
            const cpu = (0, types_1.isValidCpu)(anyProject.assembler.cpu)
                ? anyProject.assembler.cpu
                : exports.projectDefaults.assembler.cpu;
            const outDir = (0, types_1.isValidString)((_d = anyProject.assembler) === null || _d === void 0 ? void 0 : _d.outDir)
                ? anyProject.assembler.outDir
                : exports.projectDefaults.assembler.outDir;
            const outBaseFilename = (0, types_1.isValidString)((_e = anyProject.assembler) === null || _e === void 0 ? void 0 : _e.outBaseFilename)
                ? anyProject.assembler.outBaseFilename
                : exports.projectDefaults.assembler.outBaseFilename;
            const outFiletype = (0, types_1.isValidFileType)((_f = anyProject.assembler) === null || _f === void 0 ? void 0 : _f.outFiletype)
                ? anyProject.assembler.outFiletype
                : exports.projectDefaults.assembler.outFiletype;
            return {
                uri: projectUri,
                emulator: { system },
                assembler: { srcDir, mainSourceFile, cpu, outDir, outBaseFilename, outFiletype },
            };
        }
        catch (err) {
            // no or invalid kcide.project.json: return default project settings
            vscode_1.window.showWarningMessage('Please create a kcide.project.json file!');
            return Object.assign({ uri: projectUri }, exports.projectDefaults);
        }
    });
}
exports.loadProject = loadProject;
//# sourceMappingURL=project.js.map