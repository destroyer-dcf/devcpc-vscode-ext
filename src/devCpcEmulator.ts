'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findConfigFileInWorkspace, parseConfigFile, resolveConfigPath } from './configUtils';

interface EmulatorState {
    panel: vscode.WebviewPanel;
    ready: boolean;
}

let state: EmulatorState | null = null;
let lastAutoRunCommand: string | null = null;
let lastAutoRunAt = 0;
const AUTO_RUN_DEBOUNCE_MS = 2000;

function resolveCpcTypeArgFromConfig(): { typeArg?: string; warning?: string } {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return {};
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    const configPath = findConfigFileInWorkspace(rootPath);
    if (!configPath) {
        return {};
    }
    const config = parseConfigFile(configPath);
    const modelRaw = (config.CPC_MODEL || '').trim();

    if (!modelRaw || modelRaw === '6128') {
        return {};
    }
    if (modelRaw === '464') {
        return { typeArg: 'cpc464' };
    }
    if (modelRaw === '664') {
        return { warning: 'CPC_MODEL=664 no está soportado por este WASM; se usará 6128.' };
    }
    return { warning: `CPC_MODEL=${modelRaw} no válido (usa 464, 664 o 6128). Se usará 6128.` };
}

/**
 * Inicializar el emulador integrado CPC
 */
export async function initEmulator(context: vscode.ExtensionContext): Promise<void> {
    if (state) {
        // Ya existe, solo hacer foco
        state.panel.reveal(vscode.ViewColumn.Beside, true);
        return;
    }

    await setupEmulator(context);
}

/**
 * Configurar el WebView Panel con el emulador
 */
async function setupEmulator(context: vscode.ExtensionContext): Promise<void> {
    const mediaPath = vscode.Uri.file(path.join(context.extensionPath, 'media'));
    
    const panel = vscode.window.createWebviewPanel(
        'devcpc_emu',
        'DevCPC - Amstrad CPC',
        {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: true,
        },
        {
            enableScripts: true,
            enableForms: false,
            retainContextWhenHidden: true,
            localResourceRoots: [mediaPath],
        }
    );

    // Icono del panel
    panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'cpc-logo-small.png'));

    // Cleanup al cerrar
    panel.onDidDispose(() => {
        state = null;
    });

    // Recibir mensajes del emulador
    panel.webview.onDidReceiveMessage((msg) => {
        console.log('[DevCPC Emulator] Mensaje recibido:', msg);
        if (msg.command === 'emu_ready') {
            if (state) {
                state.ready = msg.isReady;
                console.log('[DevCPC Emulator] Estado ready:', state.ready);
                if (state.ready) {
                    vscode.window.showInformationMessage('Emulador CPC listo');
                }
            }
        } else if (msg.command === 'emu_error') {
            console.error('[DevCPC Emulator] Error:', msg.error);
            vscode.window.showErrorMessage(`Emulador: ${msg.error}`);
        } else if (msg.command === 'dsk_loaded_success') {
            console.log('[DevCPC Emulator] DSK cargado exitosamente:', msg.filename);
            vscode.window.showInformationMessage(`✓ DSK cargado exitosamente: ${msg.filename || 'disco'}`);
        } else if (msg.command === 'log') {
            console.log('[DevCPC Emulator] Log:', msg.text);
        }
    });

    // Cargar el HTML del emulador
    const emuUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'media', 'cpc-ui.js'))
    );
    const shellUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'media', 'shell.js'))
    );

    // Leer template HTML
    const shellHtmlPath = path.join(context.extensionPath, 'media', 'shell.html');
    let html = fs.readFileSync(shellHtmlPath, 'utf8');
    const modelSetup = resolveCpcTypeArgFromConfig();
    if (modelSetup.warning) {
        vscode.window.showWarningMessage(modelSetup.warning);
    }
    const emuArgsScript = modelSetup.typeArg
        ? `<script type="text/javascript">(function(){try{const u=new URL(window.location.href);u.searchParams.set('type','${modelSetup.typeArg}');history.replaceState(null,'',u.toString());}catch(_){}})();</script>`
        : '';
    
    // Reemplazar placeholders
    html = html
        .replace('{{{emu}}}', emuUri.toString())
        .replace('{{{shell}}}', shellUri.toString())
        .replace('{{{emuArgs}}}', emuArgsScript);
    
    panel.webview.html = html;

    state = { panel, ready: false };

    // Dar tiempo al webview para cargar y luego enviar comando de boot
    setTimeout(() => {
        if (state) {
            console.log('[DevCPC Emulator] Enviando comando boot al emulador');
            state.panel.webview.postMessage({ cmd: 'boot' });
            
            // Verificar estado después de otros 2 segundos
            setTimeout(() => {
                if (state && !state.ready) {
                    console.log('[DevCPC Emulator] Forzando estado ready...');
                    state.ready = true;
                }
            }, 2000);
            
            // Auto-cargar DSK/archivo si existe después de que el emulador esté listo
            setTimeout(async () => {
                try {
                    await autoLoadBinaryOnEmulatorOpen(context);
                } catch (error) {
                    console.error('[DevCPC Emulator] Error en auto-load:', error);
                }
            }, 2500);
        }
    }, 1000);
}

