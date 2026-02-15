"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDiagnostics = void 0;
const vscode_1 = require("vscode");
let diagnosticCollection = null;
function requireDiagnosticCollection() {
    if (diagnosticCollection === null) {
        diagnosticCollection = vscode_1.languages.createDiagnosticCollection('kcide');
    }
    return diagnosticCollection;
}
function clearDiagnostics() {
    const diagnostics = requireDiagnosticCollection();
    diagnostics.clear();
}
function updateDiagnostics(project, stderr, symbolMap) {
    clearDiagnostics();
    const diagnostics = requireDiagnosticCollection();
    const diagnosticsInfo = parseDiagnostics(project.uri, stderr);
    if (diagnosticsInfo.numErrors === 0) {
        // check that the project has a '_start' label, only do this when there
        // are no other errors, otherwise the 'missing _start label' error would
        // also trigger even there's a _start label, which is quite confusing
        if (symbolMap['_start'] === undefined) {
            diagnosticsInfo.numErrors += 1;
            diagnosticsInfo.diagnostics = [
                ...diagnosticsInfo.diagnostics,
                [
                    vscode_1.Uri.joinPath(project.uri, project.assembler.srcDir, project.assembler.mainSourceFile),
                    [new vscode_1.Diagnostic(new vscode_1.Range(0, 0, 0, 255), 'Project is missing a \'_start\' label', vscode_1.DiagnosticSeverity.Error)],
                ]
            ];
        }
    }
    diagnostics.set(diagnosticsInfo.diagnostics);
    return diagnosticsInfo;
}
exports.updateDiagnostics = updateDiagnostics;
function parseDiagnostics(projectUri, stderr) {
    const pathPrefix = projectUri.path;
    let numErrors = 0;
    let numWarnings = 0;
    const diagnostics = stderr.split('\n').filter((line) => (line.includes('*** Error:') || line.includes('*** Warning:'))).map((item) => {
        const parts = item.split(':');
        const srcPath = parts[0].replace('/workspace', pathPrefix);
        const lineNr = Number(parts[1]) - 1;
        const type = parts[2];
        const msg = parts[3].slice(2, -4);
        const severity = type === ' *** Error' ? vscode_1.DiagnosticSeverity.Error : vscode_1.DiagnosticSeverity.Warning;
        if (severity === vscode_1.DiagnosticSeverity.Error) {
            numErrors += 1;
        }
        else {
            numWarnings += 1;
        }
        return [vscode_1.Uri.file(srcPath), [new vscode_1.Diagnostic(new vscode_1.Range(lineNr, 0, lineNr, 256), msg, severity)]];
    });
    return { diagnostics, numErrors, numWarnings };
}
//# sourceMappingURL=diagnostics.js.map