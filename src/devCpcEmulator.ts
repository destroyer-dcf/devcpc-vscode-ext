'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface EmulatorState {
    panel: vscode.WebviewPanel;
    ready: boolean;
}

let state: EmulatorState | null = null;

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
    
    // Reemplazar placeholders
    html = html.replace('{{{emu}}}', emuUri.toString()).replace('{{{shell}}}', shellUri.toString());
    
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
        }
    }, 1000);
}

/**
 * Cargar un archivo binario en el emulador
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

        // Enviar al emulador usando el comando 'load' estándar de KC IDE
        // El emulador detecta automáticamente el tipo de archivo (DSK, CDT, SNA, etc.)
        console.log(`[DevCPC Emulator] Enviando comando load al emulador para ${fileName}`);
        state.panel.webview.postMessage({
            cmd: 'load',
            data: dataBase64
        });

        vscode.window.showInformationMessage(`Cargado: ${fileName}`);
        console.log(`[DevCPC Emulator] Archivo enviado al emulador: ${fileName} (${ext})`);
    } catch (error) {
        console.error('[DevCPC Emulator] Error:', error);
        vscode.window.showErrorMessage(`Error cargando archivo: ${error}`);
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