/**
 * Auto-cargar binario cuando se abre el emulador
 */
async function autoLoadBinaryOnEmulatorOpen(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        console.log('[DevCPC Emulator] No hay workspace folder');
        return;
    }
    
    const workspaceFolder = workspaceFolders[0];
    const configPath = findConfigFileInWorkspace(workspaceFolder.uri.fsPath);
    
    if (!configPath) {
        console.log('[DevCPC Emulator] No se encontró devcpc.conf en la raíz del workspace');
        return;
    }
    
    try {
        const config = parseConfigFile(configPath);

        let fileToLoad: string | undefined;
        const preferCdt = (config.CPC_MODEL || '').trim() === '464';
        const distDir = config.DIST_DIR ? resolveConfigPath(configPath, config.DIST_DIR) : undefined;

        if (preferCdt) {
            // Para CPC 464, priorizar cinta (CDT) sobre disco (DSK)
            if (distDir && config.CDT) {
                const cdtPath = path.join(distDir, config.CDT);
                if (fs.existsSync(cdtPath)) {
                    fileToLoad = cdtPath;
                    console.log('[DevCPC Emulator] Auto-carga (CPC 464): CDT encontrado:', fileToLoad);
                }
            }
            if (!fileToLoad && distDir && config.DSK) {
                const dskPath = path.join(distDir, config.DSK);
                if (fs.existsSync(dskPath)) {
                    fileToLoad = dskPath;
                    console.log('[DevCPC Emulator] Auto-carga (CPC 464): DSK fallback encontrado:', fileToLoad);
                }
            }
        } else {
            // Para 6128/664, mantener prioridad en DSK
            if (distDir && config.DSK) {
                const dskPath = path.join(distDir, config.DSK);
                if (fs.existsSync(dskPath)) {
                    fileToLoad = dskPath;
                    console.log('[DevCPC Emulator] Auto-carga: DSK encontrado:', fileToLoad);
                }
            }
            if (!fileToLoad && distDir && config.CDT) {
                const cdtPath = path.join(distDir, config.CDT);
                if (fs.existsSync(cdtPath)) {
                    fileToLoad = cdtPath;
                    console.log('[DevCPC Emulator] Auto-carga: CDT encontrado:', fileToLoad);
                }
            }
        }

        // 3. Buscar en OUTPUT_PATH
        if (!fileToLoad && config.OUTPUT_PATH) {
            const outputPath = resolveConfigPath(configPath, config.OUTPUT_PATH);

            if (fs.existsSync(outputPath)) {
                if (fs.statSync(outputPath).isDirectory()) {
                    const files = fs.readdirSync(outputPath);
                    const dskFile = files.find(f => f.endsWith('.dsk'));
                    const cdtFile = files.find(f => f.endsWith('.cdt'));
                    const binFile = files.find(f => f.endsWith('.bin'));
                    
                    const selectedFile = dskFile || cdtFile || binFile;
                    if (selectedFile) {
                        fileToLoad = path.join(outputPath, selectedFile);
                        console.log('[DevCPC Emulator] Auto-carga: Archivo encontrado:', fileToLoad);
                    }
                }
            }
        }

        if (fileToLoad) {
            console.log('[DevCPC Emulator] Cargando automáticamente:', fileToLoad);
            await loadBinaryInEmulator(fileToLoad);
            const emuInput = buildAutoInputFromRunFile(config.RUN_FILE);
            if (emuInput) {
                await new Promise(resolve => setTimeout(resolve, 400));
                sendInputToEmulator(emuInput);
            }
        } else {
            console.log('[DevCPC Emulator] No se encontró archivo para auto-cargar');
            const emuInput = buildAutoInputFromRunFile(config.RUN_FILE);
            if (emuInput) {
                await new Promise(resolve => setTimeout(resolve, 400));
                sendInputToEmulator(emuInput);
            }
        }
    } catch (error) {
        console.error('[DevCPC Emulator] Error en autoLoadBinaryOnEmulatorOpen:', error);
    }
}

function buildAutoInputFromRunFile(runFile?: string): string | undefined {
    if (!runFile) {
        return undefined;
    }
    const decoded = runFile
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
    const trimmed = decoded.trim();
    if (!trimmed) {
        return undefined;
    }

    // Permite comandos completos (ej: |cpm) en RUN_FILE.
    const isFullCommand = /^(\||run\b|call\b|load\b)/i.test(trimmed);
    const cmd = isFullCommand ? decoded : `run"${trimmed}`;
    return /[\r\n]$/.test(cmd) ? cmd : `${cmd}\n`;
}

/**
 * Cargar un archivo binario en el emulador
```
 */
