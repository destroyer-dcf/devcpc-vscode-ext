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
exports.addC64TestCommand = void 0;
// helper command to run C64 tests
const fibs__1_1 = require("jsr:@floooh/fibs@^1");
function addC64TestCommand(c) {
    c.addCommand({ name: 'c64-wlspecial-tests', help, run });
}
exports.addC64TestCommand = addC64TestCommand;
function help() {
    fibs__1_1.log.helpCmd([
        'c64-wlspecial-tests',
        'c64-wlspecial-tests [irg imr ...]',
    ], 'run all or selected C64 tests');
}
function run(p, args) {
    return __awaiter(this, void 0, void 0, function* () {
        const testDir = 'tests/testsuite-2.15/bin/';
        const allTests = [
            'branchwrap',
            'cia1pb6',
            'cia1pb7',
            'cia1tab',
            'cia1tb123',
            'cia2pb6',
            'cia2pb7',
            'cia2tb123',
            'cntdef',
            'cnto2',
            'cpuport',
            'cputiming',
            'flipos',
            'icr01',
            'imr',
            'irq',
            'loadth',
            'mmu',
            'mmufetch',
            'nmi',
            'oneshot',
            'trap1',
            'trap2',
            'trap3',
            'trap4',
            'trap5',
            'trap6',
            'trap7',
            'trap8',
            'trap9',
            'trap10',
            'trap11',
            'trap12',
            'trap13',
            'trap14',
            'trap15',
            'trap16',
            'trap17',
        ];
        let tests;
        if (args.length === 1) {
            tests = allTests;
        }
        else {
            tests = allTests.filter((t) => args.slice(1).includes(t));
        }
        fibs__1_1.log.info(`# running tests ${tests.join(' ')}`);
        for (const test of tests) {
            const c = p.activeConfig();
            const path = `${p.dir()}/${testDir}/${test}`;
            yield c.runner.run(p, c, p.target('c64-ui'), { args: [`file=${path}`, 'input=RUN\r'] });
        }
    });
}
//# sourceMappingURL=c64-wlspecial-tests.js.map