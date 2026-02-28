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
exports.addNesTestLogJob = void 0;
// a fibs code generator to turn a NESTest log file into a C header
const fibs__1_1 = require("jsr:@floooh/fibs@^1");
const path__1_1 = require("jsr:@std/path@^1");
function addNesTestLogJob(c) {
    c.addJob({ name: 'nestestlog', help, validate, build });
}
exports.addNesTestLogJob = addNesTestLogJob;
;
const schema = {
    dir: { type: 'string', optional: true, desc: 'base dir of files to embed (default: target source dir)' },
    input: { type: 'string', optional: false, desc: 'the input nestestlog.txt file' },
    outHeader: { type: 'string', optional: false, desc: 'path of generated header file' },
};
function help() {
    fibs__1_1.log.helpJob('nestestlog', 'generate C header from nestest log file', schema);
}
function validate(args) {
    return fibs__1_1.util.validate(args, schema);
}
function build(_p, _c, t, args) {
    const { dir = t.dir, input, outHeader } = fibs__1_1.util.safeCast(args, schema);
    return {
        name: 'nestestlog',
        inputs: [`${dir}/${input}`],
        outputs: [`${dir}/${outHeader}`],
        addOutputsToTargetSources: true,
        args: { dir, input, outHeader },
        func: (inputs, outputs, _args) => __awaiter(this, void 0, void 0, function* () {
            if (!fibs__1_1.util.dirty(inputs, outputs)) {
                return;
            }
            fibs__1_1.log.info(`# nestestlog ${inputs[0]} => ${outputs[0]}`);
            const data = yield Deno.readTextFile(inputs[0]);
            const lines = data.split(/\r?\n/);
            fibs__1_1.util.ensureDir((0, path__1_1.dirname)(outputs[0]));
            let str = '';
            str += '// machine generated, do not edit!\n';
            str += '#include <stdint.h>\n';
            str += 'typedef struct {\n';
            str += '    const char* desc;\n';
            str += '    uint16_t PC;\n';
            str += '    uint8_t A,X,Y,P,S;\n';
            str += '} cpu_state;\n';
            str += 'cpu_state state_table[] = {\n';
            for (const line of lines) {
                if (line.trim().length > 0) {
                    const desc = line.slice(16, 48);
                    const pc = line.slice(0, 4);
                    const a = line.slice(50, 52);
                    const x = line.slice(55, 57);
                    const y = line.slice(60, 62);
                    const p = line.slice(65, 67);
                    const s = line.slice(71, 73);
                    str += `  { "${desc}", 0x${pc}, 0x${a}, 0x${x}, 0x${y}, 0x${p}, 0x${s} },\n`;
                }
            }
            str += '};\n';
            yield Deno.writeTextFile(outputs[0], str);
        }),
    };
}
//# sourceMappingURL=nestestlog.js.map