export async function loadBinaryInEmulator(binPath: string): Promise<void> {
    console.log(`[DevCPC Emulator] loadBinaryInEmulator called with: ${binPath}`);
    console.log(`[DevCPC Emulator] State exists: ${!!state}, Ready: ${state?.ready}`);
    
    if (!state) {
        vscode.window.showWarningMessage('Emulador no está abierto. Ábrelo primero con "DevCPC: Open Integrated Emulator"');
        return;
    }

    // Si no está ready, esperar un poco más
    if (!state.ready) {
        console.log('[DevCPC Emulator] Emulador no está ready, esperando...');
        vscode.window.showInformationMessage('Esperando a que el emulador esté listo...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Intentar de nuevo
        if (!state.ready) {
            console.log('[DevCPC Emulator] Forzando carga aunque no esté ready');
            // Continuar de todas formas
        }
    }

    try {
        const ext = path.extname(binPath).toLowerCase();
        console.log('[DevCPC Emulator] Extension:', ext);
        
        // Validar formato soportado
        if (!['.bin', '.dsk', '.cdt', '.sna'].includes(ext)) {
            vscode.window.showErrorMessage(`Formato no soportado: ${ext}`);
            return;
        }

        // Verificar que el archivo existe
        if (!fs.existsSync(binPath)) {
            vscode.window.showErrorMessage(`Archivo no encontrado: ${binPath}`);
            return;
        }

        // Leer el archivo
        const fileData = fs.readFileSync(binPath);
        console.log(`[DevCPC Emulator] File size: ${fileData.length} bytes`);
        
        // Convertir a base64 (el emulador KC CPC espera base64)
        const dataBase64 = fileData.toString('base64');
        const fileName = path.basename(binPath);
        console.log(`[DevCPC Emulator] Base64 length: ${dataBase64.length}`);

        // Detectar si es archivo DSK para usar comando específico
        const isDsk = ext === '.dsk';
        const cmd = isDsk ? 'load_dsk' : 'load';
        
        console.log(`[DevCPC Emulator] Enviando comando '${cmd}' al emulador para ${fileName}`);
        
        if (isDsk) {
            console.log('[DevCPC Emulator] ════════════════════════════════════════════');
            console.log('[DevCPC Emulator] IMPORTANTE: Carga de archivo DSK');
            console.log('[DevCPC Emulator] ════════════════════════════════════════════');
            console.log('[DevCPC Emulator] Los archivos DSK requieren funciones WASM especiales');
            console.log('[DevCPC Emulator] Si no se carga correctamente:');
            console.log('[DevCPC Emulator]   1. Abre Developer Tools (Help → Toggle Developer Tools)');
            console.log('[DevCPC Emulator]   2. Ve a la pestaña Console');
            console.log('[DevCPC Emulator]   3. Busca mensajes de kcide_load_dsk');
            console.log('[DevCPC Emulator]   4. Ver DSK_SUPPORT.md para recompilar WASM');
            console.log('[DevCPC Emulator] ════════════════════════════════════════════');
        }
        
        state.panel.webview.postMessage({
            cmd,
            data: dataBase64
        });

        if (!isDsk) {
            vscode.window.showInformationMessage(`Cargado: ${fileName}`);
        }
        console.log(`[DevCPC Emulator] Archivo enviado al emulador: ${fileName} (${ext}) usando comando '${cmd}'`);
    } catch (error) {
        console.error('[DevCPC Emulator] Error:', error);
        vscode.window.showErrorMessage(`Error cargando archivo: ${error}`);
    }
}

export function sendInputToEmulator(text: string): void {
    if (!state) {
        return;
    }
    state.panel.webview.postMessage({
        cmd: 'input',
        text
    });
}

export function sendRunFileToEmulator(runFile?: string): void {
    const emuInput = buildAutoInputFromRunFile(runFile);
    if (emuInput) {
        const now = Date.now();
        if (lastAutoRunCommand === emuInput && (now - lastAutoRunAt) < AUTO_RUN_DEBOUNCE_MS) {
            console.log('[DevCPC Emulator] RUN_FILE auto-comando omitido (debounce):', JSON.stringify(emuInput));
            return;
        }
        lastAutoRunCommand = emuInput;
        lastAutoRunAt = now;
        sendInputToEmulator(emuInput);
    }
}

/**
 * Resetear el emulador
 */
export function resetEmulator(): void {
    if (!state) {
        vscode.window.showWarningMessage('Emulador no está abierto');
        return;
    }

    state.panel.webview.postMessage({ cmd: 'reset' });
    vscode.window.showInformationMessage('Emulador reseteado');
}

/**
 * Hacer foco en el emulador
 */
export function focusEmulator(): void {
    if (!state) {
        vscode.window.showWarningMessage('Emulador no está abierto');
        return;
    }

    state.panel.reveal(vscode.ViewColumn.Beside, false);
}

/**
 * Cerrar el emulador
 */
export function closeEmulator(): void {
    if (state) {
        state.panel.dispose();
        state = null;
    }
}

/**
 * Verificar si el emulador está activo
 */
export function isEmulatorActive(): boolean {
    return state !== null;
}
