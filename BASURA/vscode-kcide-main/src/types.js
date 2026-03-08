"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidFileType = exports.isValidSystem = exports.isValidCpu = exports.isValidString = exports.FileType = exports.System = exports.CPU = void 0;
var CPU;
(function (CPU) {
    CPU["Z80"] = "Z80";
    CPU["M6502"] = "6502";
})(CPU = exports.CPU || (exports.CPU = {}));
;
var System;
(function (System) {
    System["KC853"] = "KC85/3";
    System["KC854"] = "KC85/4";
    System["C64"] = "C64";
    System["CPC6128"] = "CPC6128";
})(System = exports.System || (exports.System = {}));
;
var FileType;
(function (FileType) {
    FileType["KCC"] = "KCC";
    FileType["PRG"] = "PRG";
    FileType["AMSDOS_BIN"] = "AMSDOS_BIN";
})(FileType = exports.FileType || (exports.FileType = {}));
;
function isValidString(val) {
    if (typeof val !== 'string') {
        return false;
    }
    if (val === '') {
        return false;
    }
    return true;
}
exports.isValidString = isValidString;
function isValidCpu(val) {
    return isValidString(val) && (Object.values(CPU).includes(val));
}
exports.isValidCpu = isValidCpu;
function isValidSystem(val) {
    return isValidString(val) && (Object.values(System).includes(val));
}
exports.isValidSystem = isValidSystem;
function isValidFileType(val) {
    return isValidString(val) && (Object.values(FileType).includes(val));
}
exports.isValidFileType = isValidFileType;
//# sourceMappingURL=types.js.map