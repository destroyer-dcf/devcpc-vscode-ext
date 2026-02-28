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
exports.addVic20TestCommand = void 0;
// helper command to run VIC20 VIA tests
const fibs__1_1 = require("jsr:@floooh/fibs@^1");
function addVic20TestCommand(c) {
    c.addCommand({ name: 'vic20-via-tests', help, run });
}
exports.addVic20TestCommand = addVic20TestCommand;
function help() {
    fibs__1_1.log.helpCmd([
        'vic20-via-tests',
        'vic20-via-tests [via1 via2 ...]',
    ], 'run vic20 via tests');
}
function run(p, args) {
    return __awaiter(this, void 0, void 0, function* () {
        const testDir = 'tests/vice-tests/VIC20/';
        const allTests = [
            'viavarious/via1.prg',
            'viavarious/via2.prg',
            'viavarious/via3.prg',
            'viavarious/via3a.prg',
            'viavarious/via4.prg',
            'viavarious/via4a.prg',
            'viavarious/via5.prg',
            'viavarious/via5a.prg',
            'viavarious/via9.prg',
            'viavarious/via10.prg',
            'viavarious/via11.prg',
            'viavarious/via12.prg',
            'viavarious/via13.prg',
        ];
        let tests;
        if (args.length === 1) {
            tests = allTests;
        }
        else {
            tests = allTests.filter((t) => {
                var _a;
                const filename = (_a = t.match(/viavarious\/(.+)\.prg$/)) === null || _a === void 0 ? void 0 : _a[1];
                return filename && args.slice(1).some((a) => filename === a);
            });
        }
        for (const test of tests) {
            const c = p.activeConfig();
            const path = `${p.dir()}/${testDir}/${test}`;
            yield c.runner.run(p, c, p.target('vic20-ui'), { args: ['exp=ram8k', `file=${path}`] });
        }
    });
}
//# sourceMappingURL=vic20-via-tests.js.map