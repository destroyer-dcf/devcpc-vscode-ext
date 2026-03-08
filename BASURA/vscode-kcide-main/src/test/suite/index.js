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
exports.run = void 0;
const path = require("path");
const mocha_1 = require("mocha");
const glob_1 = require("glob");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        // Create the mocha test
        const mocha = new mocha_1.default({
            ui: 'tdd',
            color: true
        });
        const testsRoot = path.resolve(__dirname, '..');
        const files = yield (0, glob_1.glob)('**/**.test.js', { cwd: testsRoot });
        // Add files to the test suite
        files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));
        try {
            return new Promise((c, e) => {
                // Run the mocha test
                mocha.run(failures => {
                    if (failures > 0) {
                        e(new Error(`${failures} tests failed.`));
                    }
                    else {
                        c();
                    }
                });
            });
        }
        catch (err) {
            console.error(err);
        }
    });
}
exports.run = run;
//# sourceMappingURL=index.js.map